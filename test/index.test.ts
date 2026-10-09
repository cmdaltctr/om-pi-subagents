import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fileSpies = vi.hoisted(() => ({
	readFile: vi.fn(),
	realpath: vi.fn(),
	readFileSync: vi.fn(),
	existsSync: vi.fn(),
	mkdir: vi.fn(),
	writeFile: vi.fn(),
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	for (const name of ["readFile", "realpath", "mkdir", "writeFile"] as const)
		fileSpies[name].mockImplementation(actual[name]);
	return {
		...actual,
		readFile: fileSpies.readFile,
		realpath: fileSpies.realpath,
		mkdir: fileSpies.mkdir,
		writeFile: fileSpies.writeFile,
	};
});

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	fileSpies.readFileSync.mockImplementation(actual.readFileSync);
	fileSpies.existsSync.mockImplementation(actual.existsSync);
	return { ...actual, readFileSync: fileSpies.readFileSync, existsSync: fileSpies.existsSync };
});

const processSpies = vi.hoisted(() => ({
	spawn: vi.fn(),
	spawnSync: vi.fn(),
	exec: vi.fn(),
	execSync: vi.fn(),
	execFile: vi.fn(),
	execFileSync: vi.fn(),
	fork: vi.fn(),
}));

vi.mock("node:child_process", () => processSpies);

import omps, {
	registerOmps,
	registerRuntime,
	resolvePiBin,
	resolveRegistryPath,
	SessionBinding,
} from "../src/index.ts";
import type { OmpsService } from "../src/service.ts";

type Notify = (message: string, level: string) => void;
type Ctx = {
	cwd: string;
	model?: { provider: string; id: string };
	sessionManager: { getSessionId: () => string };
	ui: { notify: Notify };
};
type Tool = {
	name: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: any;
	execute: (
		id: string,
		params: any,
		signal: undefined,
		update: undefined,
		ctx: Ctx,
	) => Promise<{ content: Array<{ text: string }> }>;
};
type Command = { handler: (args: string, ctx: Ctx) => Promise<void> };

function loadExtension(register: (pi: any) => void = (pi) => omps(pi)) {
	const tools = new Map<string, Tool>();
	const commands = new Map<string, Command>();
	const handlers = new Map<string, (event: unknown, ctx: Ctx) => unknown>();
	const renderers = vi.fn();
	const messageRenderers = vi.fn();
	register({
		registerTool: (tool: Tool) => tools.set(tool.name, tool),
		registerCommand: (name: string, command: Command) => commands.set(name, command),
		on: (event: string, handler: (event: unknown, ctx: Ctx) => unknown) => handlers.set(event, handler),
		registerEntryRenderer: renderers,
		registerMessageRenderer: messageRenderers,
	});
	return { tools, commands, handlers, renderers, messageRenderers };
}

const ctx = (notify: Notify = vi.fn()): Ctx => ({
	cwd: "/work",
	model: { provider: "p", id: "m" },
	sessionManager: { getSessionId: () => "session-1" },
	ui: { notify },
});

/** A service whose every method records its call and answers with a fixed text. */
function fakeService() {
	const calls: Array<[string, ...unknown[]]> = [];
	const service = {
		listForms: async () => (calls.push(["list"]), { full: "LIST", compact: "LIST" }),
		run: async (...args: unknown[]) => (calls.push(["run", ...args]), "RUN"),
		status: (...args: unknown[]) => (calls.push(["status", ...args]), "STATUS"),
		cancel: (...args: unknown[]) => (calls.push(["cancel", ...args]), "CANCEL"),
	} as unknown as OmpsService;
	return { service, calls };
}

beforeEach(() => {
	vi.stubEnv("OMPS_CHILD", "");
	vi.stubEnv("OMPS_REGISTRY", undefined);
	for (const spy of [...Object.values(processSpies), ...Object.values(fileSpies)]) spy.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const policy = () => loadExtension().tools.get("omps")!.promptGuidelines?.join("\n") ?? "";

describe("delegation prompt policy", () => {
	it("discovers fresh mappings and proactively delegates substantial separable work", () => {
		expect(policy()).toMatch(/substantial tasks with separable work/);
		expect(policy()).toMatch(/fresh omps list/);
		expect(policy()).toMatch(/proactively delegate.*bounded investigation or review/);
		expect(policy()).toMatch(/clear task and expected result/);
	});

	it("keeps simple tasks local and honours explicit user restrictions without a quota", () => {
		expect(policy()).toMatch(/Keep simple tasks local/);
		expect(policy()).toMatch(/Honour explicit user restrictions.*subagents/);
		expect(policy()).toMatch(/no fixed launch count/);
	});

	it("checks approved tools and current-session status before adding runs", () => {
		expect(policy()).toMatch(/only freshly listed mappings.*approved tools/);
		expect(policy()).toMatch(/omps status.*current session.*more runs/);
		expect(policy()).toMatch(/launch through omps/);
	});

	it("reports missing, invalid or unsuitable mappings without expanding permissions", () => {
		expect(policy()).toMatch(/empty, invalid or unsuitable mappings/);
		expect(policy()).toMatch(/continue permitted local work/);
		expect(policy()).toMatch(/invent agents/);
		expect(policy()).toMatch(/change settings or grant tools without permission/);
	});

	it("verifies working folders and prevents parallel writers sharing files", () => {
		expect(policy()).toMatch(/Verify the working folder/);
		expect(policy()).toMatch(/parallel writers.*shared-file conflicts/);
	});

	it("honours admission refusals and recovery without launch loops or raised limits", () => {
		expect(policy()).toMatch(/configured concurrency.*inherited depth ceilings.*cleanup blocking/);
		expect(policy()).toMatch(/Honour launch refusals.*waiting or recovery guidance/);
		expect(policy()).toMatch(/never repeatedly retry or raise limits without permission/);
	});

	it("awaits separate results, assesses evidence and retains parent responsibility", () => {
		expect(policy()).toMatch(/run id acknowledges launch.*not a result/);
		expect(policy()).toMatch(/Await the separately delivered result before relying/);
		expect(policy()).toMatch(/Assess findings against the task and available evidence/);
		expect(policy()).toMatch(/preserve failed or partial labels/);
		expect(policy()).toMatch(/parent remains responsible.*final answer.*parent task updates/);
		expect(policy()).toMatch(/Child completion alone.*OpenSpec task complete/);
		expect(policy()).toMatch(/Continue independent work while waiting/);
	});

	it("keeps the policy concise and portable", () => {
		const tool = loadExtension().tools.get("omps")!;
		expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
		expect(policy().split(/\s+/).length).toBeGreaterThanOrEqual(150);
		expect(policy().split(/\s+/).length).toBeLessThanOrEqual(250);
		expect(policy()).not.toMatch(/\/Users\/|\/home\/|a-build|a-review|claude|gpt-/i);
		expect(tool.description).toMatch(/proactive delegation/);
		expect(tool.promptSnippet).toMatch(/substantial separable work/);
	});

	it.each(["missing", "malformed"])(
		"registers static policy with a %s registry without file access or a runtime, including RPC startup",
		async (state) => {
			const directory = mkdtempSync(join(tmpdir(), "omps-registration-"));
			const registry = join(directory, "config.yaml");
			if (state === "malformed") writeFileSync(registry, "agents: [");
			vi.stubEnv("OMPS_REGISTRY", registry);
			try {
				let currentRuntime: ReturnType<typeof registerRuntime> | undefined;
				const { tools, handlers } = loadExtension((pi) => {
					currentRuntime = registerRuntime(pi);
				});
				expect(currentRuntime!()).toBeUndefined();
				await handlers.get("session_start")!({}, { ...ctx(), mode: "rpc" } as Ctx);
				expect(currentRuntime!()).toBeUndefined();
				for (const [name, spy] of Object.entries({ ...fileSpies, ...processSpies }))
					expect(spy, name).not.toHaveBeenCalled();
				expect(tools.get("omps")!.promptGuidelines?.length).toBeGreaterThan(0);
			} finally {
				vi.unstubAllEnvs();
				rmSync(directory, { recursive: true, force: true });
			}
		},
	);
});

describe("registration", () => {
	it("registers folded result messages and honours host expansion", () => {
		const { messageRenderers } = loadExtension();
		const registration = messageRenderers.mock.calls.find(([name]) => name === "omps-result");
		expect(registration).toBeDefined();
		const renderer = registration![1];
		const content = [
			"OMPS run run-1 (reader) completed.",
			"Files: /files/run-1",
			"Result:",
			...Array.from({ length: 20 }, (_, index) => `answer ${index + 1}`),
		].join("\n");
		const message = { customType: "omps-result", content };
		const theme = { fg: (_colour: string, text: string) => text, bg: (_colour: string, text: string) => text };
		const collapsed = renderer(message, { expanded: false, outputPad: 0 }, theme).render(120).join("\n");
		expect(collapsed).toContain("12 more lines");
		expect(collapsed).toMatch(/expand/);
		expect(collapsed).toContain("answer 8");
		expect(collapsed).not.toContain("answer 9");
		const expanded = renderer(message, { expanded: true, outputPad: 0 }, theme)
			.render(120)
			.map((line: string) => line.trimEnd())
			.join("\n")
			.trim();
		expect(expanded).toBe(content);
	});

	it("registers only the canonical OMPS tool, commands and transcript renderers", () => {
		const { tools, commands, renderers } = loadExtension();
		expect([...tools.keys()]).toEqual(["omps"]);
		expect([...commands.keys()]).toEqual(["omps", "omps-settings", "subagents-settings"]);
		const names = renderers.mock.calls.map(([name]) => name);
		expect(names).toContain("omps-tree");
		expect(names.some((name) => name.startsWith("ompss-"))).toBe(false);
		for (const spy of Object.values(processSpies)) expect(spy).not.toHaveBeenCalled();
	});

	it("registers the omps tool and the /omps command, and starts no process", () => {
		const { tools, commands } = loadExtension();
		expect([...tools.keys()]).toEqual(["omps"]);
		expect([...commands.keys()]).toEqual(["omps", "omps-settings", "subagents-settings"]);
		for (const [name, spy] of Object.entries(processSpies)) expect(spy, name).not.toHaveBeenCalled();
	});

	it("listens for interactive input, session start, parent turns and shutdown", () => {
		expect([...loadExtension().handlers.keys()].sort()).toEqual([
			"input",
			"session_shutdown",
			"session_start",
			"turn_start",
		]);
	});

	it("registers nothing when OMPS_CHILD=1, so a child never exposes another launcher", () => {
		vi.stubEnv("OMPS_CHILD", "1");
		try {
			const { tools, commands, handlers } = loadExtension();
			expect([...tools.keys(), ...commands.keys(), ...handlers.keys()]).toEqual([]);
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("builds the service only when it is first used", async () => {
		const build = vi.fn(() => fakeService().service);
		const { commands } = loadExtension((pi) => {
			let service: OmpsService | undefined;
			registerOmps(pi, () => (service ??= build()));
		});
		expect(build).not.toHaveBeenCalled();
		await commands.get("omps")!.handler("list", ctx());
		expect(build).toHaveBeenCalledTimes(1);
	});

	it("rejects an unknown action with a clear error and calls nothing", async () => {
		const { service, calls } = fakeService();
		const { tools } = loadExtension((pi) => registerOmps(pi, () => service));
		for (const action of ["bogus", "toString", "constructor", ""]) {
			await expect(tools.get("omps")!.execute("1", { action }, undefined, undefined, ctx())).rejects.toThrow(
				/unknown action .*use list, run, status or cancel/,
			);
		}
		expect(calls).toEqual([]);
	});

	it("describes the four actions in the tool schema", () => {
		const tool = loadExtension().tools.get("omps")!;
		expect(tool.parameters.required).toEqual(["action"]);
		expect(tool.parameters.properties.action.enum).toEqual(["list", "run", "status", "cancel"]);
	});
});

describe("default wiring with no mapping file", () => {
	it("reports no runs for a bare command without reading the registry or starting a child", async () => {
		vi.stubEnv("OMPS_REGISTRY", "/nonexistent/registry.yaml");
		try {
			const notify = vi.fn();
			await loadExtension().commands.get("omps")!.handler("", ctx(notify));
			expect(notify).toHaveBeenCalledExactlyOnceWith("No runs in this session.", "info");
			for (const spy of Object.values(processSpies)) expect(spy).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it("lists zero personas through the command and the tool, with no process", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "omps-agent-"));
		vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
		try {
			const { tools, commands } = loadExtension();
			const notify = vi.fn();
			await commands.get("omps")!.handler("list", ctx(notify));
			expect(notify).toHaveBeenCalledWith("No personas mapped.", "info");
			expect(
				(await tools.get("omps")!.execute("1", { action: "list" }, undefined, undefined, ctx())).content[0].text,
			).toBe("No personas mapped.");
			for (const [name, spy] of Object.entries(processSpies)) expect(spy, name).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllEnvs();
			rmSync(agentDir, { recursive: true, force: true });
		}
	});
});

describe("tool and command apply the same service calls", () => {
	const run = async (action: "tool" | "command", tool: any, command: string) => {
		const { service, calls } = fakeService();
		const { tools, commands } = loadExtension((pi) => registerOmps(pi, () => service));
		const notify = vi.fn();
		if (action === "tool") await tools.get("omps")!.execute("1", tool, undefined, undefined, ctx(notify));
		else await commands.get("omps")!.handler(command, ctx(notify));
		return { calls, notify };
	};

	it.each([
		["list", { action: "list" }, "list", ["list"]],
		[
			"run",
			{ action: "run", agent: "reader", task: "look at src" },
			"run reader look at src",
			["run", "session-1", { agent: "reader", task: "look at src" }, { cwd: "/work", model: "p/m" }],
		],
		["status of one run", { action: "status", runId: "abc" }, "status abc", ["status", "session-1", "abc"]],
		["status of all runs", { action: "status" }, "status", ["status", "session-1", undefined]],
		["cancel", { action: "cancel", runId: "abc" }, "cancel abc", ["cancel", "session-1", "abc"]],
	])("%s", async (_label, toolParams, commandText, expected) => {
		const viaTool = await run("tool", toolParams, "");
		const viaCommand = await run("command", {}, commandText);
		expect(viaCommand.calls).toEqual([expected]);
		expect(viaTool.calls).toEqual(
			viaCommand.calls.map((call) =>
				call[0] === "run" ? [call[0], call[1], { ...(call[2] as object), cwd: undefined }, call[3]] : call,
			),
		);
	});

	it("keeps the whole task text, including spaces and newlines, in the command", async () => {
		const { calls } = await run("command", {}, "run reader first line\nsecond   line");
		expect((calls[0][2] as { task: string }).task).toBe("first line\nsecond   line");
	});

	it("passes the tool's explicit cwd, which the command does not offer", async () => {
		const { calls } = await run("tool", { action: "run", agent: "reader", task: "t", cwd: "/elsewhere" }, "");
		expect((calls[0][2] as { cwd: string }).cwd).toBe("/elsewhere");
	});

	it("returns the service text from the tool and reports it from the command", async () => {
		const { service } = fakeService();
		const { tools, commands } = loadExtension((pi) => registerOmps(pi, () => service));
		const notify = vi.fn();
		expect(
			(await tools.get("omps")!.execute("1", { action: "status" }, undefined, undefined, ctx())).content[0].text,
		).toBe("STATUS");
		await commands.get("omps")!.handler("status", ctx(notify));
		expect(notify).toHaveBeenCalledWith("STATUS", "info");
	});

	it.each(["", "   ", "\n\t  \n"])("treats %j as current-session status", async (input) => {
		const { notify, calls } = await run("command", {}, input);
		expect(calls).toEqual([["status", "session-1", undefined]]);
		expect(notify).toHaveBeenCalledExactlyOnceWith("STATUS", "info");
		for (const spy of Object.values(processSpies)) expect(spy).not.toHaveBeenCalled();
	});

	it.each(["bogus", "run", "run reader", "cancel", "status a b"])(
		"shows usage for the command input %j",
		async (input) => {
			const { notify, calls } = await run("command", {}, input);
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("Usage: /omps"), "warning");
			expect(calls).toEqual([]);
		},
	);

	it("reports a service error from the command as an error notification, and throws it from the tool", async () => {
		const failing = {
			...fakeService().service,
			run: async () => Promise.reject(new Error("unknown agent")),
		} as unknown as OmpsService;
		const { tools, commands } = loadExtension((pi) => registerOmps(pi, () => failing));
		const notify = vi.fn();
		await commands.get("omps")!.handler("run nobody go", ctx(notify));
		expect(notify).toHaveBeenCalledWith("OMPS: unknown agent", "error");
		await expect(
			tools.get("omps")!.execute("1", { action: "run", agent: "nobody", task: "go" }, undefined, undefined, ctx()),
		).rejects.toThrow("unknown agent");
	});
});

describe("SessionBinding", () => {
	const session = (
		hasUI: boolean,
		setStatus: (key: string, text: string | undefined) => void = vi.fn(),
		setWidget = vi.fn(),
		owner = "session-1",
	) => ({ hasUI, ui: { setStatus, setWidget }, sessionManager: { getSessionId: () => owner } }) as never;
	const pi = (sendMessage = vi.fn()) => ({ sendMessage }) as never;

	it("has no messenger before a session is bound", () => {
		expect(new SessionBinding().messenger(pi())).toBeUndefined();
	});

	it("sends through pi.sendMessage and sets the status line when there is a UI", async () => {
		const sendMessage = vi.fn();
		const setStatus = vi.fn();
		const binding = new SessionBinding();
		binding.bind(session(true, setStatus));
		const messenger = binding.messenger(pi(sendMessage))!;

		await messenger.send(
			{ customType: "x", content: "c", display: true, details: {} },
			{ deliverAs: "followUp", triggerTurn: true },
		);
		messenger.setStatus!("omps: reader running");
		expect(sendMessage).toHaveBeenCalledWith(
			{ customType: "x", content: "c", display: true, details: {} },
			{ deliverAs: "followUp", triggerTurn: true },
		);
		expect(setStatus).toHaveBeenCalledWith("omps", "omps: reader running");
		expect(binding.owner).toBe("session-1");
	});

	it("sets a string widget below the editor and adapts live components for its owner only", () => {
		const binding = new SessionBinding();
		const setWidget = vi.fn();
		binding.bind(session(true, vi.fn(), setWidget));
		const messenger = binding.messenger(pi(), "session-1")!;
		messenger.setWidget!(["OMPS: reader running"]);
		expect(setWidget).toHaveBeenCalledWith("omps", ["OMPS: reader running"], { placement: "belowEditor" });
		// Interactive hosts keep a live component fed with real terminal facts.
		const painted: string[] = [];
		messenger.setWidget!((terminal) => ({
			render: (width) => (painted.push(`rows=${terminal.rows} width=${width}`), []),
			invalidate: () => terminal.requestRender(),
		}));
		const factory = setWidget.mock.calls.at(-1)![1] as (tui: unknown, theme: unknown) => unknown;
		expect(factory).toBeTypeOf("function");
		let rendered = 0;
		const component = factory(
			{
				terminal: { rows: 24 },
				requestRender: () => {
					rendered++;
				},
			},
			undefined,
		) as { render(width: number): string[]; invalidate(): void };
		expect(component.render(0)).toEqual([]);
		expect(painted).toEqual(["rows=24 width=0"]);
		component.invalidate();
		expect(rendered).toBe(1);
		expect(binding.messenger(pi(), "foreign")).toBeUndefined();
	});

	it("clears both displays before detaching and drops stale messenger callbacks", async () => {
		const binding = new SessionBinding();
		const setStatus = vi.fn();
		const setWidget = vi.fn();
		const sendMessage = vi.fn();
		binding.bind(session(true, setStatus, setWidget));
		const old = binding.messenger(pi(sendMessage))!;
		binding.end();
		expect(setStatus).toHaveBeenCalledExactlyOnceWith("omps", undefined);
		// Both fleet widgets go: the list under the original key and the tree under its own.
		expect(setWidget.mock.calls).toEqual([
			["omps", undefined],
			["omps-agents", undefined],
		]);
		old.setStatus!("late");
		old.setWidget!(["late"]);
		// A dropped send must reject, so the delivery record cannot claim success.
		await expect(
			old.send(
				{ customType: "x", content: "late", display: true, details: {} },
				{ deliverAs: "followUp", triggerTurn: true },
			),
		).rejects.toThrow("the owning session has ended");
		expect(sendMessage).not.toHaveBeenCalled();
		expect(setWidget).toHaveBeenCalledTimes(2);
		expect(setStatus).toHaveBeenCalledTimes(1);
	});

	it("drops captured callbacks after rebinding to a different session", async () => {
		const binding = new SessionBinding();
		const setWidget = vi.fn();
		const sendMessage = vi.fn();
		binding.bind(session(true, vi.fn(), setWidget));
		const old = binding.messenger(pi(sendMessage))!;
		binding.bind(session(true, vi.fn(), vi.fn(), "replacement"));
		old.setWidget!(["late"]);
		await expect(
			old.send(
				{ customType: "x", content: "late", display: true, details: {} },
				{ deliverAs: "followUp", triggerTurn: true },
			),
		).rejects.toThrow("the owning session has ended");
		expect(setWidget).not.toHaveBeenCalled();
		expect(sendMessage).not.toHaveBeenCalled();
	});

	it("still clears the widget and detaches when status clearing throws", () => {
		const binding = new SessionBinding();
		const setWidget = vi.fn();
		binding.bind(
			session(
				true,
				() => {
					throw new Error("broken status");
				},
				setWidget,
			),
		);
		expect(() => binding.end()).not.toThrow();
		expect(setWidget).toHaveBeenCalledWith("omps", undefined);
		expect(binding.owner).toBeUndefined();
	});

	it("offers no status line or widget without a UI", () => {
		const binding = new SessionBinding();
		binding.bind(session(false));
		expect(binding.messenger(pi())!.setStatus).toBeUndefined();
		expect(binding.messenger(pi())!.setWidget).toBeUndefined();
	});

	it("drops the session when it ends and ignores a later bind", () => {
		const binding = new SessionBinding();
		binding.bind(session(true));
		binding.end();
		expect(binding.messenger(pi())).toBeUndefined();
		expect(binding.owner).toBeUndefined();
		binding.bind(session(true));
		expect(binding.messenger(pi())).toBeUndefined();
	});
});

describe("old namespace rejection", () => {
	it("ignores the old binary environment override", () => {
		expect(resolvePiBin("/agent", { OMPSS_PI_BIN: "/old/pi" }, () => false)).toBe("pi");
	});

	it("ignores the old registry environment override", () => {
		expect(resolveRegistryPath("/agent", { OMPSS_REGISTRY: "/old/agents.yaml" })).toBe("/agent/omps/config.yaml");
	});

	it("refuses a process marked only as an old child before registering an unguarded launcher", () => {
		vi.stubEnv("OMPS_CHILD", "");
		vi.stubEnv("OMPSS_CHILD", "1");
		try {
			expect(() => loadExtension()).toThrow(/old.*child|restart/i);
			for (const spy of Object.values(processSpies)) expect(spy).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

describe("resolvePiBin", () => {
	it("prefers the explicit override", () => {
		expect(resolvePiBin("/agent", { OMPS_PI_BIN: "/custom/pi" }, () => true)).toBe("/custom/pi");
	});

	it("uses the managed launcher of the agent directory when it exists", () => {
		expect(resolvePiBin("/agent", {}, (path) => path === "/agent/bin/pi")).toBe("/agent/bin/pi");
	});

	it("falls back to pi on the PATH", () => {
		expect(resolvePiBin("/agent", {}, () => false)).toBe("pi");
	});
});

describe("resolveRegistryPath", () => {
	it("prefers the explicit override", () => {
		expect(resolveRegistryPath("/agent", { OMPS_REGISTRY: "/custom/agents.yaml" })).toBe("/custom/agents.yaml");
	});

	it("reads the operator's file in the OMPS folder, outside the installed package", () => {
		expect(resolveRegistryPath("/agent", {})).toBe("/agent/omps/config.yaml");
	});
});
