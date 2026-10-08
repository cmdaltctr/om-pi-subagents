// The session-wide fleet widgets: tintin's `● Agents` tree above the editor and the navigation list
// below it. This controller maps authoritative RunManager snapshots plus retained observation
// evidence into both renderers, owns the spinner and linger timers, and keeps one pair of widgets per
// owning session. Result delivery stays in notify.ts.

import {
	PLAIN_THEME,
	renderAgentTree,
	SPINNER_MS,
	TreeLinger,
	treeStatus,
	type TreeAgent,
	type TreeTheme,
} from "./agent-tree-widget.ts";
import { LIST_LINGER_MS, listedRoots, type FleetRoot, type FleetStrip } from "./fleet.ts";
import type { Messenger, TerminalFacts, WidgetComponent } from "./notify.ts";
import { plain } from "./plain.ts";
import type { ObservedTree } from "./observation.ts";
import { isTerminal, type RunView } from "./runs.ts";

export type { TerminalFacts, WidgetComponent };

/** Widget keys: the list keeps the original OMPS key; the tree gets its own. */
export const LIST_KEY = "omps";
export const TREE_KEY = "omps-agents";

export interface FleetWidgetDeps {
	/** The live owning parent, or nothing once its session has ended. */
	messenger(owner: string): Messenger | undefined;
	/** Authoritative direct-run snapshots in launch order. */
	runs(owner: string): readonly RunView[];
	/** Retained observation trees for those roots, when present. */
	trees(owner: string): readonly ObservedTree[];
	/** Task tool calls each run has started. */
	toolUses(runId: string): number;
	/** Cached registry `ui.maxVisibleAgents`. Rendering performs no file access. */
	visibleAgents(): number;
	/** Session-local view state: toggles and selection never persist. */
	strip: FleetStrip;
	/** Interactive hosts keep live components; other hosts receive plain lines. */
	mode(): string;
	/** Wall clock for elapsed times and lingers. */
	now(): number;
}

/** Line hosts accept arrays but not live components, so they render at a fixed width. */
const LINE_HOST_WIDTH = 200;
const MAX_AGENT_CHARS = 48;
const MAX_ERROR_CHARS = 120;

interface OwnerState {
	readonly linger: TreeLinger;
	painter?: () => void;
	facts?: TerminalFacts;
	frame: number;
	spinner?: ReturnType<typeof setInterval>;
	expiry?: ReturnType<typeof setTimeout>;
}

export class FleetWidget {
	private readonly owners = new Map<string, OwnerState>();

	constructor(private readonly deps: FleetWidgetDeps) {}

	/** Authoritative run state joined with retained evidence; no run is invented from observations. */
	private roots(owner: string): FleetRoot[] {
		const trees = new Map(this.deps.trees(owner).map((tree) => [tree.runId, tree]));
		return this.deps.runs(owner).map((run) => {
			const observed = trees.get(run.id);
			const root = observed?.nodes[0];
			return {
				runId: run.id,
				agent: plain(run.agent, MAX_AGENT_CHARS),
				state: run.state,
				startedAt: run.startedAt,
				endedAt: run.endedAt,
				taskSummary: root?.taskSummary,
				activeTools: root?.activeTools.map((tool) => plain(tool.name, 128)) ?? [],
				observedDescendants: observed ? observed.nodes.length - 1 : 0,
				observationIncomplete: !!observed?.incomplete,
				toolUses: this.deps.toolUses(run.id),
				assistantPreview: root?.assistantPreview,
				error: run.error === undefined ? undefined : plain(run.error, MAX_ERROR_CHARS),
			};
		});
	}

	/** Running runs plus finished runs the linger rule still shows. */
	private treeAgents(owner: string, state: OwnerState): TreeAgent[] {
		const now = this.deps.now();
		return this.roots(owner)
			.map((root): TreeAgent => {
				const status = treeStatus(root.state);
				return {
					id: root.runId,
					name: root.agent,
					description: root.taskSummary ?? "",
					status,
					toolUses: root.toolUses,
					startedAt: root.startedAt,
					completedAt: status === "running" ? undefined : (root.endedAt ?? now),
					error: root.error,
					activeTools: root.activeTools,
					responseText: root.assistantPreview,
				};
			})
			.filter((agent) => agent.status === "running" || state.linger.shouldShow(agent.id, agent.status, now));
	}

	/** Render the tree within the given width. */
	treeLines(owner: string, width: number, theme: TreeTheme = PLAIN_THEME): string[] {
		const state = this.owners.get(owner);
		if (!state || this.deps.strip.isHidden) return [];
		return renderAgentTree(this.treeAgents(owner, state), {
			width,
			frame: state.frame,
			now: this.deps.now(),
			theme,
			collapsed: !this.deps.strip.isExpanded,
		});
	}

	/** Render the navigation list within the given width. */
	listLines(owner: string, width: number, theme: TreeTheme = PLAIN_THEME): string[] {
		const roots = this.roots(owner);
		return this.deps.strip.render(
			{ roots, visibleAgents: this.deps.visibleAgents(), now: this.deps.now() },
			width,
			theme,
		);
	}

	/** Run ids in list order, exactly as the list shows them; empty while the list is hidden. */
	listedRunIds(owner: string): string[] {
		const ids = this.deps.strip.isListVisible
			? listedRoots(this.roots(owner), this.deps.now()).map((root) => root.runId)
			: [];
		if (!ids.length) this.deps.strip.endSelection();
		return ids;
	}

	/** Toggle this session's view between expanded and the collapsed tree heading. */
	toggle(): void {
		this.deps.strip.toggle();
	}

	/** Terminal facts captured when the widgets attached; view navigation reads focus from here. */
	factsOf(owner: string): TerminalFacts | undefined {
		return this.owners.get(owner)?.facts;
	}

	/** Register both widgets once per owning session. */
	attach(owner: string): void {
		if (this.owners.has(owner)) return;
		const messenger = this.deps.messenger(owner);
		if (!messenger?.setWidget) return;
		const state: OwnerState = { linger: new TreeLinger(), frame: 0 };
		this.owners.set(owner, state);
		// Runs that ended before attachment still linger from their real end time.
		for (const run of this.deps.runs(owner)) this.track(state, run);
		if (this.deps.mode() === "tui") {
			const component =
				(render: (width: number, theme: TreeTheme) => string[]) =>
				(terminal: TerminalFacts): WidgetComponent => {
					state.facts = terminal;
					state.painter = () => terminal.requestRender();
					return {
						render: (width: number) => render(width, terminal.theme ?? PLAIN_THEME),
						invalidate: () => terminal.requestRender(),
					};
				};
			messenger.setWidget(
				component((width, theme) => this.treeLines(owner, width, theme)),
				"aboveEditor",
				TREE_KEY,
			);
			messenger.setWidget(
				component((width, theme) => this.listLines(owner, width, theme)),
				"belowEditor",
				LIST_KEY,
			);
		} else this.sendLines(owner, messenger);
		this.schedule(owner, state);
	}

	/** Repaint after a run snapshot changes. */
	onChange(run: RunView): void {
		const state = this.owners.get(run.owner);
		if (!state) return;
		this.track(state, run);
		this.schedule(run.owner, state);
		this.repaint(run.owner);
	}

	/** Age finished runs when the owning parent starts a turn, as tintin's widget does. */
	onTurnStart(owner: string): void {
		const state = this.owners.get(owner);
		if (!state) return;
		state.linger.onTurnStart();
		this.schedule(owner, state);
		this.repaint(owner);
	}

	private track(state: OwnerState, run: RunView): void {
		if (isTerminal(run.state)) state.linger.markFinished(run.id, run.endedAt ?? this.deps.now());
		else state.linger.markRunning(run.id);
	}

	/**
	 * Run the 80 ms spinner only while a run is active, and arm one repaint for the next linger end so
	 * a finished line leaves without a spinner tick. Line hosts get neither timer.
	 */
	private schedule(owner: string, state: OwnerState): void {
		if (state.expiry) clearTimeout(state.expiry);
		state.expiry = undefined;
		if (this.deps.mode() !== "tui") return;
		const runs = this.deps.runs(owner);
		state.linger.retain(new Set(runs.map((run) => run.id)));
		if (runs.some((run) => !isTerminal(run.state))) {
			state.spinner ??= setInterval(() => {
				state.frame++;
				this.repaint(owner);
			}, SPINNER_MS);
			// The spinner must never keep the parent process alive.
			state.spinner.unref?.();
			return;
		}
		if (state.spinner) clearInterval(state.spinner);
		state.spinner = undefined;
		const now = this.deps.now();
		const ends = runs.flatMap((run) => {
			const end = run.endedAt ?? now;
			return [end + LIST_LINGER_MS, state.linger.floorEndsAt(run.id) ?? end].filter((at) => at > now);
		});
		if (!ends.length) return;
		state.expiry = setTimeout(
			() => {
				state.expiry = undefined;
				this.repaint(owner);
				this.schedule(owner, state);
			},
			Math.min(...ends) - now,
		);
		state.expiry.unref?.();
	}

	/** Repaint the attached widgets; a display failure never changes a run. */
	repaint(owner: string): void {
		const state = this.owners.get(owner);
		if (!state) return;
		const messenger = this.deps.messenger(owner);
		if (!messenger?.setWidget) return;
		if (this.deps.mode() === "tui") {
			try {
				state.painter?.();
			} catch {
				/* Display failures do not change the run. */
			}
		} else this.sendLines(owner, messenger);
	}

	private sendLines(owner: string, messenger: Messenger): void {
		messenger.setWidget?.(this.treeLines(owner, LINE_HOST_WIDTH), "aboveEditor", TREE_KEY);
		messenger.setWidget?.(this.listLines(owner, LINE_HOST_WIDTH), "belowEditor", LIST_KEY);
	}

	/** Remove both widgets and stop their timers; the owning session keeps its runs. */
	clear(owner: string): void {
		const state = this.owners.get(owner);
		if (state?.spinner) clearInterval(state.spinner);
		if (state?.expiry) clearTimeout(state.expiry);
		this.owners.delete(owner);
		const messenger = this.deps.messenger(owner);
		for (const [placement, key] of [
			["aboveEditor", TREE_KEY],
			["belowEditor", LIST_KEY],
		] as const)
			try {
				messenger?.setWidget?.(undefined, placement, key);
			} catch {
				/* Detach even when the UI has gone. */
			}
	}
}
