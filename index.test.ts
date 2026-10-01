import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import ompss, { registerOmpss, resolvePiBin, resolveRegistryPath, SessionBinding } from "./index.ts";
import type { OmpssService } from "./service.ts";

type Notify = (message: string, level: string) => void;
type Ctx = {
	cwd: string;
	model?: { provider: string; id: string };
	sessionManager: { getSessionId: () => string };
	ui: { notify: Notify };
};
type Tool = {
	name: string;
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

function loadExtension(register: (pi: any) => void = (pi) => ompss(pi)) {
	const tools = new Map<string, Tool>();
	const commands = new Map<string, Command>();
	const handlers = new Map<string, (event: unknown, ctx: Ctx) => unknown>();
	register({
		registerTool: (tool: Tool) => tools.set(tool.name, tool),
		registerCommand: (name: string, command: Command) => commands.set(name, command),
		on: (event: string, handler: (event: unknown, ctx: Ctx) => unknown) => handlers.set(event, handler),
		getThinkingLevel: () => "medium",
	});
	return { tools, commands, handlers };
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
		list: async () => (calls.push(["list"]), "LIST"),
		run: async (...args: unknown[]) => (calls.push(["run", ...args]), "RUN"),
		status: (...args: unknown[]) => (calls.push(["status", ...args]), "STATUS"),
		cancel: (...args: unknown[]) => (calls.push(["cancel", ...args]), "CANCEL"),
	} as unknown as OmpssService;
	return { service, calls };
}

beforeEach(() => {
	for (const spy of Object.values(processSpies)) spy.mockClear();
});

describe("registration", () => {
	it("registers the ompss tool and the /ompss command, and starts no process", () => {
		const { tools, commands } = loadExtension();
		expect([...tools.keys()]).toEqual(["ompss"]);
		expect([...commands.keys()]).toEqual(["ompss"]);
		for (const [name, spy] of Object.entries(processSpies)) expect(spy, name).not.toHaveBeenCalled();
	});

	it("listens for the session start and shutdown", () => {
		expect([...loadExtension().handlers.keys()].sort()).toEqual(["session_shutdown", "session_start"]);
	});

	it("registers nothing when OMPSS_CHILD=1, so a child never exposes another launcher", () => {
		vi.stubEnv("OMPSS_CHILD", "1");
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
			let service: OmpssService | undefined;
			registerOmpss(pi, () => (service ??= build()));
		});
		expect(build).not.toHaveBeenCalled();
		await commands.get("ompss")!.handler("list", ctx());
		expect(build).toHaveBeenCalledTimes(1);
	});

	it("rejects an unknown action with a clear error and calls nothing", async () => {
		const { service, calls } = fakeService();
		const { tools } = loadExtension((pi) => registerOmpss(pi, () => service));
		for (const action of ["bogus", "toString", "constructor", ""]) {
			await expect(tools.get("ompss")!.execute("1", { action }, undefined, undefined, ctx())).rejects.toThrow(
				/unknown action .*use list, run, status or cancel/,
			);
		}
		expect(calls).toEqual([]);
	});

	it("describes the four actions in the tool schema", () => {
		const tool = loadExtension().tools.get("ompss")!;
		expect(tool.parameters.required).toEqual(["action"]);
		expect(tool.parameters.properties.action.enum).toEqual(["list", "run", "status", "cancel"]);
	});
});

describe("default wiring with no mapping file", () => {
	it("lists zero personas through the command and the tool, with no process", async () => {
		const agentDir = mkdtempSync(join(tmpdir(), "ompss-agent-"));
		vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
		try {
			const { tools, commands } = loadExtension();
			const notify = vi.fn();
			await commands.get("ompss")!.handler("list", ctx(notify));
			expect(notify).toHaveBeenCalledWith("No personas mapped.", "info");
			expect(
				(await tools.get("ompss")!.execute("1", { action: "list" }, undefined, undefined, ctx())).content[0].text,
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
		const { tools, commands } = loadExtension((pi) => registerOmpss(pi, () => service));
		const notify = vi.fn();
		if (action === "tool") await tools.get("ompss")!.execute("1", tool, undefined, undefined, ctx(notify));
		else await commands.get("ompss")!.handler(command, ctx(notify));
		return { calls, notify };
	};

	it.each([
		["list", { action: "list" }, "list", ["list"]],
		[
			"run",
			{ action: "run", agent: "reader", task: "look at src" },
			"run reader look at src",
			[
				"run",
				"session-1",
				{ agent: "reader", task: "look at src" },
				{ cwd: "/work", model: "p/m", thinking: "medium" },
			],
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
		const { tools, commands } = loadExtension((pi) => registerOmpss(pi, () => service));
		const notify = vi.fn();
		expect(
			(await tools.get("ompss")!.execute("1", { action: "status" }, undefined, undefined, ctx())).content[0].text,
		).toBe("STATUS");
		await commands.get("ompss")!.handler("status", ctx(notify));
		expect(notify).toHaveBeenCalledWith("STATUS", "info");
	});

	it.each(["", "bogus", "run", "run reader", "cancel", "status a b"])(
		"shows usage for the command input %j",
		async (input) => {
			const { notify, calls } = await run("command", {}, input);
			expect(notify).toHaveBeenCalledWith(expect.stringContaining("Usage: /ompss"), "warning");
			expect(calls).toEqual([]);
		},
	);

	it("reports a service error from the command as an error notification, and throws it from the tool", async () => {
		const failing = {
			...fakeService().service,
			run: async () => Promise.reject(new Error("unknown agent")),
		} as unknown as OmpssService;
		const { tools, commands } = loadExtension((pi) => registerOmpss(pi, () => failing));
		const notify = vi.fn();
		await commands.get("ompss")!.handler("run nobody go", ctx(notify));
		expect(notify).toHaveBeenCalledWith("OMPSS: unknown agent", "error");
		await expect(
			tools.get("ompss")!.execute("1", { action: "run", agent: "nobody", task: "go" }, undefined, undefined, ctx()),
		).rejects.toThrow("unknown agent");
	});
});

describe("SessionBinding", () => {
	const session = (hasUI: boolean, setStatus = vi.fn()) =>
		({ hasUI, ui: { setStatus }, sessionManager: { getSessionId: () => "session-1" } }) as never;
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
		messenger.setStatus!("ompss: reader running");
		expect(sendMessage).toHaveBeenCalledWith(
			{ customType: "x", content: "c", display: true, details: {} },
			{ deliverAs: "followUp", triggerTurn: true },
		);
		expect(setStatus).toHaveBeenCalledWith("ompss", "ompss: reader running");
		expect(binding.owner).toBe("session-1");
	});

	it("offers no status line without a UI", () => {
		const binding = new SessionBinding();
		binding.bind(session(false));
		expect(binding.messenger(pi())!.setStatus).toBeUndefined();
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

describe("resolvePiBin", () => {
	it("prefers the explicit override", () => {
		expect(resolvePiBin("/agent", { OMPSS_PI_BIN: "/custom/pi" }, () => true)).toBe("/custom/pi");
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
		expect(resolveRegistryPath("/agent", { OMPSS_REGISTRY: "/custom/agents.yaml" })).toBe("/custom/agents.yaml");
	});

	it("reads the operator's file in the agent directory, outside the installed package", () => {
		expect(resolveRegistryPath("/agent", {})).toBe("/agent/om-pi-subagents.yaml");
	});
});
