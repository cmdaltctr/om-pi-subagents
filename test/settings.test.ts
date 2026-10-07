import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ompss from "../src/index.ts";
import { loadRegistry } from "../src/config.ts";

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

async function run(ctx: ReturnType<typeof context>, args = "", command = "ompss-settings") {
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
	it("registers the canonical command and its alias with no I/O and no model-callable settings action", () => {
		const extension = load();
		expect([...extension.commands.keys()]).toEqual(["ompss", "ompss-settings", "subagents-settings"]);
		expect(extension.tools.map((tool) => tool.name)).toEqual(["ompss"]);
		expect((extension.tools[0].parameters as any).properties.action.enum).toEqual(["list", "run", "status", "cancel"]);
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});

	it.each(["ompss-settings", "subagents-settings"] as const)(
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
				"Fleet list shortcut: alt+o",
				"Inspection shortcut: alt+i",
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

	it.each(["ompss-settings", "subagents-settings"] as const)(
		"rejects extra syntax before any file access: %s",
		async (command) => {
			const ctx = context();
			await run(ctx, "extra", command);
			expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /ompss-settings (alias: /subagents-settings)", "warning");
			expect(fs.open).not.toHaveBeenCalled();
			expect(fs.readFile).not.toHaveBeenCalled();
		},
	);
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
		await expect(fs.stat(join(root, "agent", "om-pi-subagents.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
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
		pick(ctx, "Fleet list shortcut", "alt+p");
		await run(ctx);
		expect((await loadRegistry(registry)).ui.toggleKey).toBe("alt+p");
		expect(ctx.ui.confirm.mock.calls[0][1]).toContain(registry);
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/\/reload/i), "info");
	});

	it("saves off and a valid inspection shortcut", async () => {
		const ctx = context();
		pick(ctx, "Fleet list shortcut", "off");
		pick(ctx, "Inspection shortcut", "ctrl+alt+i");
		await run(ctx);
		expect((await loadRegistry(registry)).ui).toEqual({
			maxVisibleAgents: 5,
			toggleKey: "off",
			inspectKey: "ctrl+alt+i",
		});
	});

	it.each(["ctrl+i", "tab", "Alt+O", "control+o", "disabled", "alt+p"])(
		"rejects unsafe or malformed key %j without writing",
		async (key) => {
			await fs.writeFile(registry, "version: 1\nui: { inspectKey: alt+p }\nagents: {}\n");
			const ctx = context();
			pick(ctx, "Fleet list shortcut", key);
			await run(ctx);
			expect(ctx.ui.notify).toHaveBeenCalledWith(
				expect.stringMatching(/ui\.toggleKey|choose distinct keys|choose another key/i),
				"error",
			);
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
			expect(await fs.readFile(registry, "utf8")).toBe("version: 1\nui: { inspectKey: alt+p }\nagents: {}\n");
		},
	);

	it("shows the active binding beside a saved one until reload", async () => {
		await fs.writeFile(registry, "version: 1\nui: { toggleKey: alt+p }\nagents: {}\n");
		const ctx = context();
		pick(ctx, "Inspection shortcut", "alt+q");
		await run(ctx);
		expect((await loadRegistry(registry)).ui.inspectKey).toBe("alt+q");
		const items = ctx.ui.select.mock.calls.flatMap(([_title, options]) => options);
		expect(items.some((item) => item.includes("Fleet list shortcut: alt+p"))).toBe(true);
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

function ctxItems(ctx: ReturnType<typeof context>): string[] {
	return ctx.ui.select.mock.calls.flatMap(([_title, options]) => options);
}

function dirnameOf(path: string): string {
	const parts = path.split("/");
	parts.pop();
	return parts.join("/");
}
