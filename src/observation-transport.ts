import { OBSERVATION_LIMITS, parseObservation, type ObservationSnapshot } from "./observation-validation.ts";
import { ObservationStore, type IncompleteReason, type ObservationConnection } from "./observation.ts";

const reasons: readonly IncompleteReason[] = [
	"invalid-record",
	"lineage",
	"terminal-conflict",
	"before-parent",
	"backlog-overflow",
	"backlog-expired",
	"nodes-omitted",
	"tools-omitted",
	"ancestor-terminal",
	"connection-lost",
];

/** Each hop replaces only the connection token. Snapshot ownership and revisions remain unchanged. */
export interface ObservationEnvelope {
	readonly token: string;
	readonly snapshot: ObservationSnapshot;
	readonly reasons: readonly IncompleteReason[];
	/** Monotonic per-source-node revision for evidence, including empty recovery sets. */
	readonly evidenceRevision: number;
}

/** Apply the smaller display bound to the whole envelope, independently of RPC framing. */
export function parseObservationEnvelope(value: unknown, token: string): ObservationEnvelope | undefined {
	try {
		const json = JSON.stringify(value);
		if (json === undefined || Buffer.byteLength(json, "utf8") > OBSERVATION_LIMITS.recordBytes) return undefined;
		const data = JSON.parse(json);
		if (!data || typeof data !== "object" || Array.isArray(data) || data.token !== token) return undefined;
		if (
			!Number.isSafeInteger(data.evidenceRevision) ||
			data.evidenceRevision < 0 ||
			!Array.isArray(data.reasons) ||
			data.reasons.length > reasons.length ||
			!data.reasons.every((reason: unknown) => reasons.includes(reason as IncompleteReason))
		)
			return undefined;
		const parsed = parseObservation(data.snapshot);
		if (!parsed) return undefined;
		return {
			token,
			evidenceRevision: data.evidenceRevision,
			snapshot: parsed.snapshot,
			reasons: [
				...new Set<IncompleteReason>([...data.reasons, ...(parsed.toolsOmitted ? ["tools-omitted" as const] : [])]),
			],
		};
	} catch {
		return undefined;
	}
}

/** Failed viewer callbacks detach and leave missing-evidence markers, without reaching execution. */
export class TransportObservationStore extends ObservationStore {
	override subscribe(
		owner: string,
		callback: (connection: ObservationConnection) => void | Promise<void>,
		runId?: string,
	): () => void {
		let failed = false;
		let detach = () => {};
		const fail = (connection: ObservationConnection) => {
			if (failed) return;
			failed = true;
			detach();
			this.markIncomplete(connection);
		};
		detach = super.subscribe(
			owner,
			(connection) => {
				if (failed) return;
				try {
					void Promise.resolve(callback(connection)).catch(() => fail(connection));
				} catch {
					fail(connection);
				}
			},
			runId,
		);
		return detach;
	}
}
