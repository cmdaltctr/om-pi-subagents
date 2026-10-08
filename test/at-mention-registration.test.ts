import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { expect, it, vi } from "vitest";

const io = vi.hoisted(() => ({
	readFile: vi.fn(),
	readFileSync: vi.fn(),
	existsSync: vi.fn(),
	stat: vi.fn(),
	realpath: vi.fn(),
	spawn: vi.fn(),
	spawnSync: vi.fn(),
	exec: vi.fn(),
	execSync: vi.fn(),
	execFile: vi.fn(),
	execFileSync: vi.fn(),
	fork: vi.fn(),
}));
vi.mock("node:fs", async (original) => ({
	...(await original<typeof import("node:fs")>()),
	readFileSync: io.readFileSync,
	existsSync: io.existsSync,
}));
vi.mock("node:fs/promises", async (original) => ({
	...(await original<typeof import("node:fs/promises")>()),
	readFile: io.readFile,
	stat: io.stat,
	realpath: io.realpath,
}));
vi.mock("node:child_process", () => io);
import { registerRuntime } from "../src/index.ts";

it("registers at-mention hooks without reading files, resolving paths or starting processes", () => {
	vi.clearAllMocks();
	const handlers = new Map();
	const pi = {
		on: (name: string, handler: unknown) => handlers.set(name, handler),
		registerTool() {},
		registerCommand() {},
		registerEntryRenderer() {},
		registerMessageRenderer() {},
	} as unknown as ExtensionAPI;
	const runtime = registerRuntime(pi);
	expect(runtime()).toBeUndefined();
	expect(handlers.has("input")).toBe(true);
	expect(handlers.has("session_start")).toBe(true);
	for (const [name, spy] of Object.entries(io)) expect(spy, name).not.toHaveBeenCalled();
});

it("never creates a runtime or child when shutdown ends a held first names refresh", async () => {
	vi.resetAllMocks();
	vi.stubEnv("PI_CODING_AGENT_DIR", "/tmp/omps-held-names");
	vi.stubEnv("OMPS_REGISTRY", "/tmp/omps-held-names/config.yaml");
	let release!: (text: string) => void;
	const held = new Promise<string>((resolve) => {
		release = resolve;
	});
	io.existsSync.mockReturnValue(true);
	io.stat.mockResolvedValue({ size: 1, isFile: () => true });
	io.realpath.mockImplementation(async (path) => path);
	io.readFile.mockResolvedValue("disposable persona").mockImplementationOnce(() => held);
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => Promise<unknown>>();
	const pi = {
		on: (name: string, handler: unknown) => handlers.set(name, handler as never),
		registerTool() {},
		registerCommand() {},
		registerEntryRenderer() {},
		registerMessageRenderer() {},
	} as unknown as ExtensionAPI;
	const ctx = {
		mode: "tui",
		cwd: "/tmp",
		sessionManager: { getSessionId: () => "held-names-session" },
		ui: { notify: vi.fn() },
	} as unknown as ExtensionContext;
	try {
		const runtime = registerRuntime(pi);
		const input = handlers.get("input")!({ source: "interactive", text: "@reader inspect src" }, ctx);
		await vi.waitFor(() => expect(io.readFile).toHaveBeenCalledOnce());
		expect(runtime()).toBeUndefined();
		await handlers.get("session_shutdown")!({}, ctx);
		release("version: 1\nagents:\n  reader: { persona: ./reader.md, tools: [read], thinking: off }\n");
		expect(await input).toEqual({ action: "handled" });
		expect(runtime()).toBeUndefined();
		expect(io.readFile).toHaveBeenCalledTimes(2);
		for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const)
			expect(io[name], name).not.toHaveBeenCalled();
	} finally {
		release("");
		vi.unstubAllEnvs();
		vi.resetAllMocks();
	}
});
