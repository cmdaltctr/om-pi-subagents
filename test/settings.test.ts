import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as capabilities from "../src/capabilities.ts";
import omps from "../src/index.ts";
import { loadRegistry } from "../src/config.ts";
import { registerOmpsSettings } from "../src/settings.ts";
import { createUiSettings } from "../src/ui-settings.ts";
import { registerViewShortcuts } from "../src/shortcuts.ts";

const bindings = vi.hoisted(() => ({ resolved: {} as Record<string, unknown> }));
vi.mock("@earendil-works/pi-tui", async (importOriginal) => ({
	...(await importOriginal<typeof import("@earendil-works/pi-tui")>()),
	getKeybindings: () => ({ getResolvedBindings: () => bindings.resolved }),
}));

const processes = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), execFile: vi.fn(), exec: vi.fn() }));
vi.mock("node:child_process", () => processes);
vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...original,
		open: vi.fn(original.open),
		readFile: vi.fn(original.readFile),
		realpath: vi.fn(original.realpath),
		stat: vi.fn(original.stat),
		rename: vi.fn(original.rename),
	};
});

let root: string;
let registry: string;
let display: string;
const yaml = "version: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\nagents: {}\n";

beforeEach(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "omps-settings-ui-"));
	registry = join(root, "agents.yaml");
	display = join(root, "config", "pi-subagents", "config.json");
	await fs.writeFile(registry, yaml);
	vi.stubEnv("OMPS_CHILD", "");
	vi.stubEnv("OMPS_REGISTRY", registry);
	vi.stubEnv("PI_CODING_AGENT_DIR", join(root, "agent"));
	vi.stubEnv("XDG_CONFIG_HOME", join(root, "config"));
	vi.clearAllMocks();
	bindings.resolved = {};
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
		registerMessageRenderer: vi.fn(),
		appendEntry: vi.fn(),
		sendMessage: vi.fn(),
		sendUserMessage: vi.fn(),
	};
	omps(pi as unknown as ExtensionAPI);
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

async function run(ctx: ReturnType<typeof context>, args = "", command = "omps-settings") {
	const extension = load();
	const handler = extension.commands.get(command);
	expect(handler, `${command} must be registered`).toBeDefined();
	await handler!.handler(args, ctx as unknown as ExtensionCommandContext);
	expect(extension.pi.appendEntry).not.toHaveBeenCalled();
	expect(extension.pi.sendMessage).not.toHaveBeenCalled();
	expect(extension.pi.sendUserMessage).not.toHaveBeenCalled();
	for (const spy of Object.values(processes)) expect(spy).not.toHaveBeenCalled();
	expect(ctx.ui.custom).not.toHaveBeenCalled();
	return extension;
}

/** Pick a menu item by substring and answer its input dialog. */
function pick(ctx: ReturnType<typeof context>, needle: string, answer: string | undefined, confirmed = true) {
	ctx.ui.select.mockImplementationOnce(
		async (_title, items) => items.find((item) => item.includes(needle)) ?? items[items.length - 1],
	);
	ctx.ui.input.mockResolvedValueOnce(answer);
	ctx.ui.confirm.mockResolvedValueOnce(confirmed);
}

/** Select an item that performs no input dialog, such as the legacy import. */
function choose(ctx: ReturnType<typeof context>, needle: string, confirmed = true) {
	ctx.ui.select.mockImplementationOnce(
		async (_title, items) => items.find((item) => item.includes(needle)) ?? items[items.length - 1],
	);
	ctx.ui.confirm.mockResolvedValueOnce(confirmed);
}

describe("settings commands", () => {
	it("registers OMPS settings without old-acronym commands or file access", () => {
		const extension = load();
		expect([...extension.commands.keys()]).toEqual(["omps", "omps-settings", "subagents-settings"]);
		expect(extension.tools.map((tool) => tool.name)).toEqual(["omps"]);
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});

	it.each(["omps-settings", "subagents-settings"])("%s opens the OMPS settings dialog", async (command) => {
		const ctx = context();
		await run(ctx, "", command);
		expect(ctx.ui.select.mock.calls[0][0]).toMatch(/^OMPS settings\n/);
		expect(ctx.ui.select.mock.calls[0][0]).toContain(registry);
	});

	it("registers the canonical command and its alias with no I/O and no model-callable settings action", () => {
		const extension = load();
		expect([...extension.commands.keys()]).toEqual(["omps", "omps-settings", "subagents-settings"]);
		expect(extension.tools.map((tool) => tool.name)).toEqual(["omps"]);
		expect((extension.tools[0].parameters as any).properties.action.enum).toEqual(["list", "run", "status", "cancel"]);
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});

	it.each(["omps-settings", "subagents-settings"] as const)(
		"%s shows the same menu and destination",
		async (command) => {
			const ctx = context();
			await run(ctx, "", command);
			const menu = ctx.ui.select.mock.calls[0];
			expect(menu[0]).toContain(registry);
			expect(menu[1]).toEqual([
				"Maximum nesting depth: 3 (root depth 0)",
				"Parallel direct children per parent: 4",
				"Visible agents: 5 (default)",
				"Fleet view: expanded",
				"Fleet view shortcut: off",
				"Inspection shortcut: off",
				"Management list: Show",
				"Management next / enter key: down",
				"Management previous key: up",
				"Result shortcut: ctrl+shift+e",
				"Agent capabilities",
				"Done",
			]);
		},
	);

	it.each(["print", "json", "rpc"] as const)("refuses unavailable UI in %s before reading files", async (mode) => {
		const ctx = context(mode, false);
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/requires.*UI|dialogs/i), "error");
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
		expect(ctx.ui.select).not.toHaveBeenCalled();
	});

	it.each(["omps-settings", "subagents-settings"] as const)(
		"rejects extra syntax before any file access: %s",
		async (command) => {
			const ctx = context();
			await run(ctx, "extra", command);
			expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /omps-settings (alias: /subagents-settings)", "warning");
			expect(fs.open).not.toHaveBeenCalled();
			expect(fs.readFile).not.toHaveBeenCalled();
		},
	);
});

describe("default registry layout", () => {
	it("shows the migration error and offers no save when only the old file exists", async () => {
		const agentDir = join(root, "agent");
		vi.stubEnv("OMPS_REGISTRY", undefined);
		await fs.mkdir(agentDir);
		const oldPath = join(agentDir, "om-pi-subagents.yaml");
		await fs.writeFile(oldPath, yaml);
		const ctx = context();
		pick(ctx, "Maximum nesting depth", "2");
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining(`mv ${oldPath} ${join(agentDir, "omps/config.yaml")}`),
			"error",
		);
		expect(ctx.ui.select).not.toHaveBeenCalled();
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(fs.rename).not.toHaveBeenCalled();
		expect(await fs.readFile(oldPath, "utf8")).toBe(yaml);
		await expect(fs.stat(join(agentDir, "omps/config.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("creates the private default registry after confirmation without a persona folder", async () => {
		vi.stubEnv("OMPS_REGISTRY", undefined);
		const agentDir = join(root, "agent");
		const ctx = context();
		pick(ctx, "Maximum nesting depth", "2");
		await run(ctx);
		const path = join(agentDir, "omps/config.yaml");
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain(path);
		expect((await loadRegistry(path)).limits.maxDepth).toBe(2);
		expect((await fs.stat(join(agentDir, "omps"))).mode & 0o777).toBe(0o700);
		expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
		await expect(fs.stat(join(agentDir, "omps/personas"))).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.stat(join(agentDir, "om-pi-subagents.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
	});
});

describe("execution limits", () => {
	it("accepts depth zero after confirmation and preserves concurrency", async () => {
		const ctx = context();
		pick(ctx, "Maximum nesting depth", "0");
		await run(ctx);
		expect((await loadRegistry(registry)).limits).toEqual({ maxDepth: 0, maxConcurrentRuns: 4 });
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain(registry);
		expect(ctx.ui.confirm.mock.calls[0][1]).toMatch(/multiply.*process.*provider/i);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/saved/i), "info");
	});

	it("saves parallel direct children to the selected registry", async () => {
		const ctx = context();
		pick(ctx, "Parallel direct children", " 2 ");
		await run(ctx);
		expect((await loadRegistry(registry)).limits).toEqual({ maxDepth: 3, maxConcurrentRuns: 2 });
		await expect(fs.stat(join(root, "agent", "omps/config.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it.each([undefined, "decline"])("leaves files unchanged after cancellation: %s", async (choice) => {
		const ctx = context();
		pick(ctx, "Maximum nesting depth", choice === undefined ? undefined : "2", false);
		await run(ctx);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect(fs.rename).not.toHaveBeenCalled();
		await expect(fs.stat(display)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("keeps earlier confirmed saves when a later edit is cancelled", async () => {
		const ctx = context();
		pick(ctx, "Maximum nesting depth", "2");
		pick(ctx, "Parallel direct children", undefined);
		await run(ctx);
		expect((await loadRegistry(registry)).limits).toEqual({ maxDepth: 2, maxConcurrentRuns: 4 });
	});

	it.each(["-1", "1.5", "1e2", "+2", "", "NaN", "9007199254740992"])(
		"rejects invalid depth syntax %j",
		async (answer) => {
			const ctx = context();
			pick(ctx, "Maximum nesting depth", answer);
			await run(ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/whole number/i), "error");
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
			expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		},
	);

	it("creates a missing registry only after explicit confirmation", async () => {
		await fs.unlink(registry);
		const ctx = context();
		pick(ctx, "Maximum nesting depth", "2");
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0][1]).toMatch(/create.*registry/i);
		expect((await loadRegistry(registry)).agents.size).toBe(0);
		expect((await loadRegistry(registry)).limits.maxDepth).toBe(2);
	});

	it("leaves a missing registry absent when confirmation is declined", async () => {
		await fs.unlink(registry);
		const ctx = context();
		pick(ctx, "Parallel direct children", "2", false);
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
		pick(ctx, "Maximum nesting depth", "2");
		vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic write failure"));
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/write failure/i), "error");
		expect(ctx.ui.notify.mock.calls.some(([message, level]) => level === "info" && /saved/i.test(message))).toBe(false);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
	});

	it("rejects edits made during confirmation and asks the operator to reopen", async () => {
		const ctx = context();
		pick(ctx, "Maximum nesting depth", "2");
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

describe("visible agents in YAML", () => {
	it("saves visible agents to the registry and keeps sibling files untouched", async () => {
		await fs.mkdir(join(root, "config", "pi-todo"), { recursive: true });
		const todo = join(root, "config", "pi-todo", "config.json");
		await fs.writeFile(todo, '{"maxWidgetLines":9,"mode":"openspec"}');
		await fs.mkdir(dirnameOf(display), { recursive: true });
		await fs.writeFile(display, '{"maxVisibleAgents":2}');
		const ctx = context();
		pick(ctx, "Visible agents", "7");
		await run(ctx);
		expect((await loadRegistry(registry)).ui.maxVisibleAgents).toBe(7);
		expect(await fs.readFile(display, "utf8")).toBe('{"maxVisibleAgents":2}');
		expect(await fs.readFile(todo, "utf8")).toBe('{"maxWidgetLines":9,"mode":"openspec"}');
		await expect(fs.stat(join(root, "agent", "settings.json"))).rejects.toMatchObject({ code: "ENOENT" });
	});

	it.each(["0", "257", "1.5", "abc", ""])(
		"rejects out-of-range visible value %j without confirmation",
		async (answer) => {
			const ctx = context();
			pick(ctx, "Visible agents", answer);
			await run(ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/whole number/i), "error");
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
			expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		},
	);

	it("requires confirmation before creating a registry for a visible-agent edit", async () => {
		await fs.unlink(registry);
		const ctx = context();
		pick(ctx, "Visible agents", "6", false);
		await run(ctx);
		await expect(fs.stat(registry)).rejects.toMatchObject({ code: "ENOENT" });
		pick(ctx, "Visible agents", "6");
		await run(ctx);
		expect((await loadRegistry(registry)).ui.maxVisibleAgents).toBe(6);
	});

	it("labels the effective source beside the value", async () => {
		await fs.mkdir(dirnameOf(display), { recursive: true });
		await fs.writeFile(display, '{"maxVisibleAgents":7}');
		const legacy = context();
		await run(legacy);
		expect(ctxItems(legacy)).toContain("Visible agents: 7 (legacy)");

		await fs.writeFile(registry, "version: 1\nui: { maxVisibleAgents: 3 }\nagents: {}\n");
		const fromYaml = context();
		await run(fromYaml);
		expect(ctxItems(fromYaml)).toContain("Visible agents: 3 (YAML)");
	});
});

describe("view shortcuts", () => {
	it("saves a confirmed fleet shortcut and requests a reload", async () => {
		const ctx = context();
		pick(ctx, "Fleet view shortcut", "alt+p");
		await run(ctx);
		expect((await loadRegistry(registry)).ui.toggleKey).toBe("alt+p");
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain(registry);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/\/reload/i), "info");
	});

	it("saves off and a valid inspection shortcut", async () => {
		const ctx = context();
		pick(ctx, "Fleet view shortcut", "off");
		pick(ctx, "Inspection shortcut", "ctrl+alt+i");
		await run(ctx);
		expect((await loadRegistry(registry)).ui).toEqual({
			maxVisibleAgents: 5,
			fleetView: "expanded",
			showManagementList: true,
			navigationDownKey: "down",
			navigationUpKey: "up",
			resultKey: "ctrl+shift+e",
			toggleKey: "off",
			inspectKey: "ctrl+alt+i",
		});
	});

	it.each([
		["Control + I", /ctrl\+i is unsafe/],
		["TAB", /tab is unsafe/],
		["hyper+o", /lowercase Pi key specification/],
		["meta+o", /lowercase Pi key specification/],
		["Control+ctr+1", /lowercase Pi key specification/],
		["disabled", /lowercase Pi key specification/],
		["", /must be a Pi key specification/],
		["Alt + P", /duplicate/],
	] as const)("rejects unsafe or malformed key %j without writing", async (key, problem) => {
		await fs.writeFile(registry, "version: 1\nui: { inspectKey: alt+p }\nagents: {}\n");
		const ctx = context();
		pick(ctx, "Fleet view shortcut", key);
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(problem), "error");
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(fs.rename).not.toHaveBeenCalled();
		expect(await fs.readFile(registry, "utf8")).toBe("version: 1\nui: { inspectKey: alt+p }\nagents: {}\n");
	});

	it("refuses a duplicate written in another modifier order before confirmation", async () => {
		await fs.writeFile(registry, "version: 1\nui: { inspectKey: ctrl+alt+p }\nagents: {}\n");
		const ctx = context();
		pick(ctx, "Fleet view shortcut", "alt+ctrl+p");
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/duplicate/i), "error");
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
	});

	it("shows the active binding beside a saved one until reload", async () => {
		await fs.writeFile(registry, "version: 1\nui: { toggleKey: alt+p }\nagents: {}\n");
		const ctx = context();
		pick(ctx, "Inspection shortcut", "alt+q");
		await run(ctx);
		expect((await loadRegistry(registry)).ui.inspectKey).toBe("alt+q");
		const items = ctx.ui.select.mock.calls.flatMap(([_title, options]) => options);
		expect(items.some((item) => item.includes("Fleet view shortcut: alt+p"))).toBe(true);
	});
});

describe("typed shortcut settings", () => {
	it.each([
		["pageUp", "pageUp"],
		["pageDown", "pageDown"],
		["ctrl+pageUp", "ctrl+pageUp"],
		["ctrl+pageDown", "ctrl+pageDown"],
		[" Control + PAGEUP ", "ctrl+pageUp"],
		["Option + pageDOWN", "alt+pageDown"],
	])("confirms and saves the canonical Page key for %j", async (answer, expected) => {
		const ctx = context();
		pick(ctx, "Inspection shortcut", answer);
		await run(ctx);
		expect(ctx.ui.confirm).toHaveBeenCalledOnce();
		const confirmation = ctx.ui.confirm.mock.calls[0][1];
		expect(confirmation).toContain(`→ ${expected}`);
		if (answer === expected) expect(confirmation).not.toContain("Typed:");
		else expect(confirmation).toContain(`Typed: ${answer}`);
		expect((await loadRegistry(registry)).ui.inspectKey).toBe(expected);
	});

	it("explains typing, confirms both forms and saves the converted YAML value", async () => {
		const ctx = context();
		pick(ctx, "Fleet view shortcut", "Control + 1");
		await run(ctx);
		expect(ctx.ui.input).toHaveBeenCalledWith(
			"Fleet view shortcut: off. Type the key, for example ctrl+1. Do not press the keys. Common modifiers: ctrl, shift, alt.",
			"off",
		);
		expect(ctx.ui.confirm.mock.calls[0]?.[1]).toContain("Fleet view shortcut: off → ctrl+1");
		expect(ctx.ui.confirm.mock.calls[0]?.[1]).toContain("Typed: Control + 1");
		expect((await loadRegistry(registry)).ui.toggleKey).toBe("ctrl+1");
		expect(await fs.readFile(registry, "utf8")).toMatch(/toggleKey: ctrl\+1/);
	});

	it("confirms canonical input without a conversion line", async () => {
		const ctx = context();
		pick(ctx, "Inspection shortcut", "ctrl+shift+i");
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain("→ ctrl+shift+i");
		expect(ctx.ui.confirm.mock.calls[0][1]).not.toContain("Typed:");
		expect((await loadRegistry(registry)).ui.inspectKey).toBe("ctrl+shift+i");
	});

	it.each([undefined, "decline"])("leaves YAML unchanged when an alias edit is cancelled: %s", async (choice) => {
		const ctx = context();
		pick(ctx, "Fleet view shortcut", choice === undefined ? undefined : "Control + 1", false);
		await run(ctx);
		if (choice === undefined) expect(ctx.ui.confirm).not.toHaveBeenCalled();
		else expect(ctx.ui.confirm.mock.calls[0]?.[1]).toContain("→ ctrl+1");
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it("accepts converted off even when Pi has an owner with that spelling", async () => {
		bindings.resolved = { "app.test": "off" };
		const ctx = context();
		pick(ctx, "Fleet view shortcut", " OFF ");
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0]?.[1]).toContain("→ off");
		expect((await loadRegistry(registry)).ui.toggleKey).toBe("off");
	});

	it.each(["hyper+1", "Meta + 1"])("lists accepted modifiers for %s without saving", async (answer) => {
		const ctx = context();
		pick(ctx, "Fleet view shortcut", answer);
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringMatching(/lowercase Pi key specification.*Accepted modifiers: ctrl, shift, alt, super\./),
			"error",
		);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it("rejects a converted duplicate in a different modifier order", async () => {
		const original = "version: 1\nui: { inspectKey: ctrl+alt+p }\nagents: {}\n";
		await fs.writeFile(registry, original);
		const ctx = context();
		pick(ctx, "Fleet view shortcut", "Option + Control + P");
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("duplicate of ui.toggleKey"), "error");
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(await fs.readFile(registry, "utf8")).toBe(original);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it.each([
		["Fleet view shortcut", "toggleKey", "ctrl+o", "ctrl+o", "app.tools.expand", "ctrl+o"],
		["Fleet view shortcut", "toggleKey", "Control + Shift + O", "ctrl+shift+o", "app.tools.expand", "shift+ctrl+o"],
		["Management next / enter key", "navigationDownKey", "Down", "down", "app.interrupt", "down"],
		["Management previous key", "navigationUpKey", "Up", "up", "tui.altScreen.lineUp", "up"],
		["Management next / enter key", "navigationDownKey", "Down", "down", "tui.select.up", "down"],
		["Management previous key", "navigationUpKey", "Up", "up", "tui.select.down", "up"],
		["Management next / enter key", "navigationDownKey", "Option + P", "alt+p", "tui.editor.historyNext", "alt+p"],
	] as const)(
		"rejects %s (%s) with registration's exact owner guidance",
		async (label, field, answer, key, owner, bound) => {
			bindings.resolved = { [owner]: ["f1", bound] };
			const ctx = context();
			pick(ctx, label, answer);
			await run(ctx);
			const settings = (await loadRegistry(registry)).ui;
			const registration = registerViewShortcuts(
				{ registerShortcut: vi.fn() } as unknown as ExtensionAPI,
				{ ...settings, [field]: key },
				{ toggleFleet: vi.fn(), openInspection: vi.fn() },
				bindings.resolved,
			);
			expect(registration.keys[field]).toBe("off");
			expect(registration.diagnostics).toHaveLength(1);
			const guidance = registration.diagnostics[0];
			expect(guidance).toContain(owner);
			expect(guidance).toMatch(/keybindings\.json.*\/hotkeys.*\/reload/);
			expect(ctx.ui.notify).toHaveBeenCalledWith(guidance, "error");
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
			expect(await fs.readFile(registry, "utf8")).toBe(yaml);
			expect(fs.rename).not.toHaveBeenCalled();
		},
	);

	it.each([
		["Management next / enter key", "navigationDownKey", "Down", "down"],
		["Management previous key", "navigationUpKey", "Up", "up"],
	] as const)("preserves permitted default overlaps for %s", async (label, field, answer, key) => {
		bindings.resolved = {
			"tui.editor.cursorDown": "down",
			"tui.editor.historyNext": "down",
			"tui.select.down": "down",
			"tui.editor.cursorUp": "up",
			"tui.editor.historyPrevious": "up",
			"tui.select.up": "up",
		};
		const ctx = context();
		pick(ctx, label, answer);
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0]?.[1]).toContain(`→ ${key}`);
		const settings = (await loadRegistry(registry)).ui;
		expect(settings[field]).toBe(key);
		const registration = registerViewShortcuts(
			{ registerShortcut: vi.fn() } as unknown as ExtensionAPI,
			settings,
			{ toggleFleet: vi.fn(), openInspection: vi.fn() },
			bindings.resolved,
		);
		expect(registration.keys[field]).toBe(key);
		expect(registration.diagnostics).toEqual([]);
	});

	it("saves a converted key freed by an effective Pi remapping", async () => {
		bindings.resolved = { "app.tools.expand": "ctrl+y" };
		const ctx = context();
		pick(ctx, "Fleet view shortcut", "Control + O");
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0]?.[1]).toContain("→ ctrl+o");
		const settings = (await loadRegistry(registry)).ui;
		expect(settings.toggleKey).toBe("ctrl+o");
		const registerShortcut = vi.fn();
		const registration = registerViewShortcuts(
			{ registerShortcut } as unknown as ExtensionAPI,
			settings,
			{ toggleFleet: vi.fn(), openInspection: vi.fn() },
			bindings.resolved,
		);
		expect(registration.keys.toggleKey).toBe("ctrl+o");
		expect(registerShortcut).toHaveBeenCalledWith("ctrl+o", expect.anything());
		expect(registration.diagnostics).toEqual([]);
	});
});

describe("fleet view", () => {
	/** Open the fleet view item, choose a view, then answer the confirmation. */
	function pickView(ctx: ReturnType<typeof context>, view: string | undefined, confirmed = true) {
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith("Fleet view")));
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item === view));
		ctx.ui.confirm.mockResolvedValueOnce(confirmed);
	}

	it("offers the three views and saves a confirmed choice without a reload", async () => {
		const ctx = context();
		pickView(ctx, "collapsed");
		await run(ctx);
		expect(ctx.ui.select.mock.calls[1][1]).toEqual(["expanded", "collapsed", "off"]);
		expect((await loadRegistry(registry)).ui.fleetView).toBe("collapsed");
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain(registry);
		const saved = ctx.ui.notify.mock.calls.find(([, level]) => level === "info")?.[0];
		expect(saved).toMatch(/saved/i);
		expect(saved).not.toMatch(/\/reload/i);
		const items = ctx.ui.select.mock.calls.at(-1)?.[1];
		expect(items).toContain("Fleet view: collapsed");
	});

	it("resets the session toggle and repaints only after a saved view", async () => {
		const handlers = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
		const pi = {
			registerCommand: (name: string, command: Parameters<ExtensionAPI["registerCommand"]>[1]) =>
				handlers.set(name, command),
		};
		const onFleetViewSaved = vi.fn();
		const onDisplayChanged = vi.fn();
		registerOmpsSettings(pi as unknown as ExtensionAPI, () => ({
			registryPath: registry,
			ui: createUiSettings(registry, display),
			onFleetViewSaved,
			onDisplayChanged,
		}));
		const declined = context();
		pickView(declined, "off", false);
		await handlers.get("omps-settings")!.handler("", declined as unknown as ExtensionCommandContext);
		expect(onFleetViewSaved).not.toHaveBeenCalled();
		const opened = onDisplayChanged.mock.calls.length;
		const ctx = context();
		pickView(ctx, "collapsed");
		await handlers.get("omps-settings")!.handler("", ctx as unknown as ExtensionCommandContext);
		expect(onFleetViewSaved).toHaveBeenCalledOnce();
		// One repaint when settings open, one more after the save.
		expect(onDisplayChanged.mock.calls.length).toBe(opened * 2 + 1);
	});

	it("saves nothing when the view dialog is cancelled", async () => {
		const ctx = context();
		pickView(ctx, undefined);
		await run(ctx);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(await fs.readFile(registry, "utf8")).not.toContain("fleetView");
	});

	it("saves nothing when the confirmation is declined", async () => {
		const ctx = context();
		pickView(ctx, "off", false);
		await run(ctx);
		expect(await fs.readFile(registry, "utf8")).not.toContain("fleetView");
	});
});

describe("legacy display import", () => {
	it("offers a confirmed import that writes only the YAML field", async () => {
		await fs.mkdir(dirnameOf(display), { recursive: true });
		await fs.writeFile(display, '{"maxVisibleAgents":7,"unrelated":{"keep":true}}');
		const ctx = context();
		choose(ctx, "Import legacy visible agents");
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain("7");
		expect((await loadRegistry(registry)).ui.maxVisibleAgents).toBe(7);
		expect(await fs.readFile(display, "utf8")).toBe('{"maxVisibleAgents":7,"unrelated":{"keep":true}}');
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/saved/i), "info");
	});

	it("writes nothing when the import is declined", async () => {
		await fs.mkdir(dirnameOf(display), { recursive: true });
		await fs.writeFile(display, '{"maxVisibleAgents":7}');
		const ctx = context();
		choose(ctx, "Import legacy visible agents", false);
		await run(ctx);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it("omits the import entry when no valid legacy value exists", async () => {
		const ctx = context();
		await run(ctx);
		expect(ctxItems(ctx)).not.toContainEqual(expect.stringMatching(/import/i));
	});

	it("omits the import entry and diagnoses malformed legacy data", async () => {
		await fs.mkdir(dirnameOf(display), { recursive: true });
		await fs.writeFile(display, "not json");
		const ctx = context();
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/config\.json|legacy/i), "error");
		expect(ctxItems(ctx)).not.toContainEqual(expect.stringMatching(/import/i));
	});

	it("omits the import entry once YAML declares the value", async () => {
		await fs.mkdir(dirnameOf(display), { recursive: true });
		await fs.writeFile(display, '{"maxVisibleAgents":7}');
		await fs.writeFile(registry, "version: 1\nui: { maxVisibleAgents: 3 }\nagents: {}\n");
		const ctx = context();
		await run(ctx);
		expect(ctxItems(ctx)).not.toContainEqual(expect.stringMatching(/import/i));
		expect(ctxItems(ctx)).toContain("Visible agents: 3 (YAML)");
	});
});

async function mappedAgent(
	options: { tools?: string[]; extensions?: string[]; skills?: string[] } = {},
): Promise<{ memory: string; todo: string }> {
	const resources = { memory: join(root, "om-memory-system"), todo: join(root, "om-pi-todo") };
	for (const [name, directory] of Object.entries(resources)) {
		await fs.mkdir(join(directory, "extensions"), { recursive: true });
		await fs.mkdir(join(directory, "skills", name === "memory" ? "omms-memory" : "om-pi-todo"), {
			recursive: true,
		});
		await fs.writeFile(join(directory, "extensions", "index.ts"), "export default () => {};\n");
		await fs.writeFile(
			join(directory, "skills", name === "memory" ? "omms-memory" : "om-pi-todo", "SKILL.md"),
			"---\nname: sibling\ndescription: Test sibling\n---\n",
		);
		await fs.writeFile(
			join(directory, "package.json"),
			JSON.stringify({
				name: name === "memory" ? "om-memory-system" : "om-pi-todo",
				pi: { extensions: ["./extensions/index.ts"], skills: ["./skills"] },
			}),
		);
	}
	await fs.writeFile(join(root, "reader.md"), "Read the selected task.");
	await fs.writeFile(
		registry,
		`# Operator mappings\nversion: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\nagents:\n  reader:\n    persona: reader.md\n    thinking: off\n    tools: ${JSON.stringify(options.tools ?? ["read"])}\n    extensions: ${JSON.stringify(options.extensions ?? [])}\n    skills: ${JSON.stringify(options.skills ?? [])}\n`,
	);
	return resources;
}

function selectCapability(ctx: ReturnType<typeof context>, capability: "Memory" | "Todo") {
	for (const label of ["Agent capabilities", "reader", capability]) {
		ctx.ui.select.mockImplementationOnce(async (_title, items) => {
			const option = items.find((item) => item.startsWith(label));
			expect(option, `Missing ${label} in ${items.join(", ")}`).toBeDefined();
			return option;
		});
	}
}

describe("per-agent capability settings", () => {
	it("shows both capabilities Off for a new mapped agent without loading sibling packages", async () => {
		await mappedAgent();
		const ctx = context();
		ctx.ui.select.mockImplementationOnce(async (_title, items) =>
			items.find((item) => item.startsWith("Agent capabilities")),
		);
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith("reader")));
		await run(ctx);
		expect(ctxItems(ctx)).toEqual(
			expect.arrayContaining([expect.stringMatching(/^Memory.*Off/), expect.stringMatching(/^Todo.*Off/)]),
		);
		expect(await fs.readFile(registry, "utf8")).toContain('tools: ["read"]');
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it("shows complete explicit mappings as On without claiming backend health", async () => {
		const { memory, todo } = await mappedAgent({
			tools: ["read", "memory", "todo"],
			extensions: [
				join(root, "om-memory-system", "extensions", "index.ts"),
				join(root, "om-pi-todo", "extensions", "index.ts"),
			],
		});
		const ctx = context();
		ctx.ui.select.mockImplementationOnce(async (_title, items) =>
			items.find((item) => item.startsWith("Agent capabilities")),
		);
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith("reader")));
		await run(ctx);
		expect(ctxItems(ctx)).toEqual(
			expect.arrayContaining([expect.stringMatching(/^Memory.*On/), expect.stringMatching(/^Todo.*On/)]),
		);
		expect(ctxItems(ctx).join(" ")).not.toMatch(/connected|healthy/i);
		expect((await loadRegistry(registry)).agents.get("reader")?.extensions).toEqual([
			join(memory, "extensions", "index.ts"),
			join(todo, "extensions", "index.ts"),
		]);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it.each([
		{ tools: ["read", "memory"], extensions: [], skills: [] },
		{ tools: ["read"], extensions: ["memory"], skills: [] },
		{ tools: ["read"], extensions: [], skills: ["memory"] },
	])("labels incomplete memory mappings Partial with correction guidance: %j", async (mapping) => {
		const memory = join(root, "om-memory-system");
		await mappedAgent({
			tools: mapping.tools,
			extensions: mapping.extensions.map(() => join(memory, "extensions", "index.ts")),
			skills: mapping.skills.map(() => join(memory, "skills", "omms-memory", "SKILL.md")),
		});
		const ctx = context();
		ctx.ui.select.mockImplementationOnce(async (_title, items) =>
			items.find((item) => item.startsWith("Agent capabilities")),
		);
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item.startsWith("reader")));
		await run(ctx);
		expect(ctxItems(ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/^Memory.*Partial/)]));
		expect(ctx.ui.select.mock.calls.map(([title]) => title).join(" ")).toMatch(/correct|incomplete|partial/i);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it("leaves YAML unchanged when a requested package is missing or an edit is cancelled", async () => {
		await mappedAgent();
		const before = await fs.readFile(registry, "utf8");
		const ctx = context();
		selectCapability(ctx, "Memory");
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => /enable/i.test(item)));
		ctx.ui.input.mockResolvedValueOnce(join(root, "missing-package"));
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/install|package|path/i), "error");
		expect(await fs.readFile(registry, "utf8")).toBe(before);
		expect(ctx.ui.confirm).not.toHaveBeenCalled();

		const cancelled = context();
		selectCapability(cancelled, "Todo");
		cancelled.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => /enable/i.test(item)));
		cancelled.ui.input.mockResolvedValueOnce(undefined);
		await run(cancelled);
		expect(await fs.readFile(registry, "utf8")).toBe(before);
		expect(fs.rename).not.toHaveBeenCalled();
	});

	it("previews an idempotent edit without adding a second equivalent tool or extension", async () => {
		const { memory } = await mappedAgent({
			tools: ["read", "memory"],
			extensions: [join(root, "om-memory-system", "extensions", "index.ts")],
		});
		const before = await fs.readFile(registry, "utf8");
		const ctx = context();
		selectCapability(ctx, "Memory");
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => /enable/i.test(item)));
		ctx.ui.input.mockResolvedValueOnce(memory);
		await run(ctx);
		expect((await loadRegistry(registry)).agents.get("reader")?.tools.filter((tool) => tool === "memory")).toHaveLength(
			1,
		);
		expect((await loadRegistry(registry)).agents.get("reader")?.extensions).toHaveLength(1);
		expect(await fs.readFile(registry, "utf8")).toBe(before);
	});

	it("enables one agent with exact list changes and keeps comments, another agent and the parent untouched", async () => {
		const { memory } = await mappedAgent();
		await fs.writeFile(
			registry,
			(await fs.readFile(registry, "utf8")) +
				"  sibling:\n    persona: reader.md\n    thinking: off\n    tools: [read]\n    extensions: []\n",
		);
		const ctx = context();
		selectCapability(ctx, "Memory");
		ctx.ui.select.mockImplementationOnce(async (_title, items) =>
			items.find((item) => item === "Enable with shipped skill"),
		);
		ctx.ui.input.mockResolvedValueOnce(memory);
		ctx.ui.confirm.mockResolvedValueOnce(true);
		await run(ctx);
		const preview = ctx.ui.confirm.mock.calls[0][1];
		expect(preview).toContain(registry);
		expect(preview).toContain("Agent: reader");
		expect(preview).toContain("tools: + memory");
		expect(preview).toContain(join(memory, "extensions", "index.ts"));
		expect(preview).toContain(join(memory, "skills", "omms-memory", "SKILL.md"));
		expect(preview).toMatch(/write and portability/i);
		const saved = await fs.readFile(registry, "utf8");
		expect(saved).toContain("# Operator mappings");
		expect(saved).toContain("  sibling:");
		const agents = (await loadRegistry(registry)).agents;
		expect(agents.get("sibling")?.tools).toEqual(["read"]);
		const agent = agents.get("reader")!;
		expect(agent.tools).toEqual(["read", "memory"]);
		expect(agent.extensions).toEqual([await fs.realpath(join(memory, "extensions", "index.ts"))]);
		expect(agent.skills).toEqual([await fs.realpath(join(memory, "skills", "omms-memory", "SKILL.md"))]);
		expect(fs.rename).toHaveBeenCalledTimes(1);
	});

	it("preserves relative unrelated resources and does not execute a package entry during enablement", async () => {
		const { todo } = await mappedAgent({ extensions: ["other-extension.ts"] });
		await fs.writeFile(join(root, "other-extension.ts"), "export default () => {};\n");
		await fs.writeFile(join(todo, "extensions", "index.ts"), 'throw new Error("executed a package factory");\n');
		const ctx = context();
		selectCapability(ctx, "Todo");
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item === "Enable"));
		ctx.ui.input.mockResolvedValueOnce(todo);
		ctx.ui.confirm.mockResolvedValueOnce(true);
		await run(ctx);
		expect(ctx.ui.notify.mock.calls.some(([message]) => String(message).includes("executed a package factory"))).toBe(
			false,
		);
		expect(await fs.readFile(registry, "utf8")).toContain("other-extension.ts");
		expect((await loadRegistry(registry)).agents.get("reader")?.extensions).toEqual([
			join(root, "other-extension.ts"),
			await fs.realpath(join(todo, "extensions", "index.ts")),
		]);
	});

	it("labels duplicate published resources Partial and asks for correction before enabling", async () => {
		const { memory } = await mappedAgent({
			tools: ["read", "memory"],
			extensions: [
				join(root, "om-memory-system", "extensions", "index.ts"),
				join(root, "om-memory-system", "extensions", "index.ts"),
			],
		});
		const before = await fs.readFile(registry, "utf8");
		const ctx = context();
		selectCapability(ctx, "Memory");
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item === "Enable"));
		ctx.ui.input.mockResolvedValueOnce(memory);
		await run(ctx);
		expect(ctxItems(ctx)).toEqual(expect.arrayContaining([expect.stringMatching(/^Memory.*Partial/)]));
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/multiple.*correct.*YAML/i), "error");
		expect(ctx.ui.confirm).not.toHaveBeenCalled();
		expect(await fs.readFile(registry, "utf8")).toBe(before);
	});

	it("rejects an ambiguous wrapper on disable instead of removing its tool alone", async () => {
		await mappedAgent({ tools: ["read", "memory"], extensions: ["custom-om-memory-system-wrapper.ts"] });
		await fs.writeFile(join(root, "custom-om-memory-system-wrapper.ts"), "export default () => {};\n");
		const before = await fs.readFile(registry, "utf8");
		const ctx = context();
		selectCapability(ctx, "Memory");
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => item === "Disable"));
		await run(ctx);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/wrapper.*correct.*YAML/i), "error");
		expect(await fs.readFile(registry, "utf8")).toBe(before);
	});

	it("rejects a conflicting save after confirmation without changing the current mapping", async () => {
		const { todo } = await mappedAgent();
		const ctx = context();
		selectCapability(ctx, "Todo");
		ctx.ui.select.mockImplementationOnce(async (_title, items) => items.find((item) => /enable/i.test(item)));
		ctx.ui.input.mockResolvedValueOnce(todo);
		const newer = (await fs.readFile(registry, "utf8")).replace('tools: ["read"]', 'tools: ["read", "bash"]');
		ctx.ui.confirm.mockImplementationOnce(async () => {
			await fs.writeFile(registry, newer);
			return true;
		});
		await run(ctx);
		expect(ctx.ui.confirm.mock.calls[0][1]).toMatch(/reader|todo|tools|extensions/i);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/reopen settings/i), "error");
		expect(await fs.readFile(registry, "utf8")).toBe(newer);
	});
});

describe("detectPublishedPackages", () => {
	const agentDir = () => join(root, "agent");

	async function settings(value: unknown) {
		await fs.mkdir(agentDir(), { recursive: true });
		await fs.writeFile(join(agentDir(), "settings.json"), JSON.stringify(value));
	}

	async function installed(capability: capabilities.Capability) {
		const resources = await mappedAgent();
		const source = capability === "Memory" ? resources.memory : resources.todo;
		const directory = join(
			agentDir(),
			"npm",
			"node_modules",
			capability === "Memory" ? "om-memory-system" : "om-pi-todo",
		);
		await fs.cp(source, directory, { recursive: true });
		return fs.realpath(directory);
	}

	it.each(["Memory", "Todo"] as const)("detects one listed npm package for %s", async (capability) => {
		const directory = await installed(capability);
		await settings({ packages: [capability === "Memory" ? "npm:om-memory-system" : "npm:om-pi-todo"] });
		const before = await fs.readFile(join(agentDir(), "settings.json"), "utf8");
		expect(await capabilities.detectPublishedPackages(agentDir(), capability)).toEqual([
			{
				root: directory,
				entry: join(directory, "extensions", "index.ts"),
				skill: capability === "Memory" ? join(directory, "skills", "omms-memory", "SKILL.md") : undefined,
			},
		]);
		expect(await fs.readFile(join(agentDir(), "settings.json"), "utf8")).toBe(before);
		expect(fs.rename).not.toHaveBeenCalled();
		for (const spy of Object.values(processes)) expect(spy).not.toHaveBeenCalled();
	});

	it("returns no match without scanning an installed but unlisted package", async () => {
		await installed("Memory");
		await settings({ packages: ["npm:om-pi-todo"] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
	});

	it.each(["1.2.3", "1.2.3-beta.1", "^1.2", "~1", ">=1 <2 || >=3", "*", "latest", "next"])(
		"accepts npm version, range or tag suffix %s",
		async (suffix) => {
			const directory = await installed("Memory");
			await settings({ packages: [`npm:om-memory-system@${suffix}`] });
			expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([
				expect.objectContaining({ root: directory }),
			]);
		},
	);

	it("accepts an object source despite autoload and resource filters", async () => {
		const directory = await installed("Todo");
		await settings({
			packages: [
				{
					source: "npm:om-pi-todo@latest",
					autoload: false,
					extensions: [],
					skills: [],
					prompts: [],
					themes: [],
				},
			],
		});
		expect(await capabilities.detectPublishedPackages(agentDir(), "Todo")).toEqual([
			expect.objectContaining({ root: directory, entry: join(directory, "extensions", "index.ts") }),
		]);
	});

	it.each(["../om-memory-system", { source: "../om-memory-system" }])(
		"resolves a relative local source against agentDir: %j",
		async (source) => {
			const { memory } = await mappedAgent();
			await settings({ packages: [source] });
			expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([
				expect.objectContaining({ root: await fs.realpath(memory) }),
			]);
		},
	);

	it("accepts absolute local package folders and published entry paths", async () => {
		const { memory, todo } = await mappedAgent();
		await settings({ packages: [memory, join(todo, "extensions", "index.ts")] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([
			expect.objectContaining({ root: await fs.realpath(memory) }),
		]);
		expect(await capabilities.detectPublishedPackages(agentDir(), "Todo")).toEqual([
			expect.objectContaining({ root: await fs.realpath(todo) }),
		]);
	});

	it("deduplicates canonical roots across npm, local, entry and symlink sources", async () => {
		const directory = await installed("Memory");
		await fs.symlink(directory, join(root, "alias"), "dir");
		await settings({
			packages: [
				"npm:om-memory-system",
				"npm:om-memory-system@latest",
				directory,
				join(directory, "extensions", "index.ts"),
				"../alias",
			],
		});
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([
			expect.objectContaining({ root: directory }),
		]);
	});

	it("keeps distinct valid roots in list order", async () => {
		const directory = await installed("Memory");
		await settings({ packages: ["npm:om-memory-system", "../om-memory-system"] });
		const matches = await capabilities.detectPublishedPackages(agentDir(), "Memory");
		expect(matches.map((match) => match.root)).toEqual([directory, await fs.realpath(join(root, "om-memory-system"))]);
	});

	it("skips a folder whose manifest has the wrong package name", async () => {
		const directory = await installed("Memory");
		await fs.writeFile(
			join(directory, "package.json"),
			JSON.stringify({ name: "other-package", pi: { extensions: ["./extensions/index.ts"] } }),
		);
		await settings({ packages: ["npm:om-memory-system"] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
	});

	it.each([
		{ extensions: [] },
		{ extensions: ["./missing.ts"] },
		{ extensions: ["./extensions/index.ts", "./other.ts"] },
		{ extensions: ["../../../om-memory-system/extensions/index.ts"] },
	])("skips invalid published extension declarations: %j", async ({ extensions }) => {
		const directory = await installed("Memory");
		await fs.writeFile(
			join(directory, "package.json"),
			JSON.stringify({ name: "om-memory-system", pi: { extensions } }),
		);
		await settings({ packages: ["npm:om-memory-system"] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
	});

	it("skips missing npm and local folders", async () => {
		await settings({ packages: ["npm:om-memory-system", "../missing"] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
	});

	it("returns no matches for missing settings", async () => {
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
	});

	it.each(["{", "null", "[]", "{}", '{"packages":{}}', '{"packages":"npm:om-memory-system"}'])(
		"returns no matches for invalid settings or package lists: %s",
		async (content) => {
			await fs.mkdir(agentDir());
			await fs.writeFile(join(agentDir(), "settings.json"), content);
			expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
		},
	);

	it("returns no matches when settings cannot be read", async () => {
		await settings({ packages: ["npm:om-memory-system"] });
		vi.mocked(fs.readFile).mockRejectedValueOnce(new Error("synthetic settings read failure"));
		try {
			expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
		} finally {
			vi.mocked(fs.readFile).mockReset();
			vi.mocked(fs.readFile).mockImplementation((await vi.importActual<typeof fs>("node:fs/promises")).readFile);
		}
	});

	it.each([
		"~",
		"~/om-memory-system",
		"file:///om-memory-system",
		"git:github.com/example/om-memory-system",
		"https://example.com/om-memory-system",
		"ssh://git@example.com/om-memory-system",
		"git@example.com:om-memory-system",
		"npm:@scope/om-memory-system@latest",
		"npm:om-memory-system-other",
		"npm:../om-memory-system",
		"npm:om-memory-system@../../outside",
		"npm:om-memory-system@npm:other",
		"npm:om-memory-system@https://example.com/package.tgz",
	])("skips unsupported or nonmatching sources without filesystem validation: %s", async (source) => {
		await installed("Memory");
		await settings({ packages: [source] });
		vi.mocked(fs.realpath).mockClear();
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
		expect(fs.realpath).not.toHaveBeenCalled();
	});

	it("skips malformed entries while retaining a later valid candidate", async () => {
		const directory = await installed("Memory");
		await settings({
			packages: [null, false, 4, {}, { source: 4 }, ["npm:om-memory-system"], "", "npm:om-memory-system"],
		});
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([
			expect.objectContaining({ root: directory }),
		]);
	});

	it("contains a candidate validation failure and still detects a later valid package", async () => {
		const directory = await installed("Memory");
		await settings({ packages: ["../om-memory-system", "npm:om-memory-system"] });
		vi.mocked(fs.stat).mockRejectedValueOnce(new Error("synthetic candidate stat failure"));
		try {
			expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([
				expect.objectContaining({ root: directory }),
			]);
			expect(fs.stat).toHaveBeenCalledWith(await fs.realpath(join(root, "om-memory-system")));
		} finally {
			vi.mocked(fs.stat).mockReset();
			vi.mocked(fs.stat).mockImplementation((await vi.importActual<typeof fs>("node:fs/promises")).stat);
		}
	});

	it("rejects an extension symlink that escapes the package root", async () => {
		const directory = await installed("Memory");
		await fs.symlink(join(root, "om-memory-system", "extensions", "index.ts"), join(directory, "escape.ts"));
		await fs.writeFile(
			join(directory, "package.json"),
			JSON.stringify({ name: "om-memory-system", pi: { extensions: ["./escape.ts"] } }),
		);
		await settings({ packages: ["npm:om-memory-system"] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Memory")).toEqual([]);
	});

	it("detects a throwing entry without importing or executing it", async () => {
		const directory = await installed("Todo");
		const entry = join(directory, "extensions", "index.ts");
		const marker = join(root, "executed");
		await fs.writeFile(
			entry,
			`import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "executed");\nthrow new Error("detector imported a sibling extension");\n`,
		);
		await settings({ packages: ["npm:om-pi-todo"] });
		expect(await capabilities.detectPublishedPackages(agentDir(), "Todo")).toEqual([
			{ root: directory, entry, skill: undefined },
		]);
		await expect(fs.stat(marker)).rejects.toMatchObject({ code: "ENOENT" });
		expect(vi.mocked(fs.readFile).mock.calls.some(([path]) => path === entry)).toBe(false);
		for (const spy of Object.values(processes)) expect(spy).not.toHaveBeenCalled();
	});
});

function ctxItems(ctx: ReturnType<typeof context>): string[] {
	return ctx.ui.select.mock.calls.flatMap(([_title, options]) => options);
}

function dirnameOf(path: string): string {
	const parts = path.split("/");
	parts.pop();
	return parts.join("/");
}
