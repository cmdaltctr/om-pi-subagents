/**
 * The below-editor navigation list. Row shapes, markers, hint wording, windowing and the finished
 * linger are adapted from tintinweb/pi-subagents (MIT), commit e955e29: src/ui/fleet-list.ts.
 * See THIRD_PARTY_NOTICES.md. tintin's `main` row and token figures are left out: OMPS inspection
 * always targets a run, and OMPS children do not report tokens.
 */

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { PLAIN_THEME, type TreeTheme } from "./agent-tree-widget.ts";
import type { FleetView, NavigationKeys } from "./config.ts";
import { isTerminal, type RunState } from "./runs.ts";

/** One direct root as seen by the widgets: manager state plus retained observation evidence. */
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
	/** Task tool calls the run has started. */
	readonly toolUses: number;
	/** Provisional assistant text, used for the tree's activity line. */
	readonly assistantPreview?: string;
	/** The run's error, for a failed run's tree line. */
	readonly error?: string;
}

export interface FleetInput {
	readonly roots: readonly FleetRoot[];
	/** Registry `ui.maxVisibleAgents`; bounds the list window, like tintin's `MAX_AGENT_ROWS`. */
	readonly visibleAgents: number;
	readonly selectedRunId?: string;
	/** True while the operator moves through the rows; only then is a row marked and Enter live. */
	readonly selecting?: boolean;
	/** Wall clock for elapsed times and the finished linger. */
	readonly now: number;
}

export type FleetRow =
	| { readonly kind: "hint"; readonly selecting: boolean }
	| { readonly kind: "above"; readonly count: number }
	| { readonly kind: "root"; readonly root: FleetRoot; readonly selected: boolean }
	| { readonly kind: "below"; readonly count: number };

export interface FleetProjection {
	readonly rows: readonly FleetRow[];
	/** Every listed run in list order; navigation moves through these. */
	readonly runIds: readonly string[];
	readonly selectedRunId: string | undefined;
}

/** How long a finished run stays in the list, as tintin's `FINISHED_LINGER_MS`. */
export const LIST_LINGER_MS = 4000;

const byLaunchOrder = (a: FleetRoot, b: FleetRoot): number =>
	a.startedAt - b.startedAt || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);

/** Active roots, plus finished roots inside the list linger. */
export function listedRoots(roots: readonly FleetRoot[], now: number): FleetRoot[] {
	return roots
		.filter((root) => !isTerminal(root.state) || now - (root.endedAt ?? root.startedAt) < LIST_LINGER_MS)
		.toSorted(byLaunchOrder);
}

/**
 * Pure projection over authoritative root state. It owns no process, timer or file: every display
 * change comes from a fresh input.
 */
export function projectFleet(input: FleetInput): FleetProjection {
	const listed = listedRoots(input.roots, input.now);
	const runIds = Object.freeze(listed.map((root) => root.runId));
	if (!listed.length) return Object.freeze({ rows: Object.freeze([]), runIds, selectedRunId: undefined });
	const selecting = input.selecting === true;
	const selectedRunId = runIds.includes(input.selectedRunId ?? "") ? input.selectedRunId! : runIds[0];
	const sel = selecting ? runIds.indexOf(selectedRunId) : 0;

	// Window the rows so the selected one stays visible.
	const visible = Math.min(Math.max(1, input.visibleAgents), listed.length);
	const start = sel < visible ? 0 : sel - visible + 1;
	const hiddenBelow = listed.length - (start + visible);

	const rows: FleetRow[] = [{ kind: "hint", selecting }];
	if (start > 0) rows.push({ kind: "above", count: start });
	for (const root of listed.slice(start, start + visible))
		rows.push({ kind: "root", root, selected: selecting && root.runId === selectedRunId });
	if (hiddenBelow > 0) rows.push({ kind: "below", count: hiddenBelow });
	return Object.freeze({ rows: Object.freeze(rows), runIds, selectedRunId });
}

function rightAlign(left: string, right: string, width: number): string {
	const rightW = visibleWidth(right);
	const maxLeft = Math.max(0, width - rightW - 1);
	const leftClamped = truncateToWidth(left, maxLeft);
	const gap = Math.max(1, width - visibleWidth(leftClamped) - rightW);
	return truncateToWidth(leftClamped + " ".repeat(gap) + right, width);
}

export function formatFleetElapsed(ms: number): string {
	return `${Math.max(0, Math.round(ms / 1000))}s`;
}

function renderRow(row: FleetRow, width: number, now: number, theme: TreeTheme, keys: NavigationKeys): string {
	if (row.kind === "hint") {
		const down = keys.navigationDownKey === "down" ? "↓" : keys.navigationDownKey;
		const up = keys.navigationUpKey === "up" ? "↑" : keys.navigationUpKey;
		const directions = [up, down].filter((key) => key !== "off");
		const pair = up === "↑" && down === "↓" ? "↑↓" : directions.join("/");
		const hint = row.selecting
			? `${pair ? `${pair} select · ` : ""}enter inspect · esc back`
			: down === "off"
				? "/omps inspect"
				: `${down} to manage`;
		return truncateToWidth("  " + theme.fg("dim", hint), width);
	}
	if (row.kind === "above") return rightAlign("", theme.fg("dim", `↑ ${row.count} more`), width);
	if (row.kind === "below") return rightAlign("", theme.fg("dim", `↓ ${row.count} more`), width);
	// The selected row renders in the theme's primary text colour so it reads as one selection.
	const { root, selected } = row;
	const bullet = selected ? theme.fg("accent", "●") : theme.fg("dim", "○");
	const name = theme.fg(selected ? "text" : "muted", root.agent);
	const summary = root.taskSummary ?? "";
	const description = summary ? `  ${selected ? theme.fg("text", summary) : summary}` : "";
	// Frozen once the run ends.
	const stats = formatFleetElapsed((root.endedAt ?? now) - root.startedAt);
	return rightAlign(
		`  ${bullet} ${name}${description}`,
		selected ? theme.fg("text", stats) : theme.fg("dim", stats),
		width,
	);
}

/**
 * Session-local view state shared by the tree and the list. The saved `ui.fleetView` supplies the
 * starting view; a toggle overrides it for this session only. Selection mode starts from an empty
 * prompt and never touches a file.
 */
export class FleetStrip {
	private override: boolean | undefined;
	private selectedRunId: string | undefined;
	private selecting = false;

	constructor(
		private readonly view: () => FleetView = () => "expanded",
		private readonly showManagementList: () => boolean = () => true,
		private readonly keys: () => NavigationKeys = () => ({ navigationDownKey: "down", navigationUpKey: "up" }),
	) {}

	get navigationKeys(): NavigationKeys {
		return this.keys();
	}

	/** Management visibility is independent of the above-editor tree. */
	get isListVisible(): boolean {
		return this.isExpanded && !this.isHidden && this.showManagementList();
	}

	/** Flip between the expanded view and the collapsed tree heading for this session. */
	toggle(): void {
		const expanded = !this.isExpanded;
		// Returning to the saved view drops the override, so an off fleet can hide again.
		this.override = expanded === (this.view() === "expanded") ? undefined : expanded;
		if (!expanded) this.selecting = false;
	}

	/** Drop the session override so a newly saved view applies. */
	resetView(): void {
		this.override = undefined;
		this.selecting = false;
	}

	get isExpanded(): boolean {
		return this.override ?? this.view() === "expanded";
	}

	/** True when neither widget shows: the saved view is off and no toggle overrides it. */
	get isHidden(): boolean {
		return this.override === undefined && this.view() === "off";
	}

	get isSelecting(): boolean {
		return this.selecting;
	}

	/** Enter selection mode at a run; only an expanded list can select. */
	startSelection(runId: string): void {
		if (!this.isListVisible) return;
		this.selecting = true;
		this.selectedRunId = runId;
	}

	endSelection(): void {
		this.selecting = false;
	}

	/** Select by run identity. */
	select(runId: string): void {
		this.selectedRunId = runId;
	}

	selection(): string | undefined {
		return this.selectedRunId;
	}

	/** Render management rows only when their independent visibility preference allows them. */
	render(input: Omit<FleetInput, "selectedRunId" | "selecting">, width: number, theme = PLAIN_THEME): string[] {
		if (!this.isListVisible) {
			this.endSelection();
			return [];
		}
		const projection = projectFleet({ ...input, selectedRunId: this.selectedRunId, selecting: this.selecting });
		this.selectedRunId = projection.selectedRunId;
		if (!projection.runIds.length) this.endSelection();
		return projection.rows.map((row) => renderRow(row, width, input.now, theme, this.navigationKeys));
	}
}
