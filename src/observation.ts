import { isAbsolute } from "node:path";
import type { ChildLineage } from "./protocol.ts";
import { isTerminal, type RunView } from "./runs.ts";
import {
	OBSERVATION_LIMITS,
	observationId,
	parseObservation,
	sameObservationIdentity,
	type ObservationSnapshot,
} from "./observation-validation.ts";

export { OBSERVATION_LIMITS, type ObservationSnapshot } from "./observation-validation.ts";

/** Names a registered direct child, never a descendant supplied by a remote record. */
export interface ObservationConnection {
	readonly owner: string;
	readonly runId: string;
}
export type ObservationResult = "accepted" | "buffered" | "ignored" | "rejected";
export type IncompleteReason =
	| "invalid-record"
	| "lineage"
	| "terminal-conflict"
	| "before-parent"
	| "backlog-overflow"
	| "backlog-expired"
	| "nodes-omitted"
	| "tools-omitted"
	| "ancestor-terminal"
	| "connection-lost";
export interface ObservedNode extends ObservationSnapshot {
	readonly incomplete: boolean;
	readonly reasons: readonly IncompleteReason[];
}
export interface ObservedTree {
	readonly owner: string;
	readonly runId: string;
	readonly rootSessionId: string;
	readonly nodes: readonly ObservedNode[];
	readonly pending: number;
	readonly incomplete: boolean;
	readonly reasons: readonly IncompleteReason[];
}
export interface RootDisplay {
	readonly model?: string;
	readonly activeTools?: ObservationSnapshot["activeTools"];
	/** Sanitised submitted-task label, produced by the relay at task submission. */
	readonly taskSummary?: string;
	/** Latest sanitised visible assistant text, provisional until the saved result exists. */
	readonly assistantPreview?: string;
}
interface Entry {
	snapshot: ObservationSnapshot;
	reasons: Set<IncompleteReason>;
	evidence?: { revision: number; reasons: readonly IncompleteReason[] };
}
interface Pending extends Entry {
	receivedAt: number;
}
interface Tree {
	owner: string;
	lineage: ChildLineage;
	nodes: Map<string, Entry>;
	pending: Map<string, Pending>;
	reasons: Set<IncompleteReason>;
}
interface Listener {
	owner: string;
	runId?: string;
	callback: (connection: ObservationConnection) => void | Promise<void>;
}

/** Bounded display state. It has no execution, persistence, transport or model dependencies. */
export class ObservationStore {
	private readonly owners = new Map<string, Map<string, Tree>>();
	private readonly closedOwners = new Set<string>();
	private readonly listeners = new Set<Listener>();
	private readonly now: () => number;
	private disposed = false;

	constructor(options: { now?: () => number } = {}) {
		this.now = options.now ?? Date.now;
	}

	/** Register or update direct runs only from RunManager's authoritative callback. */
	updateRoot(run: RunView, display: RootDisplay = {}): boolean {
		if (this.disposed || this.closedOwners.has(run.owner)) return false;
		const nesting = run.nesting;
		if (
			!nesting ||
			!isAbsolute(nesting.registryPath) ||
			!Number.isSafeInteger(nesting.maxDepth) ||
			nesting.maxDepth < nesting.depth
		)
			return false;
		const tree = this.find({ owner: run.owner, runId: run.id });
		const previous = tree?.nodes.get(run.id)?.snapshot;
		const parsed = parseObservation({
			owner: run.owner,
			childSessionId: previous?.childSessionId,
			rootSessionId: nesting.rootSessionId,
			runId: run.id,
			parentRunId: nesting.parentRunId,
			depth: nesting.depth,
			agent: run.agent,
			state: run.state,
			startedAt: run.startedAt,
			endedAt: run.endedAt,
			revision: (previous?.revision ?? 0) + 1,
			model: display.model ?? previous?.model,
			activeTools: display.activeTools ?? previous?.activeTools ?? [],
			taskSummary: display.taskSummary ?? previous?.taskSummary,
			assistantPreview: display.assistantPreview ?? previous?.assistantPreview,
		});
		if (!parsed) return false;
		const current = parsed.snapshot;
		if (current.parentRunId === current.runId || (current.depth === 1 && current.rootSessionId !== current.owner))
			return false;
		if (previous && (!sameObservationIdentity(previous, current) || tree?.lineage.maxDepth !== nesting.maxDepth))
			return false;
		if (previous && isTerminal(previous.state) && previous.state !== current.state) return false;
		if (!tree && this.locate(current.rootSessionId, current.runId)) return false;
		const entry = this.entry(current, parsed.toolsOmitted);
		if (tree) {
			entry.evidence = tree.nodes.get(run.id)?.evidence;
			if (
				display.activeTools === undefined &&
				!isTerminal(current.state) &&
				tree.nodes.get(run.id)?.reasons.has("tools-omitted")
			)
				entry.reasons.add("tools-omitted");
			tree.nodes.set(run.id, entry);
			this.markDescendants(tree);
			this.notify(tree);
			return true;
		}
		const roots = this.owners.get(run.owner) ?? new Map<string, Tree>();
		const registered: Tree = {
			owner: run.owner,
			lineage: Object.freeze({ ...nesting, agent: run.agent, runId: run.id }),
			nodes: new Map([[run.id, entry]]),
			pending: new Map(),
			reasons: new Set(),
		};
		roots.set(run.id, registered);
		this.owners.set(run.owner, roots);
		this.notify(registered);
		return true;
	}

	/** Bind only identity obtained from get_state on the registered child's RPC channel. */
	bindChildSession(connection: ObservationConnection, sessionId: unknown): boolean {
		const tree = this.find(connection);
		const entry = tree?.nodes.get(connection.runId);
		if (
			!tree ||
			!entry ||
			!observationId(sessionId) ||
			sessionId === connection.owner ||
			sessionId === tree.lineage.rootSessionId
		)
			return false;
		if (entry.snapshot.childSessionId !== undefined) return entry.snapshot.childSessionId === sessionId;
		entry.snapshot = Object.freeze({
			...entry.snapshot,
			childSessionId: sessionId,
			revision: entry.snapshot.revision + 1,
		});
		this.notify(tree);
		return true;
	}

	/** Replace current branch evidence independently of lifecycle revisions. Loss evidence remains permanent. */
	replaceReasons(
		connection: ObservationConnection,
		runId: string,
		revision: number,
		reasons: readonly IncompleteReason[],
	): void {
		const tree = this.find(connection);
		const entry = tree?.nodes.get(runId) ?? tree?.pending.get(runId);
		if (
			!tree ||
			!entry ||
			!Number.isSafeInteger(revision) ||
			revision < 0 ||
			revision <= (entry.evidence?.revision ?? -1)
		)
			return;
		for (const reason of reasons)
			if (reason !== "before-parent" && reason !== "ancestor-terminal" && reason !== "tools-omitted")
				tree.reasons.add(reason);
		entry.evidence = { revision, reasons: Object.freeze([...reasons]) };
		this.notify(tree);
	}

	/** Validate a descendant snapshot against the receiving direct connection before retaining it. */
	ingest(connection: ObservationConnection, value: unknown): ObservationResult {
		const tree = this.find(connection);
		if (!tree) return "rejected";
		this.expire(tree);
		const parsed = parseObservation(value);
		if (!parsed) return this.reject(tree, "invalid-record");
		const current = parsed.snapshot;
		if (
			current.rootSessionId !== tree.lineage.rootSessionId ||
			current.runId === tree.lineage.runId ||
			current.depth <= tree.lineage.depth ||
			current.depth > tree.lineage.maxDepth ||
			!current.parentRunId ||
			current.childSessionId === current.owner ||
			current.childSessionId === tree.lineage.rootSessionId
		)
			return this.reject(tree, "lineage");
		const located = this.locate(current.rootSessionId, current.runId);
		const parentTree = this.locate(current.rootSessionId, current.parentRunId);
		if ((located && located !== tree) || (parentTree && parentTree !== tree) || this.cycle(tree, current))
			return this.reject(tree, "lineage");
		const previousEntry = tree.nodes.get(current.runId) ?? tree.pending.get(current.runId);
		const previous = previousEntry?.snapshot;
		if (previous && !sameObservationIdentity(previous, current)) return this.reject(tree, "lineage");
		if (previous && current.revision <= previous.revision) return "ignored";
		if (previous?.childSessionId !== undefined && current.childSessionId !== previous.childSessionId)
			return this.reject(tree, "lineage");
		if (previous && isTerminal(previous.state) && current.state !== previous.state)
			return this.reject(tree, "terminal-conflict");
		const parent = tree.nodes.get(current.parentRunId)?.snapshot;
		if (parent && !this.ownedBy(tree, current, parent)) return this.reject(tree, "lineage");
		if (!previous && tree.nodes.size + tree.pending.size >= OBSERVATION_LIMITS.nodes)
			return this.reject(tree, "nodes-omitted");
		const entry = this.entry(current, parsed.toolsOmitted);
		entry.evidence = previousEntry?.evidence;
		if (!parent) {
			if (!tree.pending.has(current.runId) && tree.pending.size >= OBSERVATION_LIMITS.backlog)
				return this.reject(tree, "backlog-overflow");
			tree.pending.set(current.runId, {
				...entry,
				receivedAt: tree.pending.get(current.runId)?.receivedAt ?? this.now(),
			});
			this.notify(tree);
			return "buffered";
		}
		tree.nodes.set(current.runId, entry);
		tree.pending.delete(current.runId);
		this.flush(tree);
		this.markDescendants(tree);
		this.notify(tree);
		return "accepted";
	}

	/** Read one owned tree, ordered stably with every parent before its children. */
	tree(owner: string, runId: string): ObservedTree | undefined {
		const tree = this.find({ owner, runId });
		if (!tree) return undefined;
		this.expire(tree);
		const nodes: ObservedNode[] = [];
		const visit = (id: string): void => {
			const entry = tree.nodes.get(id);
			if (!entry) return;
			nodes.push(this.view(entry));
			for (const child of tree.nodes.values()) if (child.snapshot.parentRunId === id) visit(child.snapshot.runId);
		};
		visit(runId);
		const reasons = new Set(tree.reasons);
		if (tree.pending.size) reasons.add("before-parent");
		for (const entry of [...tree.nodes.values(), ...tree.pending.values()])
			for (const reason of [...entry.reasons, ...(entry.evidence?.reasons ?? [])]) reasons.add(reason);
		return Object.freeze({
			owner,
			runId,
			rootSessionId: tree.lineage.rootSessionId,
			nodes: Object.freeze(nodes),
			pending: tree.pending.size,
			incomplete: reasons.size > 0,
			reasons: Object.freeze([...reasons]),
		});
	}

	/** Read all direct trees belonging to one viewing session. */
	trees(owner: string): readonly ObservedTree[] {
		return Object.freeze([...(this.owners.get(owner)?.keys() ?? [])].map((id) => this.tree(owner, id)!));
	}

	/** Read only a retained node within a registered owned root. Pending records remain invisible. */
	node(owner: string, rootRunId: string, runId: string): ObservedNode | undefined {
		const tree = this.find({ owner, runId: rootRunId });
		if (!tree || !observationId(runId)) return undefined;
		this.expire(tree);
		const entry = tree.nodes.get(runId);
		return entry ? this.view(entry) : undefined;
	}

	/** Subscribe to display invalidation for one owner, optionally restricted to a direct root. */
	subscribe(owner: string, callback: Listener["callback"], runId?: string): () => void {
		if (this.disposed || this.closedOwners.has(owner)) return () => {};
		const listener = { owner, callback, runId };
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/** Record missing display evidence without changing any observed lifecycle. */
	markIncomplete(connection: ObservationConnection, reason: IncompleteReason = "connection-lost"): void {
		const tree = this.find(connection);
		if (tree) this.reject(tree, reason);
	}

	/** Permanently end one session's observation and refuse its late callbacks. */
	disposeOwner(owner: string): void {
		this.closedOwners.add(owner);
		this.owners.delete(owner);
		for (const listener of this.listeners) if (listener.owner === owner) this.listeners.delete(listener);
	}

	/** Release all observation state. Later callbacks cannot recreate it. */
	dispose(): void {
		this.disposed = true;
		this.owners.clear();
		this.listeners.clear();
		this.closedOwners.clear();
	}

	private find(connection: ObservationConnection): Tree | undefined {
		if (this.disposed || !observationId(connection.owner) || !observationId(connection.runId)) return undefined;
		return this.owners.get(connection.owner)?.get(connection.runId);
	}

	private locate(rootSessionId: string, runId: string): Tree | undefined {
		for (const roots of this.owners.values())
			for (const tree of roots.values()) {
				if (tree.lineage.rootSessionId === rootSessionId && (tree.nodes.has(runId) || tree.pending.has(runId)))
					return tree;
			}
		return undefined;
	}

	private entry(snapshot: ObservationSnapshot, toolsOmitted: boolean): Entry {
		return { snapshot, reasons: new Set(toolsOmitted ? ["tools-omitted"] : []) };
	}

	private view(entry: Entry): ObservedNode {
		const reasons = new Set([...entry.reasons, ...(entry.evidence?.reasons ?? [])]);
		return Object.freeze({
			...entry.snapshot,
			incomplete: reasons.size > 0,
			reasons: Object.freeze([...reasons]),
		});
	}

	private reject(tree: Tree, reason: IncompleteReason): "rejected" {
		if (!tree.reasons.has(reason)) {
			tree.reasons.add(reason);
			this.notify(tree);
		}
		return "rejected";
	}

	private ownedBy(tree: Tree, current: ObservationSnapshot, parent: ObservationSnapshot): boolean {
		if (
			current.depth !== parent.depth + 1 ||
			parent.childSessionId === undefined ||
			current.owner !== parent.childSessionId
		)
			return false;
		let ancestor: ObservationSnapshot | undefined = parent;
		while (ancestor) {
			if (
				current.childSessionId !== undefined &&
				(current.childSessionId === ancestor.owner || current.childSessionId === ancestor.childSessionId)
			)
				return false;
			ancestor = ancestor.parentRunId ? tree.nodes.get(ancestor.parentRunId)?.snapshot : undefined;
		}
		return true;
	}

	private cycle(tree: Tree, current: ObservationSnapshot): boolean {
		const seen = new Set([current.runId]);
		let id = current.parentRunId;
		while (id) {
			if (seen.has(id)) return true;
			seen.add(id);
			id = (tree.nodes.get(id) ?? tree.pending.get(id))?.snapshot.parentRunId;
		}
		return false;
	}

	private expire(tree: Tree): void {
		let expired = false;
		for (const [id, entry] of tree.pending)
			if (this.now() - entry.receivedAt >= OBSERVATION_LIMITS.backlogMs) {
				tree.pending.delete(id);
				expired = true;
			}
		if (expired) {
			tree.reasons.add("backlog-expired");
			this.notify(tree);
		}
	}

	private flush(tree: Tree): void {
		let changed = true;
		while (changed) {
			changed = false;
			for (const [id, entry] of tree.pending) {
				const parent = entry.snapshot.parentRunId ? tree.nodes.get(entry.snapshot.parentRunId) : undefined;
				if (!parent) continue;
				tree.pending.delete(id);
				if (this.ownedBy(tree, entry.snapshot, parent.snapshot)) tree.nodes.set(id, entry);
				else tree.reasons.add("lineage");
				changed = true;
			}
		}
	}

	private markDescendants(tree: Tree): void {
		for (const entry of tree.nodes.values()) {
			entry.reasons.delete("ancestor-terminal");
			if (isTerminal(entry.snapshot.state)) continue;
			let parent = entry.snapshot.parentRunId;
			while (parent) {
				const ancestor = tree.nodes.get(parent)?.snapshot;
				if (!ancestor) break;
				if (isTerminal(ancestor.state)) {
					entry.reasons.add("ancestor-terminal");
					break;
				}
				parent = ancestor.parentRunId;
			}
		}
	}

	private notify(tree: Tree): void {
		const connection = Object.freeze({ owner: tree.owner, runId: tree.lineage.runId });
		// oxlint-disable-next-line unicorn/no-useless-spread -- Subscribers can change the set while delivery is in progress.
		for (const listener of [...this.listeners]) {
			if (listener.owner !== tree.owner || (listener.runId !== undefined && listener.runId !== connection.runId))
				continue;
			try {
				void Promise.resolve(listener.callback(connection)).catch(() => undefined);
			} catch {
				/* Rendering failures must never reach supervision. */
			}
		}
	}
}
