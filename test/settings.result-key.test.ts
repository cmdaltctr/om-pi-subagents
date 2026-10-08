import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRegistry } from "../src/config.ts";
import { registerOmpsSettings } from "../src/settings.ts";
import { createUiSettings } from "../src/ui-settings.ts";

let root: string;
let path: string;
const yaml = "# retained\nversion: 1\nlimits: { maxDepth: 2 }\nagents: {}\n";
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-result-settings-"));
	path = join(root, "config.yaml");
	await writeFile(path, yaml);
});
afterEach(async () => rm(root, { recursive: true, force: true }));

function harness(command = "omps-settings") {
	const cache = createUiSettings(path, join(root, "legacy.json"));
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	registerOmpsSettings(
		{
			registerCommand: (name: string, options: Parameters<ExtensionAPI["registerCommand"]>[1]) =>
				commands.set(name, options),
		} as unknown as ExtensionAPI,
		() => ({
			registryPath: path,
			ui: cache,
			activeKeys: () => ({ ...cache.value, resultKey: "off" }),
		}),
	);
	const ui = {
		select: vi.fn<ExtensionCommandContext["ui"]["select"]>().mockResolvedValue("Done"),
		input: vi.fn<ExtensionCommandContext["ui"]["input"]>(),
		confirm: vi.fn<ExtensionCommandContext["ui"]["confirm"]>().mockResolvedValue(true),
		notify: vi.fn(),
	};
	const ctx = { hasUI: true, ui } as unknown as ExtensionCommandContext;
	const run = () => commands.get(command)!.handler("", ctx);
	const edit = (answer: string | undefined) => {
		ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith("Result shortcut")));
		ui.input.mockResolvedValueOnce(answer);
	};
	return { cache, ui, run, edit };
}

describe("result shortcut settings", () => {
	it.each(["omps-settings", "subagents-settings"])("appends the result item in /%s", async (command) => {
		const h = harness(command);
		await h.run();
		expect(h.ui.select.mock.calls[0][1]).toEqual([
			"Maximum nesting depth: 2 (root depth 0)",
			"Parallel direct children per parent: 1",
			"Visible agents: 5 (default)",
			"Fleet view: expanded",
			"Fleet view shortcut: off",
			"Inspection shortcut: off",
			"Management list: Show",
			"Management next / enter key: down",
			"Management previous key: up",
			"Result shortcut: ctrl+shift+e (active off; /reload to apply)",
			"Agent capabilities",
			"Done",
		]);
	});

	it.each(["off", "alt+r"])("saves confirmed resultKey %s and requests reload", async (key) => {
		const h = harness();
		h.edit(key);
		await h.run();
		expect(h.ui.input.mock.calls[0][1]).toBe("ctrl+shift+e");
		expect(h.ui.confirm.mock.calls[0][1]).toContain(path);
		expect(h.ui.confirm.mock.calls[0][1]).toContain("/reload");
		expect((await loadRegistry(path)).ui.resultKey).toBe(key);
		expect(h.cache.value.resultKey).toBe(key);
		expect((await loadRegistry(path)).limits.maxDepth).toBe(2);
		expect(await readFile(path, "utf8")).toContain("# retained");
		expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/saved.*\/reload/i), "info");
	});

	it.each(["tab", "ctrl+i", "Ctrl+E", "up", "alt+ctrl+r"])(
		"rejects invalid or duplicate %s before confirmation",
		async (key) => {
			const before = yaml + "ui: { inspectKey: ctrl+alt+r }\n";
			await writeFile(path, before);
			const h = harness();
			h.edit(key);
			await h.run();
			// Settings input converts "Ctrl+E" to ctrl+e, which Pi already binds, so the conflict check rejects it.
			expect(h.ui.notify).toHaveBeenCalledWith(
				expect.stringMatching(/ui\.resultKey.*(?:unsafe|specification|duplicate)|bound to a built-in action/),
				"error",
			);
			expect(h.ui.confirm).not.toHaveBeenCalled();
			expect(await readFile(path, "utf8")).toBe(before);
		},
	);

	it.each(["cancel", "decline"])("keeps the saved result key after %s", async (kind) => {
		const h = harness();
		h.edit(kind === "cancel" ? undefined : "off");
		if (kind === "decline") h.ui.confirm.mockResolvedValueOnce(false);
		await h.run();
		expect(await readFile(path, "utf8")).toBe(yaml);
		expect(h.cache.value.resultKey).toBe("ctrl+shift+e");
	});
});
