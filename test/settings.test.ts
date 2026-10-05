import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ompss from "../index.ts";
import { loadRegistry } from "../config.ts";

const processes = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), execFile: vi.fn(), exec: vi.fn() }));
vi.mock("node:child_process", () => processes);
vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...original,
		open: vi.fn(original.open),
		readFile: vi.fn(original.readFile),
		rename: vi.fn(original.rename),
	};
});

let root: string;
let registry: string;
let display: string;
const yaml = "version: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\nagents: {}\n";

beforeEach(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "ompss-settings-ui-"));
	registry = join(root, "agents.yaml");
	display = join(root, "config", "pi-subagents", "config.json");
	await fs.writeFile(registry, yaml);
	vi.stubEnv("OMPSS_CHILD", "");
	vi.stubEnv("OMPSS_REGISTRY", registry);
	vi.stubEnv("PI_CODING_AGENT_DIR", join(root, "agent"));
	vi.stubEnv("XDG_CONFIG_HOME", join(root, "config"));
	vi.clearAllMocks();
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(root, { recursive: true, force: true });
});

function load() {
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	const tools: Array<Parameters<ExtensionAPI["registerTool"]>[0]> = [];
	const pi = {
		registerCommand: (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) =>
			commands.set(name, command),
		registerTool: (tool: Parameters<ExtensionAPI["registerTool"]>[0]) => tools.push(tool),
		on: vi.fn(),
		registerEntryRenderer: vi.fn(),
		appendEntry: vi.fn(),
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
	};
	ompss(pi as unknown as ExtensionAPI);
	return { commands, tools, pi };
}

function context(mode: "tui" | "rpc" | "print" | "json" = "tui", hasUI = true) {
	const ui = {
		select: vi.fn<ExtensionCommandContext["ui"]["select"]>().mockResolvedValue("Done"),
		input: vi.fn<ExtensionCommandContext["ui"]["input"]>(),
		confirm: vi.fn<ExtensionCommandContext["ui"]["confirm"]>(),
		notify: vi.fn(),
		custom: vi.fn(),
		setWidget: vi.fn(),
		setStatus: vi.fn(),
	};
	return { mode, hasUI, cwd: root, ui, sessionManager: { getSessionId: () => "settings-session" } };
}

async function run(ctx: ReturnType<typeof context>, args = "") {
	const extension = load();
	const command = extension.commands.get("subagents-settings");
	expect(command, "the command must be registered").toBeDefined();
	await command!.handler(args, ctx as unknown as ExtensionCommandContext);
	expect(extension.pi.appendEntry).not.toHaveBeenCalled();
	expect(extension.pi.sendMessage).not.toHaveBeenCalled();
	expect(extension.pi.sendUserMessage).not.toHaveBeenCalled();
	for (const spy of Object.values(processes)) expect(spy).not.toHaveBeenCalled();
	expect(ctx.ui.custom).not.toHaveBeenCalled();
	return extension;
}

function edit(ctx: ReturnType<typeof context>, index: number, answer: string | undefined, confirmed = true) {
	ctx.ui.select.mockImplementationOnce(async (_title, items) => items[index]);
	ctx.ui.input.mockResolvedValueOnce(answer);
	ctx.ui.confirm.mockResolvedValueOnce(confirmed);
}

describe("/subagents-settings", () => {
	it("registers the operator command with no I/O and no model-callable settings action", () => {
		const extension = load();
		expect([...extension.commands.keys()]).toEqual(["ompss", "subagents-settings"]);
		expect(extension.tools.map((tool) => tool.name)).toEqual(["ompss"]);
		expect((extension.tools[0].parameters as any).properties.action.enum).toEqual(["list", "run", "status", "cancel"]);
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});

	it.each(["tui", "rpc"] as const)("shows current values and save destinations in %s dialogs", async (mode) => {
		const ctx = context(mode);
		await run(ctx);
		const menu = ctx.ui.select.mock.calls[0];
		expect(menu[0]).toContain(registry);
		expect(menu[0]).toContain(display);
		expect(menu[1]).toEqual([
			"Maximum nesting depth: 3 (root depth 0)",
			"Parallel direct children per parent: 4",
			"Visible agents: 4",
			"Done",
		]);
	});

	it.each(["print", "json", "rpc"] as const)("refuses unavailable UI in %s before reading files", async (mode) => {
		const ctx = context(mode, false);
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/requires.*UI|dialogs/i), "error");
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
		expect(ctx.ui.select).not.toHaveBeenCalled();
	});

	it("rejects extra syntax before any file access", async () => {
		const ctx = context();
		await run(ctx, "extra");
		expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /subagents-settings", "warning");
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});

	it("accepts depth zero after confirmation and preserves concurrency", async () => {
		const ctx = context();
		edit(ctx, 0, "0");
		await run(ctx);
		expect((await loadRegistry(registry)).limits).toEqual({ maxDepth: 0, maxConcurrentRuns: 4 });
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain(registry);
		expect(ctx.ui.confirm.mock.calls[0][1]).toMatch(/multiply.*process.*provider/i);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/saved/i), "info");
	});

	it("saves parallel direct children to the selected registry", async () => {
		const ctx = context();
		edit(ctx, 1, " 2 ");
		await run(ctx);
		expect((await loadRegistry(registry)).limits).toEqual({ maxDepth: 3, maxConcurrentRuns: 2 });
		await expect(fs.stat(join(root, "agent", "om-pi-subagents.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("saves visible agents separately and keeps todo and Pi settings untouched", async () => {
		const todo = join(root, "config", "pi-todo", "config.json");
		await fs.mkdir(join(root, "config", "pi-todo"), { recursive: true });
		await fs.writeFile(todo, '{"maxWidgetLines":9,"mode":"openspec"}');
		const ctx = context();
		edit(ctx, 2, "2");
		await run(ctx);
		expect(JSON.parse(await fs.readFile(display, "utf8"))).toEqual({ maxVisibleAgents: 2 });
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect(await fs.readFile(todo, "utf8")).toBe('{"maxWidgetLines":9,"mode":"openspec"}');
		await expect(fs.stat(join(root, "agent", "settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it.each([undefined, "decline"])("leaves files unchanged after cancellation: %s", async (choice) => {
		const ctx = context();
		edit(ctx, 0, choice === undefined ? undefined : "2", false);
		await run(ctx);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect(fs.rename).not.toHaveBeenCalled();
		await expect(fs.stat(display)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps earlier confirmed saves when a later edit is cancelled", async () => {
		const ctx = context();
		edit(ctx, 0, "2");
		edit(ctx, 1, undefined);
		await run(ctx);
		expect((await loadRegistry(registry)).limits).toEqual({ maxDepth: 2, maxConcurrentRuns: 4 });
	});

	it.each(["-1", "1.5", "1e2", "+2", "", "NaN", "9007199254740992"])(
		"rejects invalid depth syntax %j",
		async (answer) => {
			const ctx = context();
			edit(ctx, 0, answer);
			await run(ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/whole number/i), "error");
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
			expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		},
	);

	it.each([
		[1, "0"],
		[2, "0"],
		[2, "257"],
	])("rejects out-of-range field %s value %s", async (index, answer) => {
		const ctx = context();
		edit(ctx, index as number, answer as string);
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/whole number/i), "error");
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});

	it("creates a missing registry only after explicit confirmation", async () => {
		await fs.unlink(registry);
		const ctx = context();
		edit(ctx, 0, "2");
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0][1]).toMatch(/create.*registry/i);
		expect((await loadRegistry(registry)).agents.size).toBe(0);
		expect((await loadRegistry(registry)).limits.maxDepth).toBe(2);
	});

	it("leaves a missing registry absent when confirmation is declined", async () => {
		await fs.unlink(registry);
		const ctx = context();
		edit(ctx, 1, "2", false);
		await run(ctx);
		await expect(fs.stat(registry)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("reports malformed YAML without overwriting it", async () => {
		await fs.writeFile(registry, "version: [");
		const ctx = context();
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/fix.*registry/i), "error");
		expect(ctx.ui.select).not.toHaveBeenCalled();
		expect(await fs.readFile(registry, "utf8")).toBe("version: [");
	});

	it("contains save failures and reports no success", async () => {
		const ctx = context();
		edit(ctx, 0, "2");
		vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic write failure"));
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/write failure/i), "error");
		expect(ctx.ui.notify.mock.calls.some(([message, level]) => level === "info" && /saved/i.test(message))).toBe(false);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
	});

	it("rejects edits made during confirmation and asks the operator to reopen", async () => {
		const ctx = context();
		edit(ctx, 0, "2");
		const newer = yaml.replace("maxConcurrentRuns: 4", "maxConcurrentRuns: 6");
		ctx.ui.confirm.mockReset().mockImplementationOnce(async () => {
			await fs.writeFile(registry, newer);
			return true;
		});
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/reopen settings/i), "error");
		expect(await fs.readFile(registry, "utf8")).toBe(newer);
	});
});
