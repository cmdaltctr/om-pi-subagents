import { isTerminal, type RunState } from "./runs.ts";

/** One direct root as seen by the projection: manager state plus retained observation evidence. */
export interface FleetRoot {
	readonly runId: string;
	readonly agent: string;
	readonly state: RunState;
	readonly startedAt: number;
	readonly endedAt?: number;
	readonly taskSummary?: string;
	readonly activeTools: readonly string[];
	readonly observedDescendants: number;
	readonly observationIncomplete: boolean;
}

export interface FleetInput {
	readonly roots: readonly FleetRoot[];
	readonly expanded: boolean;
	/** Registry `ui.maxVisibleAgents`; bounds expanded root rows only. */
	readonly visibleAgents: number;
	/** Terminal height in rows. Expansion may use at most one third of it. */
	readonly terminalRows: number;
	readonly selectedRunId?: string;
	/** Wall clock for elapsed times; omitted from row text when absent. */
	readonly now?: number;
}

export type FleetRow =
	| { readonly kind: "summary"; readonly text: string }
	| { readonly kind: "root"; readonly runId: string; readonly selected: boolean; readonly text: string }
	| { readonly kind: "navigation"; readonly text: string };

export interface FleetProjection {
	readonly rows: readonly FleetRow[];
	readonly selectedRunId: string | undefined;
	/** Roots outside the current window. Hidden runs continue normally. */
	readonly additionalRoots: number;
	/** True when the strip could not expand within its budget, or was never expanded. */
	readonly collapsed: boolean;
}

const ACTIVE: readonly RunState[] = ["starting", "running", "stopping"];
const byLaunchOrder = (a: FleetRoot, b: FleetRoot): number =>
	a.startedAt - b.startedAt || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);

/**
 * Pure projection over authoritative root state and retained observation evidence.
 * It owns no process, timer or file: every display change comes from a fresh input.
 */
export function projectFleet(input: FleetInput): FleetProjection {
	const ordered = input.roots.toSorted(byLaunchOrder);
	if (!ordered.length)
		return Object.freeze({ rows: Object.freeze([]), selectedRunId: undefined, additionalRoots: 0, collapsed: true });
	const activeRoots = ordered.filter((root) => ACTIVE.includes(root.state));
	const descendants = ordered.reduce((total, root) => total + root.observedDescendants, 0);
	const incomplete = ordered.some((root) => root.observationIncomplete);

	if (!input.expanded || !activeRoots.length) {
		// After all work ends the strip keeps one compact summary of the latest terminal root.
		const text = activeRoots.length
			? `Agents: ${activeRoots.length} active | ${descendants} observed descendants${incomplete ? " (incomplete)" : ""}`
			: latestTerminalSummary(ordered);
		return Object.freeze({
			rows: Object.freeze([{ kind: "summary", text } as FleetRow]),
			selectedRunId: undefined,
			additionalRoots: 0,
			collapsed: true,
		});
	}

	// One third of the terminal, and only when a selectable row and navigation still fit.
	const budget = Math.max(1, Math.floor(input.terminalRows / 3));
	if (budget < 3)
		return Object.freeze({
			rows: Object.freeze([{ kind: "summary", text: summaryText(activeRoots, descendants, incomplete) } as FleetRow]),
			selectedRunId: undefined,
			additionalRoots: 0,
			collapsed: true,
		});

	const selectedRunId = activeRoots.some((root) => root.runId === input.selectedRunId)
		? input.selectedRunId!
		: activeRoots[0].runId;
	const shown = Math.min(input.visibleAgents, activeRoots.length, budget - 2);
	const selectedIndex = activeRoots.findIndex((root) => root.runId === selectedRunId);
	// Keep the selection inside the window; without prior scroll state the window starts at launch order.
	const start = Math.max(0, Math.min(selectedIndex - shown + 1, activeRoots.length - shown));
	const windowed = activeRoots.slice(start, start + shown);
	const rows: FleetRow[] = [{ kind: "summary", text: summaryText(activeRoots, descendants, incomplete) }];
	for (const root of windowed)
		rows.push({ kind: "root", runId: root.runId, selected: root.runId === selectedRunId, text: rootText(root, input) });
	const additional = activeRoots.length - windowed.length;
	rows.push({
		kind: "navigation",
		text: additional
			? `+${additional} more | Arrows select | Enter inspect`
			: "Arrows select | Enter inspect | Esc collapse",
	});
	return Object.freeze({
		rows: Object.freeze(rows),
		selectedRunId,
		additionalRoots: additional,
		collapsed: false,
	});
}

function summaryText(active: readonly FleetRoot[], descendants: number, incomplete: boolean): string {
	return `Agents: ${active.length} active | ${descendants} observed descendants${incomplete ? " (incomplete)" : ""}`;
}

function latestTerminalSummary(ordered: readonly FleetRoot[]): string {
	const latest = ordered
		.filter((root) => isTerminal(root.state))
		.toSorted((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt) || byLaunchOrder(a, b))[0];
	return latest ? `Agents: idle | last ${latest.agent} ${latest.state}` : "Agents: idle";
}

function rootText(root: FleetRoot, input: FleetInput): string {
	const parts = [root.taskSummary ?? root.agent, root.state];
	if (input.now !== undefined)
		parts.push(`${Math.max(0, Math.floor(((root.endedAt ?? input.now) - root.startedAt) / 1000))}s`);
	if (root.activeTools.length) parts.push(root.activeTools.join(", "));
	if (root.observedDescendants) parts.push(`${root.observedDescendants} descendants`);
	return parts.join(" ");
}

/** Key hints appended to the strip by the widget; the projection itself stays key-free. */
export interface FleetKeys {
	readonly toggle: string;
	readonly inspect: string;
}

/** Session-local strip state: expansion and selection never persist and never touch a file. */
export class FleetStrip {
	private expanded = false;
	private selectedRunId: string | undefined;

	toggle(): void {
		this.expanded = !this.expanded;
	}

	get isExpanded(): boolean {
		return this.expanded;
	}

	/** Select by run identity; used by the keyboard controller in the next task. */
	select(runId: string): void {
		this.selectedRunId = runId;
	}

	selection(): string | undefined {
		return this.selectedRunId;
	}

	/** Render the strip's content lines. Collapsed content is exactly one line. */
	render(input: Omit<FleetInput, "expanded" | "selectedRunId">, keys: FleetKeys): string[] {
		const projection = projectFleet({ ...input, expanded: this.expanded, selectedRunId: this.selectedRunId });
		this.selectedRunId = projection.selectedRunId;
		if (!projection.rows.length) return [];
		if (projection.collapsed) {
			// Disabled shortcuts omit their hint; commands remain the documented fallback.
			const hints = [keys.toggle ? `${keys.toggle} list` : "", keys.inspect ? `${keys.inspect} inspect` : ""]
				.filter(Boolean)
				.join(" | ");
			return [projection.rows[0].text + (input.roots.length && hints ? ` | ${hints}` : "")];
		}
		return projection.rows.map((row) => (row.kind === "root" ? `${row.selected ? ">" : " "} ${row.text}` : row.text));
	}
}
