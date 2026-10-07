import { fixtureRegistryPath } from "./registry.ts";
import type { ChildProcess } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSnapshot, RunLimits } from "../../src/config.ts";
import { RunManager, type RunState, type RunView } from "../../src/runs.ts";
import { createSupervisor, type SupervisorDeps } from "../../src/supervisor.ts";
import type { Turn } from "./fake-model.ts";
import { createWorkspace, PI_BIN, type Workspace, type WorkspaceOptions } from "./pi-rpc.ts";

const GUARD = new URL("../../src/child-guard.ts", import.meta.url).pathname;

export interface Persisted {
	kind: "final" | "partial";
	text: string;
}

export interface SupervisedOptions {
	tools?: string[];
	limits?: RunLimits;
	script?: (cwd: string) => Turn[];
	extensions?: string[];
	seed?: WorkspaceOptions["seed"];
	/** Overrides for the supervisor's dependencies, for example deadlines or a gated `persist`. */
	deps?: Partial<SupervisorDeps>;
}

export interface Supervised {
	workspace: Workspace;
	manager: RunManager;
	owner: string;
	persisted: Persisted[];
	/** Process IDs of every child the supervisor started. */
	pids: number[];
	/** The child processes themselves, for tests that break their pipes. */
	children: ChildProcess[];
	/** Identify a child without depending on concurrent spawn order. */
	childFor(runId: string): ChildProcess | undefined;
	/** Process ID of the MCP fixture server, a descendant of the child, once it has started. */
	mcpPid(): Promise<number | undefined>;
	/** Distinct states the run passed through, sampled while it lived. */
	states: RunState[];
	/** Start a run with the given task. */
	start(task?: string): RunView;
	/** Resolves with the final view of a run. */
	done(runId: string): Promise<RunView>;
}

/** A RunManager wired to the real supervisor, a real Pi child and the counting fake model. */
export function supervisedHarness() {
	let workspace: Workspace | undefined;
	const pids: number[] = [];
	const children: ChildProcess[] = [];

	return {
		async setup(options: SupervisedOptions = {}): Promise<Supervised> {
			workspace = await createWorkspace({ seed: options.seed });
			const ws = workspace;
			if (options.script) ws.model.script = options.script(ws.cwd);

			const persisted: Persisted[] = [];
			const byRun = new Map<string, ChildProcess>();
			const finals = new Map<string, (view: RunView) => void>();
			const finished = new Map<string, Promise<RunView>>();
			const awaitFinal = (runId: string) =>
				finished.get(runId) ??
				finished.set(runId, new Promise<RunView>((resolve) => finals.set(runId, resolve))).get(runId)!;

			const supervisor = createSupervisor({
				piBin: PI_BIN,
				guardPath: GUARD,
				parentModel: "fake/counter",
				env: { ...process.env, ...ws.isolationEnv, OMPS_REGISTRY: fixtureRegistryPath(ws.agentDir) },
				prepare: async (run) => {
					const directory = join(ws.root, "runs", run.id);
					await mkdir(directory, { recursive: true });
					await writeFile(join(directory, "persona.md"), "Persona.");
					return { personaFile: join(directory, "persona.md") };
				},
				persist: async (_run, result) => void persisted.push(result),
				onChild: (run, child) => void (pids.push(child.pid!), children.push(child), byRun.set(run.id, child)),
				...options.deps,
			});
			const manager = new RunManager(supervisor, { onTerminal: (view) => finals.get(view.id)?.(view) });

			const owner = "session-1";
			const states: RunState[] = [];
			const snapshot: AgentSnapshot = {
				name: "agent",
				personaPath: "unused",
				persona: "Persona.",
				tools: options.tools ?? ["read"],
				thinking: "off",
				skills: [],
				extensions: options.extensions ?? [],
			};

			return {
				workspace: ws,
				manager,
				owner,
				persisted,
				pids,
				children,
				childFor: (runId) => byRun.get(runId),
				states,
				mcpPid: async () => {
					const text = await readFile(ws.mcpPidFile, "utf8").catch(() => "");
					return text ? Number(text) : undefined;
				},
				async done(runId) {
					const view = await awaitFinal(runId);
					if (states.at(-1) !== view.state) states.push(view.state);
					return view;
				},
				start(task = "do the task") {
					const run = manager.start(owner, { agent: snapshot, task, cwd: ws.cwd, limits: options.limits });
					awaitFinal(run.id);
					const sample = setInterval(() => {
						const state = manager.status(owner, run.id).state;
						if (states.at(-1) !== state) states.push(state);
						if (state === "completed" || state === "failed" || state === "cancelled") clearInterval(sample);
					}, 5);
					states.push(run.state);
					return run;
				},
			};
		},

		async cleanup(): Promise<void> {
			for (const pid of pids) {
				try {
					process.kill(-pid, "SIGKILL");
				} catch {
					// already gone
				}
			}
			pids.length = 0;
			children.length = 0;
			await workspace?.dispose();
			workspace = undefined;
		},
	};
}
