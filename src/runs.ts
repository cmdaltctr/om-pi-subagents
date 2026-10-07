// Run table: configured direct-child capacity per parent session, ownership, and the truthful state machine.
// The process lifecycle itself lives in the injected supervisor.

import { randomUUID } from "node:crypto";
import type { AgentSnapshot, RunLimits } from "./config.ts";
import type { Nesting } from "./protocol.ts";

export type RunState = "starting" | "running" | "stopping" | "completed" | "failed" | "cancelled";
export type TerminalState = Extract<RunState, "completed" | "failed" | "cancelled">;

const TERMINAL: readonly RunState[] = ["completed", "failed", "cancelled"];
export const isTerminal = (state: RunState): state is TerminalState => TERMINAL.includes(state);

export interface RunRequest {
	agent: AgentSnapshot;
	task: string;
	cwd: string;
	/** The parent's model, used when the YAML sets none. Thinking always comes from the agent snapshot. */
	parent?: { model?: string };
	/** Fresh operator settings captured with the persona for this launch. */
	limits?: RunLimits;
	nesting?: Nesting;
}

/** A read-only copy of a run. Later changes never alter a view that was already returned. */
export interface RunView {
	readonly id: string;
	readonly owner: string;
	readonly agent: string;
	readonly cwd: string;
	readonly state: RunState;
	readonly error?: string;
	readonly startedAt: number;
	readonly endedAt?: number;
	/** Cleanup could not be confirmed, so the session stays blocked. */
	readonly cleanupFailed?: boolean;
	readonly limits?: RunLimits;
	readonly nesting?: Nesting;
}

export interface RunOutcome {
	state: TerminalState;
	error?: string;
	/** Some process of the child may still run. The session must not start another child. */
	cleanupFailed?: boolean;
}

export interface SupervisorHooks {
	/** Aborts when the run is cancelled. */
	signal: AbortSignal;
	/** The task was accepted by the child. */
	markRunning(): void;
	/** A terminal reason is known and cleanup has begun. */
	markStopping(): void;
}

/**
 * Drives one child from launch to a final outcome. The promise settles only after cleanup is confirmed,
 * because the session's slot stays taken until then.
 */
export type Supervisor = (run: RunView, request: RunRequest, hooks: SupervisorHooks) => Promise<RunOutcome>;

export class OccupiedError extends Error {
	readonly activeRunId: string;

	constructor(
		readonly activeRunIds: readonly string[],
		readonly limit: number,
	) {
		super(
			`session capacity reached (limits.maxConcurrentRuns: ${limit}); active runs: ${activeRunIds.join(", ")}. Wait for a run, cancel it with "omps cancel ${activeRunIds[0]}", or edit limits.maxConcurrentRuns in YAML.`,
		);
		this.activeRunId = activeRunIds[0];
		this.name = "OccupiedError";
	}
}

/** Raised while a session holds a run whose cleanup could not be confirmed. */
export class CleanupBlockedError extends Error {
	constructor(
		readonly runId: string,
		cause: string,
	) {
		super(
			`no new run can start: run ${runId} may have left processes behind (${cause}). Stop them by hand, then reload Pi.`,
		);
		this.name = "CleanupBlockedError";
	}
}

/** Also raised for a run that belongs to another session, so a caller cannot probe for foreign run ids. */
export class UnknownRunError extends Error {
	constructor(runId: string) {
		super(`unknown run: ${runId}`);
		this.name = "UnknownRunError";
	}
}

interface Entry {
	view: { -readonly [K in keyof RunView]: RunView[K] };
	controller: AbortController;
	/** Resolves once the supervisor has settled, so cleanup is finished. */
	settled: Promise<void>;
	/** Kept apart from cleanup so a freed slot does not release settlement early. */
	delivery: Promise<void>;
}

export class RunManager {
	private readonly entries = new Map<string, Entry>();
	private readonly closedOwners = new Set<string>();

	private readonly now: () => number;
	private readonly onTerminal: ((view: RunView) => void | Promise<void>) | undefined;
	private readonly onChange: ((view: RunView) => void) | undefined;

	constructor(
		private readonly supervise: Supervisor,
		options: {
			now?: () => number;
			onTerminal?: (view: RunView) => void | Promise<void>;
			onChange?: (view: RunView) => void;
		} = {},
	) {
		this.now = options.now ?? Date.now;
		this.onTerminal = options.onTerminal;
		this.onChange = options.onChange;
	}

	/** Reserve capacity synchronously, then hand the run to the supervisor. */
	start(owner: string, request: RunRequest): RunView {
		if (this.closedOwners.has(owner)) throw new Error("this session is ending; admission is closed");
		const mine = [...this.entries.values()].filter((entry) => entry.view.owner === owner);
		const uncertain = mine.find((entry) => entry.view.cleanupFailed);
		if (uncertain) throw new CleanupBlockedError(uncertain.view.id, uncertain.view.error ?? "cleanup failed");
		const active = mine.filter((entry) => !isTerminal(entry.view.state));
		const limit = request.limits?.maxConcurrentRuns ?? 1;
		if (active.length >= limit)
			throw new OccupiedError(
				active.map((entry) => entry.view.id),
				limit,
			);

		let markSettled!: () => void;
		const entry: Entry = {
			view: {
				id: randomUUID(),
				owner,
				agent: request.agent.name,
				cwd: request.cwd,
				state: "starting",
				startedAt: this.now(),
				limits: request.limits,
				nesting: request.nesting,
			},
			controller: new AbortController(),
			settled: new Promise<void>((done) => (markSettled = done)),
			delivery: Promise.resolve(),
		};
		this.entries.set(entry.view.id, entry);

		const hooks: SupervisorHooks = {
			signal: entry.controller.signal,
			markRunning: () => this.transition(entry, "running", ["starting"]),
			markStopping: () => this.transition(entry, "stopping", ["starting", "running"]),
		};
		const snapshot = { ...entry.view };
		this.onChange?.(snapshot);
		try {
			this.supervise(snapshot, request, hooks)
				.then(
					(outcome) => this.finish(entry, outcome),
					(error: unknown) => this.finish(entry, { state: "failed", error: errorMessage(error) }),
				)
				.finally(markSettled);
		} catch (error) {
			this.finish(entry, { state: "failed", error: errorMessage(error) });
			markSettled();
		}
		return snapshot;
	}

	status(owner: string, runId: string): RunView {
		return { ...this.find(owner, runId).view };
	}

	list(owner: string): RunView[] {
		return [...this.entries.values()].filter((entry) => entry.view.owner === owner).map((entry) => ({ ...entry.view }));
	}

	/** Ask the supervisor to stop. The slot stays taken until the supervisor settles. */
	cancel(owner: string, runId: string): RunView {
		const entry = this.find(owner, runId);
		if (!isTerminal(entry.view.state) && !entry.controller.signal.aborted) {
			this.transition(entry, "stopping", ["starting", "running"]);
			entry.controller.abort();
		}
		return { ...entry.view };
	}

	/** Refuse late launches before shutdown starts waiting for cleanup. */
	closeAdmission(owner: string): void {
		this.closedOwners.add(owner);
	}

	/** Cancel every active run of the session and wait until all of them have settled. For shutdown, reload and session replacement. */
	async cancelAll(owner: string): Promise<void> {
		const active = [...this.entries.values()].filter(
			(entry) => entry.view.owner === owner && !isTerminal(entry.view.state),
		);
		for (const entry of active) this.cancel(owner, entry.view.id);
		await Promise.all(active.map((entry) => entry.settled));
	}

	/** Wait for owned cleanup and delivery attempts, including late admissions. Abort never needs a model response. */
	async waitForOwned(owner: string, signal?: AbortSignal): Promise<void> {
		for (;;) {
			const entries = [...this.entries.values()].filter((entry) => entry.view.owner === owner);
			await abortable(
				Promise.all(entries.map((entry) => entry.settled.then(() => entry.delivery))).then(() => undefined),
				signal,
			);
			if (entries.length === this.list(owner).length) return;
		}
	}

	private find(owner: string, runId: string): Entry {
		const entry = this.entries.get(runId);
		if (!entry || entry.view.owner !== owner) throw new UnknownRunError(runId);
		return entry;
	}

	private transition(entry: Entry, to: RunState, from: RunState[]): void {
		if (!from.includes(entry.view.state)) return;
		entry.view.state = to;
		this.onChange?.({ ...entry.view });
	}

	private finish(entry: Entry, outcome: RunOutcome): void {
		entry.view.state = outcome.state;
		entry.view.error = outcome.error;
		if (outcome.cleanupFailed) entry.view.cleanupFailed = true;
		entry.view.endedAt = this.now();
		this.onChange?.({ ...entry.view });
		try {
			entry.delivery = Promise.resolve(this.onTerminal?.({ ...entry.view })).catch(() => undefined);
		} catch {
			// Delivery failure cannot rewrite a completed run or leave an unobserved promise.
			entry.delivery = Promise.resolve();
		}
	}
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function abortable(wait: Promise<void>, signal?: AbortSignal): Promise<void> {
	if (!signal) return wait;
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason ?? new Error("settlement wait was cancelled"));
		if (signal.aborted) return abort();
		signal.addEventListener("abort", abort, { once: true });
		void wait.then(
			() => {
				signal.removeEventListener("abort", abort);
				return resolve();
			},
			(error: unknown) => {
				signal.removeEventListener("abort", abort);
				return reject(error);
			},
		);
	});
}
