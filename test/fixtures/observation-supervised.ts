import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChildProcess } from "node:child_process";
import { ObservationRelay } from "../../observation-relay.ts";
import { TransportObservationStore } from "../../observation-transport.ts";
import { RunManager, type RunView } from "../../runs.ts";
import { createSupervisor, type SupervisorDeps } from "../../supervisor.ts";
import { createWorkspace, PI_BIN } from "./pi-rpc.ts";

/** Wire the real child transport to the same observation hooks as the lazy runtime. */
export async function observationSupervised(overrides: Partial<SupervisorDeps> = {}) {
	const workspace = await createWorkspace({ mcp: false });
	const owner = "observation-root";
	const observations = new TransportObservationStore();
	const children: ChildProcess[] = [];
	const saved: string[] = [];
	const terminal: RunView[] = [];
	const registryPath = join(workspace.agentDir, "registry.yaml");
	const personaFile = join(workspace.agentDir, "persona.md");
	await writeFile(personaFile, "OBSERVATION_TEST_PERSONA");
	const relay = new ObservationRelay({ observations, current: (run) => manager.status(run.owner, run.id) });
	const supervisor = createSupervisor({
		piBin: PI_BIN,
		guardPath: new URL("../../child-guard.ts", import.meta.url).pathname,
		parentModel: "fake/counter",
		env: { ...process.env, ...workspace.isolationEnv },
		prepare: async () => ({ personaFile }),
		persist: async (_run, result) => {
			saved.push(result.text);
		},
		onChild: (_run, child) => {
			children.push(child);
		},
		onReady: (run, info) => relay.onReady(run, info),
		onProgress: (run, record) => relay.onProgress(run, record),
		onObservation: (run, channel, token) => relay.connect(run, channel, token),
		onDisplayFailure: (run) => observations.markIncomplete({ owner: run.owner, runId: run.id }),
		...overrides,
	});
	const manager = new RunManager(supervisor, {
		onChange: (run) => relay.onChange(run),
		onTerminal: (run) => {
			terminal.push(run);
		},
	});
	return {
		workspace,
		manager,
		observations,
		relay,
		children,
		saved,
		terminal,
		owner,
		start() {
			return manager.start(owner, {
				agent: {
					name: "writer",
					personaPath: personaFile,
					persona: "OBSERVATION_TEST_PERSONA",
					tools: ["write"],
					thinking: "off",
					skills: [],
					extensions: [],
				},
				task: "SECRET_TASK",
				cwd: workspace.cwd,
				nesting: { registryPath, rootSessionId: owner, depth: 1, maxDepth: 3 },
			});
		},
		async dispose() {
			relay.dispose();
			await manager.cancelAll(owner);
			await workspace.dispose();
		},
	};
}
