// Shared between the parent (runner) and the child guard.

export const PREFLIGHT_COMMAND = "ompss-child-preflight";
export const READY_ENTRY = "ompss-ready";
export const VIOLATION_ENTRY = "ompss-violation";

/** Policy the parent passes to a child through OMPSS_POLICY. It holds no credentials. */
export interface ChildPolicy {
	/** Exact approved tool names. */
	tools: string[];
	/** Expected `provider/id`, when one is known. */
	model?: string;
	/** Time allowed from process start until the child is ready. */
	startupDeadlineMs: number;
}

/** Data of the private `ompss-ready` session entry. `ok: false` carries the reasons. */
export interface Readiness {
	token: string;
	ok: boolean;
	problems: string[];
	tools: string[];
	model?: string;
	cwd: string;
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
	return {
		readiness: {
			token,
			ok: data.ok,
			problems: data.problems,
			tools: data.tools,
			model: data.model as string | undefined,
			cwd: data.cwd,
		},
	};
}
