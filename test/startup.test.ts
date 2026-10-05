// Start-up gate against the real Pi 0.99.1 CLI. Every failure must leave the fake model with zero requests.
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import type { AgentSnapshot } from "../src/config.ts";
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../src/protocol.ts";
import { stopGroup, type LaunchInput } from "../src/runner.ts";
import { launchChild, StartupError, type ReadyChild } from "../src/startup.ts";
import { createWorkspace, PI_BIN, type Workspace } from "./fixtures/pi-rpc.ts";

import { fixtureLineage } from "./fixtures/lineage.ts";

const GUARD = new URL("../src/child-guard.ts", import.meta.url).pathname;

let workspace: Workspace | undefined;
let ready: ReadyChild | undefined;
let scratch: string | undefined;

afterEach(async () => {
	if (ready) await stopGroup(ready.child, ready.channel.exited);
	await workspace?.dispose();
	if (scratch) await rm(scratch, { recursive: true, force: true });
	workspace = undefined;
	ready = undefined;
	scratch = undefined;
});

/** Write a helper file outside the workspace, so its path is known before the workspace exists. */
async function scratchFile(name: string, content: string, mode = 0o644): Promise<string> {
	scratch ??= await mkdtemp(join(tmpdir(), "ompss-scratch-"));
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with fixed filenames below a generated temporary root.
	const path = join(scratch, name);
	await writeFile(path, content);
	await chmod(path, mode);
	return path;
}

interface Attempt {
	tools?: string[];
	model?: string;
	guardPath?: string;
	cwd?: string;
	piBin?: string;
	startupDeadlineMs?: number;
	env?: Record<string, string>;
	seed?: (paths: { cwd: string; agentDir: string }) => Promise<void>;
}

/** Start a child through the gate. Resolves to the ready child or the StartupError. */
async function attempt(options: Attempt = {}): Promise<ReadyChild | StartupError> {
	workspace = await createWorkspace({ seed: options.seed });
	// nosemgrep: AIK_ts_generic_path_traversal -- The workspace root is generated and the fixture filename is fixed.
	await writeFile(join(workspace.root, "persona.md"), "Persona.");
	const snapshot: AgentSnapshot = {
		name: "reader",
		personaPath: "unused",
		persona: "Persona.",
		tools: options.tools ?? ["read"],
		thinking: "off",
		skills: [],
		extensions: [],
	};
	const input: LaunchInput = {
		snapshot,
		cwd: options.cwd ?? workspace.cwd,
		// nosemgrep: AIK_ts_generic_path_traversal -- The workspace root is generated and the fixture filename is fixed.
		personaFile: join(workspace.root, "persona.md"),
		guardPath: options.guardPath ?? GUARD,
		runToken: "run-token",
		lineage: fixtureLineage(join(workspace.agentDir, "om-pi-subagents.yaml")),
		piBin: options.piBin ?? PI_BIN,
		parentModel: options.model ?? "fake/counter",
		startupDeadlineMs: options.startupDeadlineMs ?? 15_000,
		env: { ...process.env, ...workspace.isolationEnv, ...options.env },
	};
	const outcome = await launchChild(input).catch((error: unknown) => error);
	if (outcome instanceof StartupError) return outcome;
	if (outcome instanceof Error) throw outcome;
	ready = outcome as ReadyChild;
	return ready;
}

const isRunning = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

describe("ready child", () => {
	it("passes the gate with no model request and no model run", async () => {
		const result = await attempt({ tools: ["read", "grep"] });
		expect(result).not.toBeInstanceOf(StartupError);
		const child = result as ReadyChild;
		expect(child.readiness).toMatchObject({ ok: true, problems: [], tools: ["read", "grep"], model: "fake/counter" });
		expect(child.channel.records.some((record) => record.type === "agent_start")).toBe(false);
		expect(workspace!.model.requests).toHaveLength(0);
	});

	it("waits for a slow MCP registration that arrives before the deadline", async () => {
		const result = await attempt({ tools: ["read", "mcp__fixture__lookup"], env: { MCP_START_DELAY_MS: "1500" } });
		expect(result).not.toBeInstanceOf(StartupError);
		expect((result as ReadyChild).readiness.tools).toContain("mcp__fixture__lookup");
		expect(workspace!.model.requests).toHaveLength(0);
	});
});

describe("startup failures", () => {
	const expectFailure = async (options: Attempt, message: RegExp): Promise<StartupError> => {
		const result = await attempt(options);
		expect(result).toBeInstanceOf(StartupError);
		expect((result as StartupError).message).toMatch(message);
		expect(workspace!.model.requests).toHaveLength(0);
		return result as StartupError;
	};

	it("fails with native-name guidance when the obsolete `mcp` tool is requested", async () => {
		await expectFailure(
			{ tools: ["read", "mcp"], startupDeadlineMs: 5000 },
			/obsolete MCP proxy.*mcp__<server>__<tool>/,
		);
	});

	it("fails when a required MCP tool registers only after the deadline, and does not revive the run", async () => {
		const failure = await expectFailure(
			{ tools: ["read", "mcp__fixture__lookup"], env: { MCP_START_DELAY_MS: "9000" }, startupDeadlineMs: 4000 },
			/mcp__fixture__lookup.*not registered|not ready within/,
		);
		await new Promise((done) => setTimeout(done, 1000));
		expect(isRunning(failure.pid!)).toBe(false);
	});

	it("fails when the guard extension cannot load", async () => {
		const failure = await expectFailure(
			{ guardPath: "/nonexistent/child-guard.ts" },
			/child exited before it was ready/,
		);
		expect(failure.stderr).toContain("Extension path does not exist");
	});

	it("fails when the model is not in the registry, although Pi would accept it as a custom id", async () => {
		await expectFailure({ model: "fake/no-such-model" }, /fake\/no-such-model is not in the model registry/);
	});

	it("fails when the provider is unknown", async () => {
		await expectFailure({ model: "nowhere/nope" }, /child exited before it was ready/);
	});

	it("fails before spawning when the working directory is missing or relative", async () => {
		const marker = join(tmpdir(), `ompss-spawned-${process.pid}`);
		const piBin = await scratchFile("fake-pi.sh", `#!/bin/sh\ntouch ${marker}\n`, 0o755);
		await rm(marker, { force: true });

		await expectFailure({ cwd: "/nonexistent/work", piBin }, /does not exist or is not a directory/);
		await expectFailure({ cwd: "work", piBin }, /must be absolute/);
		await expect(stat(marker)).rejects.toThrow();
	});

	it("fails when the executable cannot start", async () => {
		await expectFailure(
			{ piBin: "/nonexistent/pi" },
			/cannot start \/nonexistent\/pi|child exited before it was ready/,
		);
	});

	it("fails on a malformed readiness entry", async () => {
		const guardPath = await scratchFile(
			"rogue-guard.ts",
			`export default (pi) => pi.registerCommand(${JSON.stringify(PREFLIGHT_COMMAND)}, { description: "rogue", handler: async () => pi.appendEntry(${JSON.stringify(READY_ENTRY)}, { token: "run-token", ok: "yes" }) });`,
		);
		await expectFailure({ guardPath }, /malformed readiness/);
	});

	/** A guard that runs `before`, then reports itself ready with `cwdExpression` as its working directory. */
	const rogueGuard = (cwdExpression: string, before = "") =>
		scratchFile(
			"rogue-guard.ts",
			`export default (pi) => pi.registerCommand(${JSON.stringify(PREFLIGHT_COMMAND)}, { description: "rogue", handler: async (_args, ctx) => {
        ${before}
        pi.appendEntry(${JSON.stringify(READY_ENTRY)}, { token: "run-token", ok: true, problems: [], tools: ["read"], model: "fake/counter", cwd: ${cwdExpression}, lineage: JSON.parse(process.env.OMPSS_POLICY).lineage });
      } });`,
		);

	it("fails when the child reports a different working directory", async () => {
		// `/` exists on every platform and is never the test's working directory.
		await expectFailure({ guardPath: await rogueGuard('"/"') }, /reports working directory \/, expected /);
	});

	it("fails when a model run starts before readiness", async () => {
		// The run ends before the guard reports ready, so its events reach the parent first. The gate can only
		// promise to catch a run reported before readiness. The real guard refuses such prompts outright.
		const sneak =
			'const ended = new Promise((done) => pi.on("agent_end", done)); pi.sendUserMessage("sneaky"); await ended;';
		const result = await attempt({ guardPath: await rogueGuard("ctx.cwd", sneak) });
		expect(result).toBeInstanceOf(StartupError);
		expect((result as StartupError).message).toMatch(/model run started before readiness/);
	});

	it("fails when Pi resolves a fuzzy model name to a different model", async () => {
		await expectFailure({ model: "fake/coun" }, /model fake\/counter differs from the expected fake\/coun/);
	});

	it("fails when the model's provider has no configured authentication", async () => {
		const seed = async ({ agentDir }: { agentDir: string }) => {
			// nosemgrep: AIK_ts_generic_path_traversal -- The test agent directory is generated and the configuration filename is fixed.
			const file = join(agentDir, "models.json");
			// nosemgrep: AIK_ts_generic_path_traversal -- The file was constructed from the generated test agent directory and a fixed filename.
			const config = JSON.parse(await readFile(file, "utf8"));
			config.providers.noauth = { ...config.providers.fake, apiKey: undefined };
			await writeFile(file, JSON.stringify(config));
		};
		await expectFailure({ model: "noauth/counter", seed }, /noauth\/counter has no configured authentication/);
	});

	it("fails at the deadline when the guard never answers, and kills the child", async () => {
		const guardPath = await scratchFile(
			"hanging-guard.ts",
			`export default (pi) => pi.registerCommand(${JSON.stringify(PREFLIGHT_COMMAND)}, { description: "hangs", handler: () => new Promise(() => {}) });`,
		);
		const failure = await expectFailure({ guardPath, startupDeadlineMs: 1000 }, /not ready within 3000 ms/);
		expect(isRunning(failure.pid!)).toBe(false);
	});
});
