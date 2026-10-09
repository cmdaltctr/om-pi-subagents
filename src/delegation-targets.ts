import { RegistryError } from "./config.ts";
import { AGENT_NAME_PATTERN } from "./protocol.ts";

/** The exact tool that approves nested launches. */
export const DELEGATION_TOOL = "omps";

/** Validate one agent's `delegates` shape. Cross-agent references are checked once every agent is known. */
export function readDelegates(at: string, tools: readonly string[], value: unknown): readonly string[] | undefined {
	const field = `${at}.delegates`;
	const delegates = tools.includes(DELEGATION_TOOL);
	if (value === undefined) {
		if (!delegates) return undefined;
		// A missing list would silently allow every mapped agent, including reviewers nobody asked for.
		throw new RegistryError(
			field,
			`required when tools include ${DELEGATION_TOOL}; add delegates: [...] listing the agents this agent may launch, or remove ${DELEGATION_TOOL}`,
		);
	}
	if (!delegates) throw new RegistryError(field, `requires the exact ${DELEGATION_TOOL} tool in tools`);
	if (!Array.isArray(value)) throw new RegistryError(field, "must be a list of agent names");
	if (value.length === 0) {
		throw new RegistryError(field, `must not be empty; remove ${DELEGATION_TOOL} to disable delegation`);
	}
	for (const entry of value) {
		if (typeof entry !== "string" || !AGENT_NAME_PATTERN.test(entry)) {
			throw new RegistryError(field, `${JSON.stringify(entry)} is not a valid agent name`);
		}
	}
	return Object.freeze([...new Set(value as string[])]);
}

/** Reject a list entry that this file does not map, so a typo cannot hide behind a later refusal. */
export function checkDelegateTargets(agents: ReadonlyMap<string, { readonly delegates?: readonly string[] }>): void {
	for (const [name, agent] of agents) {
		const missing = agent.delegates?.find((target) => !agents.has(target));
		if (missing)
			throw new RegistryError(`agents.${name}.delegates`, `${JSON.stringify(missing)} is not a mapped agent`);
	}
}

type Branch = { readonly agent: string; readonly delegates?: readonly string[] };
type Mapped = ReadonlyMap<string, { readonly delegates?: readonly string[] }>;

/**
 * Targets a running child may launch: named both in the list captured when it started and in the freshly read YAML,
 * so a running branch can be narrowed but never widened. A missing list or an unmapped agent allows nothing, never "any".
 */
export function allowedTargets(branch: Branch, agents: Mapped): readonly string[] {
	const fresh = agents.get(branch.agent)?.delegates;
	return (branch.delegates ?? []).filter((name) => fresh?.includes(name));
}

/** Refuse a nested launch whose target is outside the child's allowed targets. */
export function assertMayLaunch(branch: Branch, agents: Mapped, target: string): void {
	if (!agents.has(branch.agent)) {
		throw new Error(
			`${branch.agent} is no longer mapped, so it cannot launch "${target}". Restore agents.${branch.agent} in YAML or start a new branch.`,
		);
	}
	const allowed = allowedTargets(branch, agents);
	if (allowed.includes(target)) return;
	throw new Error(
		`${branch.agent} cannot launch "${target}": agents.${branch.agent}.delegates allows ${allowed.length > 0 ? allowed.join(", ") : "no agents"}.`,
	);
}
