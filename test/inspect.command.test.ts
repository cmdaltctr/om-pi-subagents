import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { registerRuntime } from "../src/index.ts";
import { syntheticTheme } from "./fixtures/inspector-synthetic.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	return { ...original, open: vi.fn(original.open), readFile: vi.fn(original.readFile) };
});
const processes = vi.hoisted(() => ({ spawn: vi.fn(), spawnSync: vi.fn(), execFile: vi.fn() }));
vi.mock("node:child_process", () => processes);
let directory: string;
beforeEach(async () => {
	directory = await fs.mkdtemp(join(tmpdir(), "omps-inspect-command-"));
	vi.stubEnv("PI_CODING_AGENT_DIR", directory);
	vi.stubEnv("XDG_CONFIG_HOME", join(directory, "config"));
	vi.stubEnv("OMPS_REGISTRY", join(directory, "malformed.yaml"));
	await fs.writeFile(join(directory, "malformed.yaml"), "version: [");
	vi.clearAllMocks();
});
afterEach(async () => {
	vi.unstubAllEnvs();
	await fs.rm(directory, { recursive: true, force: true });
});
function setup(mode: "rpc" | "tui" = "rpc") {
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
	};
	const runtime = registerRuntime(pi as unknown as ExtensionAPI);
	const ui = { notify: vi.fn(), custom: vi.fn(), setStatus: vi.fn(), setWidget: vi.fn() };
	const ctx = {
		mode,
		hasUI: true,
		ui,
		cwd: directory,
		sessionManager: { getSessionId: () => "session" },
	} as unknown as ExtensionCommandContext;
	const run = async (args: string) => {
		await commands.get("omps")!.handler(args, ctx);
	};
	return { runtime, ui, ctx, pi, run, tools };
}
function root(owner = "session", id = "owned") {
	return {
		id,
		owner,
		agent: "worker",
		cwd: directory,
		state: "running" as const,
		startedAt: 1,
		nesting: { registryPath: "/registry", rootSessionId: owner, depth: 1, maxDepth: 3 },
	};
}

describe("operator inspect command", () => {
	it("reports an empty session without building runtime or reading registry/preferences", async () => {
		const fixture = setup();
		await fixture.run("inspect");
		expect(fixture.ui.notify).toHaveBeenCalledWith("No runs to inspect in this session.", "info");
		expect(fixture.runtime()).toBeUndefined();
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
		for (const spy of Object.values(processes)) expect(spy).not.toHaveBeenCalled();
		expect(fixture.pi.sendMessage).not.toHaveBeenCalled();
	});
	it.each(["inspect a b", "inspect ../escape", "inspect a/b", "inspect ."])(
		"rejects malformed syntax %j before file access",
		async (input) => {
			const fixture = setup();
			await fixture.run(input);
			expect(fixture.ui.notify).toHaveBeenCalledWith(expect.stringContaining("inspect [run-id]"), "warning");
			expect(fixture.runtime()).toBeUndefined();
			expect(fs.open).not.toHaveBeenCalled();
			expect(fs.readFile).not.toHaveBeenCalled();
		},
	);
	it("rejects a valid unknown id as a service error", async () => {
		const fixture = setup();
		await fixture.run("inspect unknown");
		expect(fixture.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/unknown|unowned/i), "error");
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});
	it("provides bounded RPC tree text with full ids and no terminal component", async () => {
		const fixture = setup();
		await fixture.run("");
		fixture.runtime()!.observations.updateRoot(root());
		fixture.ui.notify.mockClear();
		await fixture.run("inspect");
		expect(fixture.ui.notify).toHaveBeenCalledWith(expect.stringContaining("owned"), "info");
		expect(fixture.ui.custom).not.toHaveBeenCalled();
		expect(fixture.pi.sendMessage).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});
	it("rejects foreign observations without reading their files", async () => {
		const fixture = setup();
		await fixture.run("");
		fixture.runtime()!.observations.updateRoot(root("foreign", "foreign-run"));
		fixture.ui.notify.mockClear();
		await fixture.run("inspect foreign-run");
		expect(fixture.ui.notify).toHaveBeenCalledWith(expect.stringMatching(/unknown|unowned/i), "error");
		expect(fs.open).not.toHaveBeenCalled();
		expect(fs.readFile).not.toHaveBeenCalled();
	});
	it.each([30, 120])("opens an owned run directly at %i columns without changing work", async (width) => {
		const fixture = setup("tui");
		await fixture.run("");
		fixture.runtime()!.observations.updateRoot(root());
		const done = vi.fn();
		let shown = "";
		fixture.ui.custom.mockImplementation(async (factory) => {
			const component = factory({ terminal: { rows: 40 }, requestRender: vi.fn() }, syntheticTheme(), undefined, done);
			for (let index = 0; index < 8; index++) await Promise.resolve();
			shown = stripVTControlCharacters(component.render(width).join("\n"));
			component.handleInput("\x1b");
		});
		await fixture.run("inspect owned");
		// Command errors become notifications; keep render assertions outside that error boundary.
		// Wide screens reserve two columns before the detail content.
		expect(shown.split("\n").find((line) => line.includes("Run: owned"))).toBe(`${width >= 40 ? "  " : ""}Run: owned`);
		expect(shown).toContain("Saved output");
		expect(done).toHaveBeenCalledOnce();
		expect(fixture.ui.custom).toHaveBeenCalledOnce();
		expect(fixture.runtime()!.observations.node("session", "owned", "owned")?.state).toBe("running");
		for (const spy of Object.values(processes)) expect(spy).not.toHaveBeenCalled();
		expect(fixture.pi.sendMessage).not.toHaveBeenCalled();
	});
	it("keeps inspect outside the model-callable action schema", () => {
		const fixture = setup();
		expect((fixture.tools[0].parameters as any).properties.action.enum).toEqual(["list", "run", "status", "cancel"]);
	});
});
