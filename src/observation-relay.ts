import { OBSERVATION_LIMITS, parseObservation } from "./observation-validation.ts";
import type { ObservationConnection, ObservationStore } from "./observation.ts";
import { parseObservationEnvelope, type ObservationEnvelope } from "./observation-transport.ts";
import { OBSERVATION_ENTRY } from "./protocol.ts";
import { plain, previewText } from "./plain.ts";
import type { RpcChannel, RpcRecord } from "./rpc.ts";
import { isTerminal, type RunView } from "./runs.ts";

interface Progress {
	model?: string;
	tools: Map<string, { id: string; name: string }>;
	taskSummary?: string;
	/** Latest published preview. */
	preview?: string;
	/** Set once the supervisor submits this run's task; startup replay never populates text. */
	taskAccepted?: boolean;
	previewPublishedAt?: number;
	pendingPreview?: string;
	previewTimer?: ReturnType<typeof setTimeout>;
	/** Task tool-call ids already counted, so a repeated start counts once. */
	counted?: Set<string>;
}

/** Bound on remembered tool-call ids per run; later calls still count, without de-duplication. */
const COUNTED_IDS = 1024;
interface RelayDeps {
	observations: ObservationStore;
	/** Resolve the current authoritative view. Supervisor callbacks hold their initial starting snapshot. */
	current(run: RunView): RunView;
	/** Absent at the viewing root. Managed parents append private entries with their own hop token. */
	publish?(envelope: ObservationEnvelope): void | Promise<void>;
	token?: string;
	/** Clock for preview coalescing. */
	now?: () => number;
}

/** Display-only supervision adapter. It neither submits tasks nor judges results. */
export class ObservationRelay {
	private readonly progress = new Map<string, Progress>();
	/** Tool-use counts by run, kept after a run ends so its finished line can show them. */
	private readonly uses = new Map<string, number>();
	private readonly owners = new Map<string, () => void>();
	private readonly connections = new Set<() => void>();
	private readonly sent = new Map<string, Map<string, { deduplicationKey: string; revision: number }>>();
	private readonly now: () => number;
	private closed = false;

	constructor(private readonly deps: RelayDeps) {
		this.now = deps.now ?? Date.now;
	}

	/** Register direct roots from RunManager's change callback, including their terminal evidence. */
	onChange(run: RunView): void {
		if (this.closed) return;
		this.listen(run);
		const progress = this.progress.get(run.id);
		this.deps.observations.updateRoot(run, progress ? this.display(progress) : {});
		// Keep authoritative updates available even when the display subscription could not be installed.
		this.forward(this.connection(run));
		if (isTerminal(run.state)) this.forget(run.id);
	}

	/** Forget display-only progress for a finished run, stopping its pending preview timer. */
	private forget(runId: string): void {
		const progress = this.progress.get(runId);
		if (progress?.previewTimer) clearTimeout(progress.previewTimer);
		this.progress.delete(runId);
	}

	/** The readiness gate supplies the child's resolved model, rather than a guessed parent model. */
	onReady(run: RunView, info: { model?: string }): void {
		if (this.closed) return;
		this.contain(run, () => {
			const progress = this.forRun(run);
			progress.model = info.model;
			this.deps.observations.updateRoot(this.deps.current(run), this.display(progress));
		});
	}

	/** Label the run with its submitted task. The supervisor calls this when it sends the task prompt. */
	onTask(run: RunView, task: string): void {
		if (this.closed) return;
		this.contain(run, () => {
			const progress = this.forRun(run);
			progress.taskAccepted = true;
			progress.taskSummary = plain(task, OBSERVATION_LIMITS.summaryChars);
			this.deps.observations.updateRoot(this.deps.current(run), this.display(progress));
		});
	}

	/** Track at most four task tool ids. Raw args, results and streaming content never enter this map. */
	onProgress(run: RunView, record: RpcRecord): void {
		if (this.closed) return;
		this.contain(run, () => {
			const current = this.deps.current(run);
			if (isTerminal(current.state)) return;
			if (record.type !== "tool_execution_start" && record.type !== "tool_execution_end") return;
			const id = record.toolCallId;
			const name = record.toolName;
			if (
				typeof id !== "string" ||
				!id.trim() ||
				id.length > 1024 ||
				typeof name !== "string" ||
				!name.trim() ||
				name.length > 128
			) {
				this.deps.observations.markIncomplete(this.connection(run), "invalid-record");
				return;
			}
			const progress = this.forRun(run);
			if (record.type === "tool_execution_start" && progress.taskAccepted) this.countToolUse(run.id, progress, id);
			if (record.type === "tool_execution_end") {
				if (!progress.tools.delete(id)) return;
			} else {
				if (progress.tools.has(id)) return;
				if (progress.tools.size >= OBSERVATION_LIMITS.tools) {
					this.deps.observations.markIncomplete(this.connection(run), "tools-omitted");
					return;
				}
				progress.tools.set(id, { id, name });
			}
			this.deps.observations.updateRoot(current, this.display(progress));
		});
	}

	/** Task tool calls started by this run. The count outlives the run's display progress. */
	toolUses(runId: string): number {
		return this.uses.get(runId) ?? 0;
	}

	private countToolUse(runId: string, progress: Progress, id: string): void {
		progress.counted ??= new Set();
		if (progress.counted.has(id)) return;
		if (progress.counted.size < COUNTED_IDS) progress.counted.add(id);
		this.uses.set(runId, this.toolUses(runId) + 1);
	}

	/** Subscribe before task submission. Private replay uses observer revisions, independently of task-tool replay. */
	connect(run: RunView, channel: Pick<RpcChannel, "onRecord" | "request">, token: string): () => void {
		if (this.closed) return () => {};
		let detached = false;
		let unsubscribe = () => {};
		const detach = () => {
			if (detached) return;
			detached = true;
			this.connections.delete(detach);
			try {
				unsubscribe();
			} catch {
				this.deps.observations.markIncomplete(this.connection(run));
			}
		};
		this.connections.add(detach);
		const failed = () => {
			if (this.closed || detached) return;
			detach();
			this.deps.observations.markIncomplete(this.connection(run));
		};
		try {
			// Native state is correlated by RpcChannel's request id; custom display entries cannot supply this binding.
			void channel
				.request({ type: "get_state" }, OBSERVATION_LIMITS.backlogMs)
				.then((response) => {
					if (this.closed || detached) return undefined;
					if (
						!response.success ||
						!this.deps.observations.bindChildSession(this.connection(run), response.data?.sessionId)
					) {
						this.deps.observations.markIncomplete(this.connection(run), "lineage");
						detach();
						return undefined;
					}
					unsubscribe = channel.onRecord(
						(record) => {
							if (this.closed || detached) return;
							this.contain(run, () => this.receive(run, record, token));
						},
						{ replay: true },
					);
					return undefined;
				})
				.catch(failed);
		} catch {
			failed();
		}
		return detach;
	}

	/** Detach before session shutdown starts cancelling execution. Late records cannot recreate a tree. */
	dispose(): void {
		if (this.closed) return;
		this.closed = true;
		// oxlint-disable-next-line unicorn/no-useless-spread -- Detaching removes entries from the set during delivery.
		for (const detach of [...this.connections]) detach();
		for (const detach of this.owners.values()) detach();
		this.owners.clear();
		this.sent.clear();
		for (const progress of this.progress.values()) if (progress.previewTimer) clearTimeout(progress.previewTimer);
		this.progress.clear();
		this.uses.clear();
		this.deps.observations.dispose();
	}

	private connection(run: RunView): ObservationConnection {
		return { owner: run.owner, runId: run.id };
	}

	private display(
		progress: Progress,
		preview?: string,
	): {
		model?: string;
		activeTools: { id: string; name: string }[];
		taskSummary?: string;
		assistantPreview?: string;
	} {
		return {
			model: progress.model,
			activeTools: [...progress.tools.values()],
			...(progress.taskSummary !== undefined ? { taskSummary: progress.taskSummary } : {}),
			assistantPreview: preview ?? progress.preview,
		};
	}

	/** Only typed assistant text events for the submitted task become preview text. */
	private assistantPreview(run: RunView, record: RpcRecord): void {
		const progress = this.progress.get(run.id);
		if (!progress?.taskAccepted) return;
		const current = this.deps.current(run);
		if (isTerminal(current.state)) return;
		const message = record.message;
		if (!message || message.role !== "assistant" || !Array.isArray(message.content)) return;
		const text = (message.content as unknown[])
			.filter(
				(block): block is { type: string; text: string } =>
					typeof block === "object" &&
					block !== null &&
					(block as { type?: unknown }).type === "text" &&
					typeof (block as { text?: unknown }).text === "string",
			)
			.map((block) => block.text)
			.join("\n");
		if (!text.trim()) return;
		this.publishPreview(run, progress, current, boundedPreview(text));
	}

	/** Publish at most five preview updates per second per run, with a trailing edge for the latest text. */
	private publishPreview(run: RunView, progress: Progress, current: RunView, preview: string): void {
		const interval = 1000 / 5;
		const now = this.now();
		const since = now - (progress.previewPublishedAt ?? Number.NEGATIVE_INFINITY);
		if (since >= interval) {
			this.commitPreview(run, progress, current, preview, now);
			return;
		}
		progress.pendingPreview = preview;
		progress.previewTimer ??= setTimeout(() => {
			progress.previewTimer = undefined;
			const pending = progress.pendingPreview;
			progress.pendingPreview = undefined;
			if (pending === undefined || this.closed) return;
			const live = this.deps.current(run);
			if (isTerminal(live.state)) return;
			this.commitPreview(run, progress, live, pending, this.now());
		}, interval - since);
	}

	private commitPreview(run: RunView, progress: Progress, current: RunView, preview: string, at: number): void {
		progress.previewPublishedAt = at;
		progress.preview = preview;
		this.deps.observations.updateRoot(current, this.display(progress, preview));
		this.forward(this.connection(run));
	}

	private forRun(run: RunView): Progress {
		let progress = this.progress.get(run.id);
		if (!progress) {
			progress = { tools: new Map() };
			this.progress.set(run.id, progress);
		}
		return progress;
	}

	private contain(run: RunView, action: () => void): void {
		try {
			action();
		} catch {
			this.deps.observations.markIncomplete(this.connection(run));
		}
	}

	private receive(run: RunView, record: RpcRecord, token: string): void {
		const connection = this.connection(run);
		if (record.type === "protocol_error") {
			this.deps.observations.markIncomplete(connection);
			return;
		}
		if (record.type === "message_end") {
			this.assistantPreview(run, record);
			return;
		}
		if (record.type !== "entry_appended" || record.entry?.customType !== OBSERVATION_ENTRY) return;
		const envelope = parseObservationEnvelope(record.entry.data, token);
		if (!envelope) {
			this.deps.observations.markIncomplete(connection, "invalid-record");
			return;
		}
		const result = this.deps.observations.ingest(connection, envelope.snapshot);
		if (result === "rejected") return;
		this.deps.observations.replaceReasons(
			connection,
			envelope.snapshot.runId,
			envelope.evidenceRevision,
			envelope.reasons,
		);
	}

	private listen(run: RunView): void {
		if (!this.deps.publish || this.owners.has(run.owner)) return;
		try {
			this.owners.set(
				run.owner,
				this.deps.observations.subscribe(run.owner, (connection) => this.forward(connection)),
			);
		} catch {
			// Authoritative updates still publish directly. Missing invalidations stay explicitly labelled.
			this.owners.set(run.owner, () => {});
			this.deps.observations.updateRoot(run);
			this.deps.observations.markIncomplete(this.connection(run));
			this.forward(this.connection(run));
		}
	}

	private forward(connection: ObservationConnection): void {
		if (this.closed || !this.deps.publish) return;
		const tree = this.deps.observations.tree(connection.owner, connection.runId);
		if (!tree) return;
		const sent = this.sent.get(connection.runId) ?? new Map<string, { deduplicationKey: string; revision: number }>();
		this.sent.set(connection.runId, sent);
		for (const node of tree.nodes) {
			const snapshot = parseObservation(node)?.snapshot;
			if (!snapshot) continue;
			const reasons = node.runId === tree.runId ? tree.reasons : node.reasons;
			// This key deduplicates local display evidence; it does not authenticate a message.
			const deduplicationKey = JSON.stringify([snapshot.revision, reasons]);
			const previous = sent.get(snapshot.runId);
			if (previous?.deduplicationKey === deduplicationKey) continue;
			const evidenceRevision = (previous?.revision ?? 0) + 1;
			const envelope = parseObservationEnvelope(
				{ token: this.deps.token ?? "", snapshot, reasons, evidenceRevision },
				this.deps.token ?? "",
			);
			if (!envelope) {
				this.deps.observations.markIncomplete(connection, "invalid-record");
				continue;
			}
			sent.set(snapshot.runId, { deduplicationKey, revision: evidenceRevision });
			try {
				void Promise.resolve(this.deps.publish(envelope)).catch(() =>
					this.deps.observations.markIncomplete(connection),
				);
			} catch {
				this.deps.observations.markIncomplete(connection);
			}
		}
	}
}

const PREVIEW_MARKER = " [preview truncated]";

/** Sanitise visible assistant text and bound it to the preview byte budget, marking any cut. */
function boundedPreview(text: string): string {
	const sanitised = previewText(text);
	if (Buffer.byteLength(sanitised, "utf8") <= OBSERVATION_LIMITS.previewBytes) return sanitised;
	const budget = OBSERVATION_LIMITS.previewBytes - Buffer.byteLength(PREVIEW_MARKER, "utf8");
	const cut = Buffer.from(sanitised, "utf8")
		.subarray(0, budget)
		.toString("utf8")
		.replace(/\uFFFD+$/, "");
	return `${cut}${PREVIEW_MARKER}`;
}
