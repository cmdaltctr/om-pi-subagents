import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnChild, type LaunchPlan } from "../../src/runner.ts";
import { startFakeModel, type FakeModel } from "./fake-model.ts";

import { resolveTestPi } from "./pi-bin.ts";

/** Real-CLI suites skip when the override, pinned host CLI and PATH CLI are all unavailable. */
const executable = resolveTestPi();
export const PI_AVAILABLE = executable !== undefined;
export const PI_BIN = executable ?? "pi";
export const MCP_SERVER = new URL("./mcp-server.mjs", import.meta.url).pathname;

export type PiRecord = Record<string, any>;

export interface WorkspaceOptions {
	/** Write an MCP config that exposes the local fixture server. Default true. */
	mcp?: boolean;
	/** MCP servers to configure, with the tool names each one offers. Default: `fixture` with lookup, delete, peek. */
	mcpServers?: Record<string, { tools: string[] }>;
	/** Plant files before start-up, for example ambient extensions the child must not load. */
	seed?: (paths: { cwd: string; agentDir: string; home: string; model: FakeModel }) => Promise<void>;
}

/** A counting fake model, an isolated agent directory and a working directory. No Pi process yet. */
export interface Workspace {
	readonly model: FakeModel;
	readonly root: string;
	readonly agentDir: string;
	readonly cwd: string;
	readonly mcpCallLog: string;
	/** File the MCP fixture creates once Pi has listed its tools. */
	readonly mcpReadyFile: string;
	/** File holding the process ID of the MCP fixture server, a descendant of the Pi child. */
	readonly mcpPidFile: string;
	/** Environment that points a Pi child at the isolated agent directory and keeps it offline. */
	readonly isolationEnv: Record<string, string>;
	dispose(): Promise<void>;
}

export async function createWorkspace(options: WorkspaceOptions = {}): Promise<Workspace> {
	const model = await startFakeModel();
	const root = await mkdtemp(join(tmpdir(), "omps-pi-"));
	const agentDir = join(root, "agent");
	const cwd = join(root, "work");
	const mcpCallLog = join(root, "mcp-calls.log");
	const mcpReadyFile = join(root, "mcp-ready");
	const mcpPidFile = join(root, "mcp.pid");
	await mkdir(agentDir, { recursive: true });
	await mkdir(cwd, { recursive: true });
	await mkdir(join(root, "home"));
	await mkdir(join(root, "config"));
	await writeFile(
		join(agentDir, "models.json"),
		JSON.stringify({
			providers: {
				fake: { baseUrl: model.baseUrl, api: "openai-completions", apiKey: "fake-key", models: [{ id: "counter" }] },
			},
		}),
	);
	if (options.mcp !== false) {
		await writeFile(
			join(agentDir, "mcp.json"),
			JSON.stringify({
				mcpServers: Object.fromEntries(
					Object.entries(options.mcpServers ?? { fixture: { tools: ["lookup", "delete", "peek"] } }).map(
						([name, { tools }]) => [
							name,
							{
								command: process.execPath,
								args: [MCP_SERVER],
								env: { MCP_TOOLS: tools.join(",") },
								exposure: "deferred",
							},
						],
					),
				),
			}),
		);
	}
	await options.seed?.({ cwd, agentDir, home: join(root, "home"), model });
	return {
		model,
		root,
		agentDir,
		cwd,
		mcpCallLog,
		mcpReadyFile,
		mcpPidFile,
		isolationEnv: {
			HOME: join(root, "home"),
			XDG_CONFIG_HOME: join(root, "config"),
			PI_CODING_AGENT_DIR: agentDir,
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
			MCP_CALL_LOG: mcpCallLog,
			MCP_READY_FILE: mcpReadyFile,
			MCP_PID_FILE: mcpPidFile,
		},
		async dispose() {
			await model.close();
			// Late writes from a stopping Pi can race the delete on Linux (ENOTEMPTY). rm retries those.
			await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		},
	};
}

export interface PiFixture extends Workspace {
	readonly records: PiRecord[];
	readonly stderr: () => string;
	readonly child: ChildProcess;
	send(command: PiRecord): Promise<PiRecord>;
	waitFor(predicate: (record: PiRecord) => boolean, timeoutMs?: number): Promise<PiRecord>;
	exit(): Promise<number | null>;
}

export interface FixtureOptions extends WorkspaceOptions {
	/** Extra CLI arguments placed after the fixed isolation flags. */
	args?: string[];
	/** Extra environment for the child. */
	env?: Record<string, string>;
	/** Build the command line with OMPS's own launcher instead of the fixed isolation flags. */
	launch?: (paths: { cwd: string; agentDir: string }) => LaunchPlan;
	/** Reuse a caller-owned workspace; the caller then disposes it after every fixture. */
	workspace?: Workspace;
}

/**
 * Start a real Pi child in RPC mode with an isolated agent directory, a counting fake model
 * and a local MCP server. No real credentials, settings or network are involved.
 */
export async function startPi(options: FixtureOptions = {}): Promise<PiFixture> {
	const workspace = options.workspace ?? (await createWorkspace(options));
	const { cwd, agentDir, isolationEnv } = workspace;
	const child = options.launch
		? spawnChild(
				(({ env, ...plan }) => ({ ...plan, env: { ...env, ...isolationEnv, ...options.env } }))(
					options.launch({ cwd, agentDir }),
				),
			)
		: spawn(
				PI_BIN,
				[
					"--mode",
					"rpc",
					"--no-session",
					"--provider",
					"fake",
					"--model",
					"counter",
					"--no-extensions",
					"--no-skills",
					"--no-themes",
					...(options.args ?? []),
				],
				{
					cwd,
					shell: false,
					stdio: ["pipe", "pipe", "pipe"],
					env: { ...process.env, ...isolationEnv, ...options.env },
				},
			);

	const records: PiRecord[] = [];
	const waiters: Array<() => void> = [];
	let errors = "";
	let buffer = Buffer.alloc(0);
	child.stdout!.on("data", (data: Buffer) => {
		buffer = Buffer.concat([buffer, data]);
		let newline: number;
		while ((newline = buffer.indexOf(0x0a)) >= 0) {
			const line = buffer.subarray(0, newline).toString("utf8").replace(/\r$/, "");
			buffer = buffer.subarray(newline + 1);
			if (line) records.push(JSON.parse(line));
		}
		for (const wake of waiters.splice(0)) wake();
	});
	child.stderr!.on("data", (data: Buffer) => (errors += data.toString("utf8")));
	const exited = new Promise<number | null>((done) => child.on("close", (code) => done(code)));

	let counter = 0;
	const fixture: PiFixture = {
		...workspace,
		records,
		stderr: () => errors,
		child,
		waitFor(predicate, timeoutMs = 20_000) {
			return new Promise((resolve, reject) => {
				const timer = setTimeout(
					() =>
						reject(
							new Error(`timed out; last records: ${JSON.stringify(records.slice(-5))}; stderr: ${errors.slice(-500)}`),
						),
					timeoutMs,
				);
				const check = () => {
					const found = records.find(predicate);
					if (found) return (clearTimeout(timer), resolve(found));
					waiters.push(check);
				};
				check();
			});
		},
		send(command) {
			const id = `t-${++counter}`;
			child.stdin!.write(`${JSON.stringify({ id, ...command })}\n`);
			return fixture.waitFor((record) => record.type === "response" && record.id === id);
		},
		async exit() {
			child.stdin!.end();
			return exited;
		},
		async dispose() {
			if (child.exitCode === null) child.kill("SIGKILL");
			await exited;
			// A caller-owned workspace outlives this fixture and is disposed by its owner.
			if (!options.workspace) await workspace.dispose();
		},
	};
	return fixture;
}
