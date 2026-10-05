// Shared between the parent (runner) and the child guard.

import { isAbsolute } from "node:path";

/** Captured branch permission and immediate-parent ownership for one launch. */
export interface Nesting {
	readonly registryPath: string;
	readonly depth: number;
	readonly maxDepth: number;
	readonly rootSessionId: string;
	readonly parentRunId?: string;
}

export interface ChildLineage extends Nesting {
	readonly runId: string;
}

export const PREFLIGHT_COMMAND = "ompss-child-preflight";
export const READY_ENTRY = "ompss-ready";
export const VIOLATION_ENTRY = "ompss-violation";
/** Correlated evidence that this child's owned subtree could not be fully cleaned up. */
export const CLEANUP_ENTRY = "ompss-cleanup-failed";
/** Private display metadata carried by the existing child connection, never conversation messages. */
export const OBSERVATION_ENTRY = "ompss-observation";

/** Policy the parent passes to a child through OMPSS_POLICY. It holds no credentials. */
export interface ChildPolicy {
	/** Exact approved tool names. */
	tools: readonly string[];
	lineage: ChildLineage;
	/** Expected `provider/id`, when one is known. */
	model?: string;
	/** Time allowed from process start until the child is ready. */
	startupDeadlineMs: number;
}

/** Reject malformed or inconsistent metadata before trusting a marked child. */
function parseLineage(value: unknown): ChildLineage | string {
	if (typeof value !== "object" || value === null) return "lineage is missing or invalid";
	const data = value as Record<string, unknown>;
	const id = (input: unknown): input is string =>
		typeof input === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(input);
	if (typeof data.registryPath !== "string" || !isAbsolute(data.registryPath))
		return "lineage registryPath must be absolute";
	if (typeof data.depth !== "number" || !Number.isSafeInteger(data.depth) || data.depth < 1)
		return "lineage depth must be a safe integer of at least one";
	if (typeof data.maxDepth !== "number" || !Number.isSafeInteger(data.maxDepth) || data.maxDepth < data.depth)
		return "lineage maxDepth must be a safe integer at least equal to depth";
	if (!id(data.rootSessionId) || !id(data.runId)) return "lineage session and run ids are invalid";
	if (data.depth === 1 ? data.parentRunId !== undefined : !id(data.parentRunId))
		return "lineage parentRunId is inconsistent with depth";
	return Object.freeze({
		registryPath: data.registryPath,
		depth: data.depth,
		maxDepth: data.maxDepth,
		rootSessionId: data.rootSessionId,
		runId: data.runId,
		...(data.parentRunId !== undefined ? { parentRunId: data.parentRunId as string } : {}),
	});
}

/** Validate the complete parent-created policy. No credentials are accepted here. */
export function parseChildPolicy(value: unknown): ChildPolicy | string {
	if (typeof value !== "object" || value === null) return "OMPSS_POLICY is missing or invalid";
	const data = value as Record<string, unknown>;
	if (
		!Array.isArray(data.tools) ||
		!data.tools.every((tool) => typeof tool === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(tool))
	)
		return "OMPSS_POLICY tools must be exact tool names";
	if (
		typeof data.startupDeadlineMs !== "number" ||
		!Number.isSafeInteger(data.startupDeadlineMs) ||
		data.startupDeadlineMs < 1
	)
		return "OMPSS_POLICY startupDeadlineMs must be a positive safe integer";
	if (data.model !== undefined && (typeof data.model !== "string" || data.model.trim() === ""))
		return "OMPSS_POLICY model must be a non-empty string";
	const lineage = parseLineage(data.lineage);
	if (typeof lineage === "string") return lineage;
	return Object.freeze({
		tools: Object.freeze([...data.tools]) as readonly string[],
		startupDeadlineMs: data.startupDeadlineMs,
		...(data.model !== undefined ? { model: data.model as string } : {}),
		lineage,
	});
}

/** Read the policy shared by the guard and the explicitly loaded managed entry. */
export function readChildPolicy(env: NodeJS.ProcessEnv = process.env): ChildPolicy | string {
	try {
		return parseChildPolicy(JSON.parse(env.OMPSS_POLICY ?? ""));
	} catch {
		return "OMPSS_POLICY is missing or invalid";
	}
}

/** Data of the private `ompss-ready` session entry. `ok: false` carries the reasons. */
export interface Readiness {
	token: string;
	ok: boolean;
	problems: string[];
	tools: string[];
	model?: string;
	cwd: string;
	lineage?: ChildLineage;
}

/** Data of the private `ompss-violation` session entry, written when a tool call or a prompt is blocked. */
export interface Violation {
	token: string;
	/** The blocked tool. */
	tool?: string;
	/** The source of a refused prompt, such as `extension`. */
	input?: string;
}

/** Validate an entry's data. Returns an error string for anything malformed or from another run. */
export function parseReadiness(value: unknown, token: string): { readiness: Readiness } | { error: string } {
	if (typeof value !== "object" || value === null) return { error: "readiness entry is not an object" };
	const data = value as Record<string, unknown>;
	// nosemgrep: AIK_ts_node_timing_attack -- This one-shot run correlation token is shared with the child, not an authentication secret.
	if (data.token !== token) return { error: "readiness entry has a different run token" };
	const strings = (input: unknown): input is string[] =>
		Array.isArray(input) && input.every((item) => typeof item === "string");
	if (typeof data.ok !== "boolean") return { error: "readiness entry has no boolean `ok`" };
	if (!strings(data.problems) || !strings(data.tools))
		return { error: "readiness entry has invalid `problems` or `tools`" };
	if (typeof data.cwd !== "string") return { error: "readiness entry has no `cwd`" };
	if (data.model !== undefined && typeof data.model !== "string")
		return { error: "readiness entry has an invalid `model`" };
	const lineage = data.lineage === undefined ? undefined : parseLineage(data.lineage);
	if (typeof lineage === "string") return { error: lineage };
	if (data.ok && !lineage) return { error: "readiness lineage is missing" };
	return {
		readiness: {
			token,
			ok: data.ok,
			problems: data.problems,
			tools: data.tools,
			model: data.model as string | undefined,
			cwd: data.cwd,
			lineage,
		},
	};
}
