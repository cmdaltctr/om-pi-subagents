/**
 * Adapted from tintinweb/pi-subagents (MIT), commit e955e29: src/ui/agent-widget.ts.
 * See THIRD_PARTY_NOTICES.md. Helper names, glyphs, wording and overflow rules follow tintin so a
 * later upstream fix can be compared line by line. Only the data source changes: OMPS runs replace
 * tintin's agent records, and tokens, cost, turns, model and the queued line are left out because
 * OMPS children do not report them and OMPS refuses launches rather than queuing them.
 */

import { truncateToWidth } from "@earendil-works/pi-tui";
import type { RunState } from "./runs.ts";

/** The subset of Pi's theme the tree uses. A plain theme keeps tests and line hosts free of colour codes. */
export interface TreeTheme {
	fg(colour: string, text: string): string;
	bold(text: string): string;
}

export const PLAIN_THEME: TreeTheme = { fg: (_colour, text) => text, bold: (text) => text };

const MAX_WIDGET_LINES = 12;

/** Braille spinner frames for animated running indicator. */
export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/** Spinner cadence while a run is active. */
export const SPINNER_MS = 80;

/** Statuses that indicate a non-success outcome (used for linger behaviour and icon rendering). */
export const ERROR_STATUSES = new Set(["error", "aborted", "steered", "stopped"]);

/** How many parent turns failed and cancelled runs linger; completed runs clear after one. */
export const ERROR_LINGER_TURNS = 2;

/**
 * OMPS addition: OMPS delivers each result as a message that starts a parent turn at once, so a
 * completed run also stays this long after it ends before the turn rule may remove it.
 */
export const MIN_SUCCESS_LINGER_MS = 4000;

/** Tool name → human-readable action for activity descriptions. */
const TOOL_DISPLAY: Record<string, string> = {
	read: "reading",
	bash: "running command",
	edit: "editing",
	write: "writing",
	grep: "searching",
	find: "finding files",
	ls: "listing",
};

export type TreeStatus = "running" | "completed" | "error" | "stopped";

/** One direct run as the tree sees it. Every text field is already sanitised by the caller. */
export interface TreeAgent {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly status: TreeStatus;
	readonly toolUses: number;
	readonly startedAt: number;
	readonly completedAt?: number;
	readonly error?: string;
	/** Names of the run's currently active tools. */
	readonly activeTools: readonly string[];
	/** Provisional assistant text, used when no tool is active. */
	readonly responseText?: string;
}

/** Map an authoritative OMPS run state onto tintin's statuses. */
export function treeStatus(state: RunState): TreeStatus {
	if (state === "completed") return "completed";
	if (state === "failed") return "error";
	if (state === "cancelled") return "stopped";
	return "running";
}

export function formatMs(ms: number): string {
	return `${(ms / 1000).toFixed(1)}s`;
}

function truncateLine(text: string, len = 60): string {
	const line =
		text
			.split("\n")
			.find((l) => l.trim())
			?.trim() ?? "";
	if (line.length <= len) return line;
	return line.slice(0, len) + "…";
}

/** Build a human-readable activity string from currently-running tools or response text. */
export function describeActivity(activeTools: readonly string[], responseText?: string): string {
	if (activeTools.length > 0) {
		const groups = new Map<string, number>();
		for (const toolName of activeTools) {
			const action = TOOL_DISPLAY[toolName] ?? toolName;
			groups.set(action, (groups.get(action) ?? 0) + 1);
		}

		const parts: string[] = [];
		for (const [action, count] of groups) {
			if (count > 1) {
				parts.push(`${action} ${count} ${action === "searching" ? "patterns" : "files"}`);
			} else {
				parts.push(action);
			}
		}
		return parts.join(", ") + "…";
	}

	// No tools active — show truncated response text if available
	if (responseText && responseText.trim().length > 0) {
		return truncateLine(responseText);
	}

	return "thinking…";
}

const toolUseText = (count: number) => `${count} tool use${count === 1 ? "" : "s"}`;

/** OMPS addition: a run may not have reported its task summary yet, so drop the gap tintin leaves for it. */
const describedAs = (description: string, styled: string) => (description ? `  ${styled}` : "");

/** Render a finished agent line. */
export function renderFinishedLine(a: TreeAgent, theme: TreeTheme): string {
	const duration = formatMs((a.completedAt ?? a.startedAt) - a.startedAt);

	let icon: string;
	let statusText: string;
	if (a.status === "completed") {
		icon = theme.fg("success", "✓");
		statusText = "";
	} else if (a.status === "stopped") {
		icon = theme.fg("dim", "■");
		statusText = theme.fg("dim", " stopped");
	} else {
		icon = theme.fg("error", "✗");
		const errMsg = a.error ? `: ${a.error.slice(0, 60)}` : "";
		statusText = theme.fg("error", ` error${errMsg}`);
	}

	const parts: string[] = [];
	if (a.toolUses > 0) parts.push(toolUseText(a.toolUses));
	parts.push(duration);

	return `${icon} ${theme.fg("dim", a.name)}${describedAs(a.description, theme.fg("dim", a.description))} ${theme.fg("dim", "·")} ${theme.fg("dim", parts.join(" · "))}${statusText}`;
}

export interface TreeRenderOptions {
	readonly width: number;
	/** Spinner frame counter; advanced by the widget timer. */
	readonly frame: number;
	readonly now: number;
	readonly theme: TreeTheme;
	/** Collapsed view: the heading with the running count and nothing else. */
	readonly collapsed?: boolean;
}

/**
 * Render the tree. `agents` holds running runs and finished runs that still linger; the caller
 * applies the linger rule so this function stays pure.
 */
export function renderAgentTree(agents: readonly TreeAgent[], options: TreeRenderOptions): string[] {
	const { theme, now } = options;
	const running = agents.filter((a) => a.status === "running");
	const finished = agents.filter((a) => a.status !== "running");

	const hasActive = running.length > 0;
	const hasFinished = finished.length > 0;

	// Nothing to show — return empty so the widget occupies no rows.
	if (!hasActive && !hasFinished) return [];

	const w = options.width;
	const truncate = (line: string) => truncateToWidth(line, w);
	const headingColor = hasActive ? "accent" : "dim";
	const headingIcon = hasActive ? "●" : "○";
	const frame = SPINNER[options.frame % SPINNER.length];

	if (options.collapsed) {
		const count = hasActive ? theme.fg("dim", ` · ${running.length} running`) : "";
		return [truncate(theme.fg(headingColor, headingIcon) + " " + theme.fg(headingColor, "Agents") + count)];
	}

	// Build sections separately for overflow-aware assembly.
	// Each running agent = 2 lines (header + activity), finished = 1 line.

	const finishedLines: string[] = [];
	for (const a of finished) {
		finishedLines.push(truncate(theme.fg("dim", "├─") + " " + renderFinishedLine(a, theme)));
	}

	const runningLines: string[][] = []; // each entry is [header, activity]
	for (const a of running) {
		const parts: string[] = [];
		if (a.toolUses > 0) parts.push(toolUseText(a.toolUses));
		parts.push(formatMs(now - a.startedAt));
		const statsText = parts.join(" · ");

		const activity = describeActivity(a.activeTools, a.responseText);

		runningLines.push([
			truncate(
				theme.fg("dim", "├─") +
					` ${theme.fg("accent", frame)} ${theme.bold(theme.fg("accent", a.name))}${describedAs(a.description, theme.fg("muted", a.description))} ${theme.fg("dim", "·")} ${theme.fg("dim", statsText)}`,
			),
			truncate(theme.fg("dim", "│  ") + theme.fg("dim", `  ⎿  ${activity}`)),
		]);
	}

	// Assemble with overflow cap (heading + overflow indicator = 2 reserved lines).
	const maxBody = MAX_WIDGET_LINES - 1; // heading takes 1 line
	const totalBody = finishedLines.length + runningLines.length * 2;

	const lines: string[] = [truncate(theme.fg(headingColor, headingIcon) + " " + theme.fg(headingColor, "Agents"))];

	if (totalBody <= maxBody) {
		// Everything fits — add all lines and fix up connectors for the last item.
		lines.push(...finishedLines);
		for (const pair of runningLines) lines.push(...pair);

		// Fix last connector: swap ├─ → └─ and │ → space for activity lines.
		if (lines.length > 1) {
			const last = lines.length - 1;
			lines[last] = lines[last].replace("├─", "└─");
			// If the last item is a running agent, fix its header and the indent of its activity line.
			if (runningLines.length > 0 && last >= 2) {
				lines[last - 1] = lines[last - 1].replace("├─", "└─");
				lines[last] = lines[last].replace("│  ", "   ");
			}
		}
	} else {
		// Overflow — prioritise running over finished. Reserve 1 line for the overflow indicator.
		let budget = maxBody - 1;
		let hiddenRunning = 0;
		let hiddenFinished = 0;

		// 1. Running agents (2 lines each)
		for (const pair of runningLines) {
			if (budget >= 2) {
				lines.push(...pair);
				budget -= 2;
			} else {
				hiddenRunning++;
			}
		}

		// 2. Finished agents
		for (const fl of finishedLines) {
			if (budget >= 1) {
				lines.push(fl);
				budget--;
			} else {
				hiddenFinished++;
			}
		}

		// Overflow summary
		const overflowParts: string[] = [];
		if (hiddenRunning > 0) overflowParts.push(`${hiddenRunning} running`);
		if (hiddenFinished > 0) overflowParts.push(`${hiddenFinished} finished`);
		const overflowText = overflowParts.join(", ");
		lines.push(
			truncate(
				theme.fg("dim", "└─") + ` ${theme.fg("dim", `+${hiddenRunning + hiddenFinished} more (${overflowText})`)}`,
			),
		);
	}

	return lines;
}

/**
 * Tracks how many parent turns each finished run has survived, as tintin's widget does, plus the
 * OMPS time floor for completed runs. It owns no timer: callers ask it while rendering.
 */
export class TreeLinger {
	private readonly finishedTurnAge = new Map<string, number>();
	private readonly finishedAt = new Map<string, number>();

	onTurnStart(): void {
		for (const [id, age] of this.finishedTurnAge) this.finishedTurnAge.set(id, age + 1);
	}

	/** Record a run as finished. A repeated mark keeps the first age, like tintin. */
	markFinished(id: string, at: number): void {
		if (this.finishedTurnAge.has(id)) return;
		this.finishedTurnAge.set(id, 0);
		this.finishedAt.set(id, at);
	}

	/** A run that starts again drops its age, so its new outcome is shown. */
	markRunning(id: string): void {
		this.finishedTurnAge.delete(id);
		this.finishedAt.delete(id);
	}

	shouldShow(id: string, status: TreeStatus, now: number): boolean {
		const age = this.finishedTurnAge.get(id) ?? 0;
		if (ERROR_STATUSES.has(status)) return age < ERROR_LINGER_TURNS;
		if (age < 1) return true;
		return now - (this.finishedAt.get(id) ?? now) < MIN_SUCCESS_LINGER_MS;
	}

	/** When the time floor of a completed run ends, so a widget can repaint once at that moment. */
	floorEndsAt(id: string): number | undefined {
		const at = this.finishedAt.get(id);
		return at === undefined ? undefined : at + MIN_SUCCESS_LINGER_MS;
	}

	/** Drop entries for runs the session no longer holds. */
	retain(ids: ReadonlySet<string>): void {
		for (const id of this.finishedTurnAge.keys())
			if (!ids.has(id)) {
				this.finishedTurnAge.delete(id);
				this.finishedAt.delete(id);
			}
	}
}
