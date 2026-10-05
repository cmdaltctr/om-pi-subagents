// The four OMPSS actions. The `ompss` tool and the `/ompss` command both call these, so they cannot drift apart.

import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { AgentSnapshot, RegistryStore } from "./config.ts";
import type { RunManager, RunView } from "./runs.ts";
import type { ChildLineage } from "./protocol.ts";

/** Tools that change files or run commands. A persona holding one is listed as write-capable. */
const WRITE_CAPABLE = ["write", "edit", "bash", "powershell"];

export interface ServiceDeps {
	registry: RegistryStore;
	manager: RunManager;
	/** Permission captured for this managed child; absent only in a root runtime. */
	branch?: ChildLineage;
	/** Where a run's files will live; known before the run starts. */
	directoryFor(owner: string, runId: string): string;
	/** Wait for pending file writes. Called at the end of a shutdown. */
	flush?(): Promise<void>;
	/** Whether the terminal notification reached the parent, when known. */
	deliveryOf?(runId: string): { delivered: boolean; error?: string } | undefined;
}

export interface RunContext {
	/** Default working directory: the parent's. */
	cwd: string;
	model?: string;
}

const describeAgent = (agent: AgentSnapshot): string => {
	const parts = [`tools [${agent.tools.join(", ")}]`];
	if (agent.model) parts.push(`model ${agent.model}`);
	if (agent.tools.some((tool) => WRITE_CAPABLE.includes(tool))) parts.push("write-capable");
	if (agent.tools.includes("ompss")) parts.push("delegation-capable (can select write-capable targets)");
	return `${agent.name}: ${parts.join("; ")}`;
};

async function assertDirectory(cwd: string): Promise<void> {
	if (!isAbsolute(cwd)) throw new Error(`cwd must be an absolute path: ${cwd}`);
	if (
		!(await stat(cwd).then(
			(info) => info.isDirectory(),
			() => false,
		))
	)
		throw new Error(`cwd does not exist or is not a directory: ${cwd}`);
}

export function createService({ registry, manager, directoryFor, flush, deliveryOf, branch }: ServiceDeps) {
	const summary = (run: RunView): string => {
		const lines = [
			`run ${run.id}: ${run.state}`,
			`  agent ${run.agent}, directory ${run.cwd}`,
			`  files ${directoryFor(run.owner, run.id)}`,
		];
		if (run.error) lines.push(`  ${run.error}`);
		const delivery = deliveryOf?.(run.id);
		if (delivery && !delivery.delivered)
			lines.push(`  result message not delivered: ${delivery.error ?? "unknown reason"}`);
		return lines.join("\n");
	};

	return {
		async list(): Promise<string> {
			const snapshot = await registry.refresh();
			const agents = [...snapshot.agents.values()];
			return agents.length === 0 ? "No personas mapped." : agents.map(describeAgent).join("\n");
		},

		/** Validate, start a background run and return at once. Never waits for the model. */
		async run(
			owner: string,
			input: { agent: string; task: string; cwd?: string },
			context: RunContext,
		): Promise<string> {
			const snapshot = await registry.refresh(); // a failed refresh blocks this launch
			const known = [...snapshot.agents.keys()];
			if (!known.includes(input.agent))
				throw new Error(`unknown agent "${input.agent}"; mapped agents: ${known.join(", ") || "none"}`);
			const task = input.task?.trim() ?? "";
			if (task === "") throw new Error("task is required");
			if (task.startsWith("/"))
				throw new Error("the task cannot start with a slash, because it would run as a slash command");
			const currentDepth = branch?.depth ?? 0;
			const depth = currentDepth + 1;
			const maxDepth = Math.min(branch?.maxDepth ?? snapshot.limits.maxDepth, snapshot.limits.maxDepth);
			if (depth > maxDepth)
				throw new Error(
					`Cannot launch: current depth ${currentDepth}, attempted depth ${depth}, limits.maxDepth ${maxDepth}. Use a shallower parent or start a new branch after editing YAML.`,
				);
			const nesting = Object.freeze({
				registryPath: snapshot.registryPath,
				depth,
				maxDepth,
				rootSessionId: branch?.rootSessionId ?? owner,
				...(branch ? { parentRunId: branch.runId } : {}),
			});
			const cwd = input.cwd ?? context.cwd;
			await assertDirectory(cwd);

			const run = manager.start(owner, {
				agent: snapshot.agents.get(input.agent)!,
				limits: snapshot.limits,
				nesting,
				task,
				cwd,
				parent: { model: context.model },
			});
			return `Started run ${run.id} (${run.agent}) in the background.\nFiles: ${directoryFor(owner, run.id)}\nCheck it with "ompss status ${run.id}". The result arrives as a follow-up message.`;
		},

		status(owner: string, runId?: string): string {
			if (runId) return summary(manager.status(owner, runId));
			const runs = manager.list(owner);
			return runs.length === 0 ? "No runs in this session." : runs.map(summary).join("\n");
		},

		/** Stop every run of the session and wait until all cleanup is done. For shutdown, reload and session replacement. */
		shutdown: async (owner: string): Promise<void> => {
			manager.closeAdmission(owner);
			await manager.cancelAll(owner);
			await flush?.();
		},

		cancel(owner: string, runId: string): string {
			if (!runId) throw new Error("run id is required");
			const run = manager.cancel(owner, runId);
			return run.state === "stopping" ? `Run ${run.id} is stopping.` : `Run ${run.id} is already ${run.state}.`;
		},
	};
}

export type OmpssService = ReturnType<typeof createService>;
