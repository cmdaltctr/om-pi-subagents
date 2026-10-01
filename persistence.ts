// Connects the run store to the supervisor and the run table.

import type { ChildProcess } from "node:child_process";
import type { RunRequest, RunView } from "./runs.ts";
import type { RunFiles, RunLogs, RunStore } from "./store.ts";

/** `prepare`, `persist` and a state-change listener that all write into one run directory per run. */
export function createPersistence(store: RunStore) {
	const files = new Map<string, RunFiles>();
	const pids = new Map<string, number>();
	const models = new Map<string, string>();
	const deliveries = new Map<string, { delivered: boolean; error?: string }>();
	const latest = new Map<string, RunView>();
	const pending = new Set<Promise<unknown>>();
	/** Status writes are not awaited by the run table, so remember them and let shutdown wait. */
	const track = (write: Promise<unknown> | undefined) => {
		if (!write) return;
		const settled = write.catch(() => undefined).finally(() => pending.delete(settled));
		pending.add(settled);
	};
	const need = (run: RunView): RunFiles => {
		const found = files.get(run.id);
		if (!found) throw new Error(`run ${run.id} has no files`);
		return found;
	};

	return {
		async prepare(run: RunView, request: RunRequest): Promise<{ personaFile: string; logs: RunLogs }> {
			const created = await store.create(run, request);
			files.set(run.id, created);
			return { personaFile: created.personaFile, logs: created.openLogs() };
		},
		persist: (run: RunView, result: { kind: "final" | "partial"; text: string; reason?: string }) =>
			need(run).writeOutput(result.kind, result.text, result.reason),
		/** Write status.json on every state change. A failure here cannot change a run's result, so it is not thrown. */
		onChange(view: RunView): void {
			latest.set(view.id, view);
			track(files.get(view.id)?.writeStatus({ ...view, pid: pids.get(view.id), model: models.get(view.id) }));
		},
		/** Note the child's process id in status.json as soon as the child exists. */
		onChild(run: RunView, child: ChildProcess): void {
			if (child.pid === undefined) return;
			pids.set(run.id, child.pid);
			track(
				files.get(run.id)?.writeStatus({ ...(latest.get(run.id) ?? run), pid: child.pid, model: models.get(run.id) }),
			);
		},
		/** Note the model the child resolved, as soon as it is ready. */
		onReady(run: RunView, info: { model?: string }): void {
			if (!info.model) return;
			models.set(run.id, info.model);
			track(
				files.get(run.id)?.writeStatus({ ...(latest.get(run.id) ?? run), pid: pids.get(run.id), model: info.model }),
			);
		},
		deliveryOf: (runId: string) => deliveries.get(runId),
		readOutput: (run: RunView): Promise<string | undefined> => need(run).readOutput(),
		recordDelivery: (run: RunView, result: { delivered: boolean; error?: string }): Promise<void> => {
			deliveries.set(run.id, result);
			return need(run).writeNotification(result);
		},
		/** Wait until every status write started so far has landed. */
		async flush(): Promise<void> {
			await Promise.all(pending);
		},
		/** Where a run's files live, for status output. */
		directoryOf: (runId: string): string | undefined => files.get(runId)?.directory,
	};
}
