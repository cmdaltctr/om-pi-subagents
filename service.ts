// The four OMPSS actions. The `ompss` tool and the `/ompss` command both call these, so they cannot drift apart.

import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { AgentSnapshot, RegistryStore } from "./config.ts";
import { OccupiedError, type RunManager, type RunView } from "./runs.ts";

/** Tools that change files or run commands. A persona holding one is listed as write-capable. */
const WRITE_CAPABLE = ["write", "edit", "bash", "powershell"];

export interface ServiceDeps {
	registry: RegistryStore;
	manager: RunManager;
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

export function createService({ registry, manager, directoryFor, flush, deliveryOf }: ServiceDeps) {
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
			await registry.refresh();
			const names = registry.list();
			return names.length === 0
				? "No personas mapped."
				: names.map((name) => describeAgent(registry.get(name))).join("\n");
		},

		/** Validate, start a background run and return at once. Never waits for the model. */
		async run(
			owner: string,
			input: { agent: string; task: string; cwd?: string },
			context: RunContext,
		): Promise<string> {
			await registry.refresh(); // a failed refresh throws here, so no launch runs on stale settings
			const known = registry.list();
			if (!known.includes(input.agent))
				throw new Error(`unknown agent "${input.agent}"; mapped agents: ${known.join(", ") || "none"}`);
			const task = input.task?.trim() ?? "";
			if (task === "") throw new Error("task is required");
			if (task.startsWith("/"))
				throw new Error("the task cannot start with a slash, because it would run as a slash command");
			const cwd = input.cwd ?? context.cwd;
			await assertDirectory(cwd);

			try {
				const run = manager.start(owner, {
					agent: registry.get(input.agent),
					task,
					cwd,
					parent: { model: context.model },
				});
				return `Started run ${run.id} (${run.agent}) in the background.\nFiles: ${directoryFor(owner, run.id)}\nCheck it with "ompss status ${run.id}". The result arrives as a follow-up message.`;
			} catch (error) {
				if (error instanceof OccupiedError)
					throw new Error(`${error.message}. Wait for it, or cancel it with "ompss cancel ${error.activeRunId}".`, {
						cause: error,
					});
				throw error;
			}
		},

		status(owner: string, runId?: string): string {
			if (runId) return summary(manager.status(owner, runId));
			const runs = manager.list(owner);
			return runs.length === 0 ? "No runs in this session." : runs.map(summary).join("\n");
		},

		/** Stop every run of the session and wait until all cleanup is done. For shutdown, reload and session replacement. */
		shutdown: async (owner: string): Promise<void> => {
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
