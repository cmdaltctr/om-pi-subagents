// Supervisor: drives one child from launch to a final outcome.
// It returns only after cleanup is confirmed, because the session's slot stays taken until then.

import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve as resolvePath } from "node:path";
import type { Proc } from "./processes.ts";
import type { RpcChannel, RpcRecord } from "./rpc.ts";
import { decide, ResultJudge } from "./result.ts";
import type { RunOutcome, RunRequest, RunView, Supervisor, SupervisorHooks } from "./runs.ts";
import { DEFAULT_STARTUP_DEADLINE_MS, stopGroup } from "./runner.ts";
import { launchChild, StartupError, type ReadyChild } from "./startup.ts";
import type { RunLogs } from "./store.ts";

export const DEFAULT_TOTAL_DEADLINE_MS = 30 * 60 * 1000;
export const DEFAULT_KILL_GRACE_MS = 2000;
const TASK_ACK_MS = 20_000;

export interface SupervisorDeps {
	/** Absolute path of the managed Pi CLI. */
	piBin: string;
	/** Absolute path of child-guard.ts. */
	guardPath: string;
	parentModel?: string;
	env?: NodeJS.ProcessEnv;
	/** Create the run's private files. Returns the persona file path and, optionally, the logs to stream into. */
	prepare(run: RunView, request: RunRequest): Promise<{ personaFile: string; logs?: RunLogs }>;
	/** Save the final answer, or output that must stay labelled partial, with the reason it is partial. */
	persist(run: RunView, result: { kind: "final" | "partial"; text: string; reason?: string }): Promise<void>;
	/** Called when the child process exists, before it is ready. */
	onChild?(run: RunView, child: ChildProcess): void;
	/** Called once the child has passed the readiness gate, with the model it resolved. */
	onReady?(run: RunView, info: { model?: string }): void;
	/** Display-only task tool events. Startup replay is excluded. */
	onProgress?(run: RunView, record: RpcRecord): void;
	/** Supplies the submitted task text when the task prompt is sent, for display labelling only. */
	onTask?(run: RunView, task: string): void;
	/** Install the independent display subscription after readiness; return its detach function. */
	onObservation?(run: RunView, channel: RpcChannel, token: string): () => void;
	/** Missing display evidence never changes result judgement. */
	onDisplayFailure?(run: RunView): void;
	startupDeadlineMs?: number;
	/** Fixed limit for the whole run, including start-up. */
	totalDeadlineMs?: number;
	/** Replaces the process-tree lookup. For fault injection in tests. */
	listProcesses?(rootPid: number): Promise<Proc[]>;
	/** Time a child gets to exit after SIGTERM or after its input closes, before SIGKILL. */
	killGraceMs?: number;
}

const failed = (error: string): RunOutcome => ({ state: "failed", error });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createSupervisor(deps: SupervisorDeps): Supervisor {
	const totalMs = deps.totalDeadlineMs ?? DEFAULT_TOTAL_DEADLINE_MS;
	const graceMs = deps.killGraceMs ?? DEFAULT_KILL_GRACE_MS;

	return async (run, request, hooks) => {
		const prepared = await deps.prepare(run, request);
		try {
			return await execute(run, request, hooks, prepared);
		} finally {
			await prepared.logs?.close();
		}
	};

	async function execute(
		run: RunView,
		request: RunRequest,
		hooks: SupervisorHooks,
		prepared: { personaFile: string; logs?: RunLogs },
	): Promise<RunOutcome> {
		const { personaFile, logs } = prepared;
		const deadline = AbortSignal.timeout(totalMs);
		const stop = AbortSignal.any([hooks.signal, deadline]);
		/** The outcome for an abort that nothing else pre-empted. A cancel wins a tie with the deadline. */
		const abortOutcome = (): RunOutcome =>
			hooks.signal.aborted ? { state: "cancelled" } : failed(`run exceeded the total deadline of ${totalMs} ms`);

		const runToken = randomUUID();

		let ready: ReadyChild;
		try {
			ready = await launchChild(
				{
					snapshot: request.agent,
					cwd: request.cwd,
					personaFile,
					guardPath: deps.guardPath,
					runToken,
					lineage: {
						...(request.nesting ?? {
							registryPath: resolvePath(deps.env?.OMPS_REGISTRY ?? "om-pi-subagents.yaml"),
							depth: 1,
							maxDepth: request.limits?.maxDepth ?? 1,
							rootSessionId: run.owner,
						}),
						runId: run.id,
					},
					piBin: deps.piBin,
					parentModel: request.parent?.model ?? deps.parentModel,
					startupDeadlineMs: deps.startupDeadlineMs ?? DEFAULT_STARTUP_DEADLINE_MS,
					env: deps.env,
				},
				{
					signal: stop,
					onSpawn: (child) => deps.onChild?.(run, child),
					listProcesses: deps.listProcesses,
					onStderr: (text) => logs?.stderr(text),
				},
			);
		} catch (error) {
			if (error instanceof StartupError && error.cleanupFailed)
				return { ...failed(messageOf(error)), cleanupFailed: true };
			return stop.aborted ? abortOutcome() : failed(messageOf(error));
		}

		const { child, channel, owned } = ready;
		deps.onReady?.(run, { model: ready.readiness.model });
		const displayFailed = () => {
			try {
				deps.onDisplayFailure?.(run);
			} catch {
				/* Missing display evidence cannot fail execution. */
			}
		};
		let detachObservation: (() => void) | undefined;
		let detachAssessment: (() => void) | undefined;
		try {
			try {
				detachObservation = deps.onObservation?.(run, channel, runToken);
			} catch {
				displayFailed();
			}
			const judge = new ResultJudge(runToken);
			const cleanupProblem = (local?: string) =>
				[local, judge.cleanupFailure()].filter(Boolean).join("; ") || undefined;
			const stopWith = async (outcome: RunOutcome): Promise<RunOutcome> => {
				// Abort while RPC subscriptions are live, so nested teardown can report unconfirmed cleanup.
				await channel.request({ type: "abort" }, graceMs).catch(() => undefined);
				const local = await stopGroup(child, channel.exited, graceMs, owned).catch(messageOf);
				const error = cleanupProblem(local);
				return error
					? { ...failed(`${outcome.error ? `${outcome.error}; ` : ""}cleanup failed: ${error}`), cleanupFailed: true }
					: outcome;
			};
			let taskSubmitted = false;
			const assessed = new Promise<void>((resolve) => {
				detachAssessment = channel.onRecord(
					(record) => {
						logs?.event(record);
						if (taskSubmitted && (record.type === "tool_execution_start" || record.type === "tool_execution_end")) {
							try {
								deps.onProgress?.(run, record);
							} catch {
								displayFailed();
							}
						}
						judge.observe(record);
						if (judge.assess() !== "pending") resolve();
					},
					{ replay: true },
				);
			});

			// Accepting the task moves the run from `starting` to `running`.
			judge.taskAccepted();
			let acknowledged = false;
			try {
				taskSubmitted = true;
				try {
					deps.onTask?.(run, request.task);
				} catch {
					displayFailed();
				}
				const response = await channel.request({ type: "prompt", message: request.task }, TASK_ACK_MS);
				if (!response.success || response.data?.disposition !== "started") {
					return await stopWith(
						failed(`task was not accepted: ${response.error ?? `disposition ${response.data?.disposition}`}`),
					);
				}
				acknowledged = true;
			} catch (error) {
				// A child that died before it answered is judged below, like any other early exit.
				if (messageOf(error) !== "child exited") {
					return await stopWith(stop.aborted ? abortOutcome() : failed(`task was not accepted: ${messageOf(error)}`));
				}
			}
			if (acknowledged) hooks.markRunning();

			let storageReason: string | undefined;
			void logs?.failure.then((reason) => (storageReason = reason));

			const first = await Promise.race([
				assessed.then(() => "assessed" as const),
				new Promise<"storage">((resolve) => void logs?.failure.then(() => resolve("storage"))),
				channel.exited.then(() => "exited" as const),
				new Promise<"aborted">((resolve) =>
					stop.aborted ? resolve("aborted") : stop.addEventListener("abort", () => resolve("aborted"), { once: true }),
				),
			]);
			const assessment = judge.assess();

			// Cancelled, out of time, or unable to save evidence, with nothing decided yet: keep what can be kept,
			// stop the child, and report why.
			if ((first === "aborted" || first === "storage") && assessment === "pending") {
				hooks.markStopping();
				const reason =
					first === "storage"
						? `could not save run files: ${storageReason}`
						: (abortOutcome().error ?? "the run was cancelled");
				const partial = judge.partial();
				if (partial) await deps.persist(run, { kind: "partial", text: partial, reason }).catch(() => undefined);
				return await stopWith(first === "storage" ? failed(reason) : abortOutcome());
			}

			// From here an outcome is established. A later cancel or deadline cannot change it.
			hooks.markStopping();
			let persistError: string | undefined;
			if (assessment !== "pending") {
				const result = assessment.ok
					? { kind: "final" as const, text: assessment.output }
					: judge.partial() && { kind: "partial" as const, text: judge.partial()!, reason: assessment.reason };
				if (result) {
					persistError = await deps.persist(run, result).then(() => undefined, messageOf);
				}
			}
			if (assessment !== "pending" && assessment.ok) {
				channel.end(); // a finished child shuts itself down when its input closes
				await Promise.race([channel.exited, new Promise((done) => setTimeout(done, graceMs))]);
			} else {
				await channel.request({ type: "abort" }, graceMs).catch(() => undefined);
			}
			const localCleanup = await stopGroup(child, channel.exited, graceMs, owned).catch(messageOf);
			const cleanupError = cleanupProblem(localCleanup);
			const exit = await channel.exited;
			persistError ??= storageReason && `could not save run files: ${storageReason}`;
			return decide(assessment, { exit, persistError, cleanupError });
		} finally {
			try {
				detachObservation?.();
			} catch {
				displayFailed();
			}
			detachAssessment?.();
		}
	}
}
