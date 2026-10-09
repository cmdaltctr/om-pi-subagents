// Shared between the parent (runner) and the child guard.

import { isAbsolute } from "node:path";

/** Captured branch permission and immediate-parent ownership for one launch. */
export interface Nesting {
	readonly registryPath: string;
	readonly depth: number;
	readonly maxDepth: number;
	readonly rootSessionId: string;
	readonly parentRunId?: string;
	/** The mapped agent this run starts. Run records saved before this field existed lack it. */
	readonly agent?: string;
	/** Agents this run may launch, frozen at its start. Absent when its mapping does not approve `omps`. */
	readonly delegates?: readonly string[];
}

/** Mapped agent names: lowercase, digits and hyphens. */
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

/** What a live child receives. It always knows its own agent name, so it can find its mapping. */
export interface ChildLineage extends Nesting {
	readonly runId: string;
	readonly agent: string;
}

export const PREFLIGHT_COMMAND = "omps-child-preflight";
export const READY_ENTRY = "omps-ready";
export const VIOLATION_ENTRY = "omps-violation";
/** Correlated evidence that this child's owned subtree could not be fully cleaned up. */
export const CLEANUP_ENTRY = "omps-cleanup-failed";
/** Private display metadata carried by the existing child connection, never conversation messages. */
export const OBSERVATION_ENTRY = "omps-observation";

/** Policy the parent passes to a child through OMPS_POLICY. It holds no credentials. */
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
	if (typeof data.agent !== "string" || !AGENT_NAME_PATTERN.test(data.agent))
		return "lineage agent must be a valid agent name";
	if (
		data.delegates !== undefined &&
		(!Array.isArray(data.delegates) ||
			data.delegates.length === 0 ||
			!data.delegates.every((name) => typeof name === "string" && AGENT_NAME_PATTERN.test(name)))
	)
		return "lineage delegates must be a non-empty list of valid agent names";
	return Object.freeze({
		registryPath: data.registryPath,
		depth: data.depth,
		maxDepth: data.maxDepth,
		rootSessionId: data.rootSessionId,
		runId: data.runId,
		agent: data.agent,
		...(data.parentRunId !== undefined ? { parentRunId: data.parentRunId as string } : {}),
		...(data.delegates !== undefined ? { delegates: Object.freeze([...(data.delegates as string[])]) } : {}),
	});
}

/** Validate the complete parent-created policy. No credentials are accepted here. */
export function parseChildPolicy(value: unknown): ChildPolicy | string {
	if (typeof value !== "object" || value === null) return "OMPS_POLICY is missing or invalid";
	const data = value as Record<string, unknown>;
	if (
		!Array.isArray(data.tools) ||
		!data.tools.every((tool) => typeof tool === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(tool))
	)
		return "OMPS_POLICY tools must be exact tool names";
	if (
		typeof data.startupDeadlineMs !== "number" ||
		!Number.isSafeInteger(data.startupDeadlineMs) ||
		data.startupDeadlineMs < 1
	)
		return "OMPS_POLICY startupDeadlineMs must be a positive safe integer";
	if (data.model !== undefined && (typeof data.model !== "string" || data.model.trim() === ""))
		return "OMPS_POLICY model must be a non-empty string";
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
		return parseChildPolicy(JSON.parse(env.OMPS_POLICY ?? ""));
	} catch {
		return "OMPS_POLICY is missing or invalid";
	}
}

/** Data of the private `omps-ready` session entry. `ok: false` carries the reasons. */
export interface Readiness {
	token: string;
	ok: boolean;
	problems: string[];
	tools: string[];
	model?: string;
	cwd: string;
	lineage?: ChildLineage;
}

/** Data of the private `omps-violation` session entry, written when a tool call or a prompt is blocked. */
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
