import type { ChildLineage } from "./protocol.ts";
import { plain, previewText } from "./plain.ts";
import { isTerminal, type RunState } from "./runs.ts";

export const OBSERVATION_LIMITS = Object.freeze({
	nodes: 256,
	tools: 4,
	recordBytes: 16 * 1024,
	backlog: 32,
	backlogMs: 5000,
	/** Task labels are single-line character-bounded summaries of the submitted task. */
	summaryChars: 160,
	/** Assistant previews are bounded by UTF-8 bytes, not characters. */
	previewBytes: 4096,
});

/** Display identity keeps the immediate owner's session for later private detail reads. */
export interface ObservationSnapshot extends Pick<ChildLineage, "rootSessionId" | "runId" | "parentRunId" | "depth"> {
	readonly owner: string;
	/** Actual SDK session of this run's child, verified by its immediate parent's RPC connection. */
	readonly childSessionId?: string;
	readonly agent: string;
	readonly state: RunState;
	readonly model?: string;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly revision: number;
	readonly activeTools: readonly { readonly id: string; readonly name: string }[];
	/** Sanitised single-line label of the submitted task, at most 160 characters. */
	readonly taskSummary?: string;
	/** Sanitised visible assistant text, provisional and at most 4 KiB of UTF-8. */
	readonly assistantPreview?: string;
}

export const observationId = (value: unknown): value is string =>
	typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const integer = (value: unknown): value is number =>
	typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown, max: number): value is string =>
	typeof value === "string" && value.trim().length > 0 && value.length <= max;
const states: readonly string[] = ["starting", "running", "stopping", "completed", "failed", "cancelled"];

/** Sanitise optional display text and enforce its bound. Over-sized or emptied text rejects the record. */
function displayText(value: unknown, kind: "summary" | "preview"): { ok: true; value?: string } | { ok: false } {
	if (value === undefined) return { ok: true };
	if (typeof value !== "string") return { ok: false };
	const sanitised = kind === "summary" ? plain(value, value.length) : previewText(value);
	if (!sanitised.trim()) return { ok: false };
	const within =
		kind === "summary"
			? sanitised.length <= OBSERVATION_LIMITS.summaryChars
			: Buffer.byteLength(sanitised, "utf8") <= OBSERVATION_LIMITS.previewBytes;
	return within ? { ok: true, value: sanitised } : { ok: false };
}

/** Copy JSON data before validation so getters and unlisted fields never enter retained state. */
export function parseObservation(value: unknown): { snapshot: ObservationSnapshot; toolsOmitted: boolean } | undefined {
	try {
		const json = JSON.stringify(value);
		if (json === undefined || Buffer.byteLength(json, "utf8") > OBSERVATION_LIMITS.recordBytes) return undefined;
		const data: unknown = JSON.parse(json);
		if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
		return parseData(data as Record<string, unknown>);
	} catch {
		return undefined;
	}
}

function parseData(data: Record<string, unknown>): ReturnType<typeof parseObservation> {
	if (![data.owner, data.rootSessionId, data.runId].every(observationId)) return undefined;
	if (data.childSessionId !== undefined && !observationId(data.childSessionId)) return undefined;
	if (!integer(data.depth) || data.depth < 1 || !integer(data.revision)) return undefined;
	if (data.depth === 1 ? data.parentRunId !== undefined : !observationId(data.parentRunId)) return undefined;
	if (!text(data.agent, 256) || typeof data.state !== "string" || !states.includes(data.state)) return undefined;
	if (data.model !== undefined && !text(data.model, 512)) return undefined;
	if (!integer(data.startedAt)) return undefined;
	if (data.endedAt !== undefined && (!integer(data.endedAt) || data.endedAt < data.startedAt)) return undefined;
	if (!Array.isArray(data.activeTools)) return undefined;
	const tools: { readonly id: string; readonly name: string }[] = [];
	const ids = new Set<string>();
	for (const tool of data.activeTools) {
		if (!tool || typeof tool !== "object" || !text(tool.id, 1024) || !text(tool.name, 128) || ids.has(tool.id))
			return undefined;
		ids.add(tool.id);
		if (tools.length < OBSERVATION_LIMITS.tools) tools.push(Object.freeze({ id: tool.id, name: tool.name }));
	}
	const state = data.state as RunState;
	const taskSummary = displayText(data.taskSummary, "summary");
	const assistantPreview = displayText(data.assistantPreview, "preview");
	if (!taskSummary.ok || !assistantPreview.ok) return undefined;
	return {
		toolsOmitted: data.activeTools.length > OBSERVATION_LIMITS.tools,
		snapshot: Object.freeze({
			owner: data.owner as string,
			...(data.childSessionId !== undefined ? { childSessionId: data.childSessionId as string } : {}),
			rootSessionId: data.rootSessionId as string,
			runId: data.runId as string,
			...(data.parentRunId !== undefined ? { parentRunId: data.parentRunId as string } : {}),
			depth: data.depth,
			agent: data.agent,
			state,
			...(data.model !== undefined ? { model: data.model as string } : {}),
			startedAt: data.startedAt,
			...(data.endedAt !== undefined ? { endedAt: data.endedAt as number } : {}),
			revision: data.revision,
			activeTools: Object.freeze(isTerminal(state) ? [] : tools),
			...(taskSummary.value !== undefined ? { taskSummary: taskSummary.value } : {}),
			...(assistantPreview.value !== undefined ? { assistantPreview: assistantPreview.value } : {}),
		}),
	};
}

/** Identity fields remain fixed across both retained and pending snapshots. */
export function sameObservationIdentity(a: ObservationSnapshot, b: ObservationSnapshot): boolean {
	return (
		a.owner === b.owner &&
		(a.childSessionId === undefined || b.childSessionId === undefined || a.childSessionId === b.childSessionId) &&
		a.rootSessionId === b.rootSessionId &&
		a.runId === b.runId &&
		a.parentRunId === b.parentRunId &&
		a.depth === b.depth &&
		a.agent === b.agent &&
		a.startedAt === b.startedAt
	);
}
