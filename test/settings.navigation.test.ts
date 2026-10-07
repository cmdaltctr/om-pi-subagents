import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRegistry, type UiSettings } from "../src/config.ts";
import { registerOmpsSettings } from "../src/settings.ts";
import { readLimitSettings, saveUiSetting } from "../src/settings-persistence.ts";
import { createUiSettings } from "../src/ui-settings.ts";

vi.mock("node:fs/promises", async (original) => {
	const actual = await original<typeof import("node:fs/promises")>();
	return { ...actual, rename: vi.fn(actual.rename) };
});
let root: string;
let path: string;
const yaml = "# retained\nversion: 1\nlimits: { maxDepth: 2 }\nagents: {}\n";
beforeEach(async () => {
	vi.clearAllMocks();
	root = await fs.mkdtemp(join(tmpdir(), "omps-navigation-settings-"));
	path = join(root, "config.yaml");
	await fs.writeFile(path, yaml);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});
function harness() {
	const cache = createUiSettings(path, join(root, "legacy.json"));
	const repaintValues: UiSettings[] = [];
	const reset = vi.fn();
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	registerOmpsSettings(
		{
			registerCommand: (name: string, options: Parameters<ExtensionAPI["registerCommand"]>[1]) =>
				commands.set(name, options),
		} as unknown as ExtensionAPI,
		() => ({
			registryPath: path,
			ui: cache,
			activeKeys: () => ({ ...cache.value, navigationDownKey: "down", navigationUpKey: "off" }),
			onDisplayChanged: () => repaintValues.push(cache.value),
			onFleetViewSaved: reset,
		}),
	);
	const ui = {
		select: vi.fn<ExtensionCommandContext["ui"]["select"]>().mockResolvedValue("Done"),
		input: vi.fn<ExtensionCommandContext["ui"]["input"]>(),
		confirm: vi.fn<ExtensionCommandContext["ui"]["confirm"]>().mockResolvedValue(true),
		notify: vi.fn(),
	};
	const ctx = { hasUI: true, mode: "tui", ui } as unknown as ExtensionCommandContext;
	const run = () => commands.get("omps-settings")!.handler("", ctx);
	const choose = (label: string, choice: string | undefined) => {
		ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith(label)));
		ui.select.mockResolvedValueOnce(choice);
	};
	const key = (label: string, answer: string | undefined) => {
		ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith(label)));
		ui.input.mockResolvedValueOnce(answer);
	};
	return { cache, ui, run, choose, key, repaintValues, reset };
}

describe("management settings", () => {
	it("saves Hide then Show with refreshed repaint values, preserving tree and limits", async () => {
		const h = harness();
		h.choose("Management list", "Hide");
		await h.run();
		expect(h.ui.select.mock.calls[1][1]).toEqual(["Show", "Hide"]);
		expect(h.cache.value.showManagementList).toBe(false);
		expect(h.repaintValues.at(-1)?.showManagementList).toBe(false);
		expect(h.reset).not.toHaveBeenCalled();
		expect((await loadRegistry(path)).ui.fleetView).toBe("expanded");
		expect((await loadRegistry(path)).limits.maxDepth).toBe(2);
		expect(await fs.readFile(path, "utf8")).toContain("# retained");
		h.choose("Management list", "Show");
		await h.run();
		expect(h.repaintValues.at(-1)?.showManagementList).toBe(true);
		expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
	});

	it.each(["cancel", "decline", "revision", "write"])("retains confirmed display on %s", async (failure) => {
		const h = harness();
		h.choose("Management list", failure === "cancel" ? undefined : "Hide");
		if (failure === "decline") h.ui.confirm.mockResolvedValueOnce(false);
		if (failure === "revision")
			h.ui.confirm.mockImplementationOnce(async () => {
				await fs.writeFile(path, yaml + "# external\n");
				return true;
			});
		if (failure === "write") vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic write failure"));
		await h.run();
		expect(h.cache.value.showManagementList).toBe(true);
		expect(h.repaintValues.every((value) => value.showManagementList)).toBe(true);
		if (["write", "revision"].includes(failure))
			expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/write failure|reopen settings/i), "error");
		expect((await fs.readdir(root)).filter((name) => /\.tmp$|\.lock$/.test(name))).toEqual([]);
		expect(await fs.readFile(path, "utf8")).toBe(failure === "revision" ? yaml + "# external\n" : yaml);
	});

	it("caches all new fields and retains a confirmed snapshot after invalid refresh", async () => {
		const h = harness();
		await fs.writeFile(
			path,
			yaml + "ui: { showManagementList: false, navigationDownKey: ctrl+shift+down, navigationUpKey: off }\n",
		);
		await h.cache.refresh();
		const confirmed = h.cache.value;
		expect(confirmed).toMatchObject({
			showManagementList: false,
			navigationDownKey: "ctrl+shift+down",
			navigationUpKey: "off",
		});
		await fs.writeFile(path, yaml + "ui: { showManagementList: wrong }\n");
		expect((await h.cache.refresh()).diagnostics.join(" ")).toContain("ui.showManagementList");
		expect(h.cache.value).toBe(confirmed);
	});

	it("saves navigation keys with reload guidance and shows the active pair", async () => {
		const h = harness();
		h.key("Management next / enter key", "ctrl+shift+down");
		h.key("Management previous key", "ctrl+shift+up");
		await h.run();
		expect((await loadRegistry(path)).ui).toMatchObject({
			navigationDownKey: "ctrl+shift+down",
			navigationUpKey: "ctrl+shift+up",
		});
		expect(h.ui.select.mock.calls.at(-1)?.[1]).toEqual(
			expect.arrayContaining([
				"Fleet view shortcut: off",
				"Management next / enter key: ctrl+shift+down (active down; /reload to apply)",
				"Management previous key: ctrl+shift+up (active off; /reload to apply)",
			]),
		);
		expect(h.ui.confirm.mock.calls.every(([, text]) => text.includes("/reload"))).toBe(true);
	});

	it.each(["tab", "ctrl+i", "wrong", "up", "alt+ctrl+p"])(
		"rejects unsafe/duplicate next key %s before confirmation",
		async (key) => {
			await fs.writeFile(path, yaml + "ui: { inspectKey: ctrl+alt+p }\n");
			const h = harness();
			h.key("Management next / enter key", key);
			await h.run();
			expect(h.ui.confirm).not.toHaveBeenCalled();
			expect(h.ui.notify).toHaveBeenCalledWith(
				expect.stringMatching(/ui\.navigationDownKey.*unsafe|ui\.navigationDownKey.*specification|duplicate/),
				"error",
			);
			expect(fs.rename).not.toHaveBeenCalled();
		},
	);

	it.each(["cancel", "decline", "revision", "write"])("retains confirmed navigation on %s", async (failure) => {
		const h = harness();
		h.key("Management next / enter key", failure === "cancel" ? undefined : "ctrl+shift+down");
		if (failure === "decline") h.ui.confirm.mockResolvedValueOnce(false);
		if (failure === "revision")
			h.ui.confirm.mockImplementationOnce(async () => {
				await fs.writeFile(path, yaml + "# external\n");
				return true;
			});
		if (failure === "write") vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic write failure"));
		await h.run();
		expect(h.cache.value.navigationDownKey).toBe("down");
		expect(await fs.readFile(path, "utf8")).toBe(failure === "revision" ? yaml + "# external\n" : yaml);
		if (["write", "revision"].includes(failure))
			expect(h.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/write failure|reopen settings/i), "error");
	});

	it("saves both navigation actions off independently", async () => {
		const h = harness();
		h.key("Management next / enter key", "off");
		h.key("Management previous key", "off");
		await h.run();
		expect((await loadRegistry(path)).ui).toMatchObject({ navigationDownKey: "off", navigationUpKey: "off" });
	});

	it("validates boolean values and duplicate navigation during atomic saves", async () => {
		await expect(saveUiSetting(await readLimitSettings(path), "showManagementList", "false")).rejects.toThrow(
			/boolean/,
		);
		await saveUiSetting(await readLimitSettings(path), "showManagementList", false);
		await saveUiSetting(await readLimitSettings(path), "navigationDownKey", "ctrl+shift+down");
		const before = await fs.readFile(path, "utf8");
		await expect(saveUiSetting(await readLimitSettings(path), "navigationUpKey", "shift+ctrl+down")).rejects.toThrow(
			/duplicate/,
		);
		expect(await fs.readFile(path, "utf8")).toBe(before);
	});
});
