// The session-wide below-editor fleet strip. This controller owns the persistent widget: it maps
// authoritative RunManager snapshots plus retained observation evidence into the pure projection
// from fleet.ts and keeps one live strip per owning session. Result delivery stays in notify.ts.

import { truncateToWidth } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { FleetStrip, type FleetKeys, type FleetRoot } from "./fleet.ts";
import type { Messenger, TerminalFacts, WidgetComponent } from "./notify.ts";
import { plain } from "./plain.ts";
import type { ObservedTree } from "./observation.ts";
import type { RunView } from "./runs.ts";

export type { TerminalFacts, WidgetComponent };

export interface FleetWidgetDeps {
	/** The live owning parent, or nothing once its session has ended. */
	messenger(owner: string): Messenger | undefined;
	/** Authoritative direct-run snapshots in launch order. */
	runs(owner: string): readonly RunView[];
	/** Retained observation trees for those roots, when present. */
	trees(owner: string): readonly ObservedTree[];
	/** Cached registry `ui.maxVisibleAgents`. Rendering performs no file access. */
	visibleAgents(): number;
	/** Shortcut labels for row hints; empty labels omit the hint. */
	keys(): FleetKeys;
	/** Session-local strip state: expansion and selection never persist. */
	strip: FleetStrip;
	/** Interactive hosts keep a live component; other hosts receive plain lines. */
	mode(): string;
	/** Wall clock for elapsed times. */
	now?(): number;
}

/** Line hosts accept arrays but not live components, so they render at a fixed budget. */
const LINE_HOST_WIDTH = 200;
const LINE_HOST_ROWS = 40;
const MAX_AGENT_CHARS = 48;

function fit(line: string, width: number): string {
	return stripVTControlCharacters(truncateToWidth(line, width, ""));
}

export class FleetWidget {
	private readonly attached = new Set<string>();
	private readonly painters = new Map<string, () => void>();
	private readonly factsByOwner = new Map<string, TerminalFacts>();

	constructor(private readonly deps: FleetWidgetDeps) {}

	/** Authoritative run state joined with retained evidence; no run is invented from observations. */
	private roots(owner: string): FleetRoot[] {
		const trees = new Map(this.deps.trees(owner).map((tree) => [tree.runId, tree]));
		return this.deps.runs(owner).map((run) => {
			const root = trees.get(run.id)?.nodes[0];
			return {
				runId: run.id,
				agent: plain(run.agent, MAX_AGENT_CHARS),
				state: run.state,
				startedAt: run.startedAt,
				endedAt: run.endedAt,
				taskSummary: root?.taskSummary,
				activeTools: root?.activeTools.map((tool) => plain(tool.name, 128)) ?? [],
				observedDescendants: trees.get(run.id) ? trees.get(run.id)!.nodes.length - 1 : 0,
				observationIncomplete: !!trees.get(run.id)?.incomplete,
			};
		});
	}

	/** Render the strip's content lines within the given terminal width. */
	renderLines(owner: string, width: number, terminalRows: number): string[] {
		const roots = this.roots(owner);
		if (!roots.length) return [];
		const lines = this.deps.strip.render(
			{ roots, visibleAgents: this.deps.visibleAgents(), terminalRows, now: this.deps.now?.() },
			this.deps.keys(),
		);
		return lines.map((line) => fit(line, width));
	}

	/** Toggle this session's strip expansion. */
	toggle(): void {
		this.deps.strip.toggle();
	}

	/** Terminal facts captured when the strip attached; view navigation reads focus from here. */
	factsOf(owner: string): TerminalFacts | undefined {
		return this.factsByOwner.get(owner);
	}

	/** Register the persistent below-editor strip once per owning session. */
	attach(owner: string): void {
		if (this.attached.has(owner)) return;
		const messenger = this.deps.messenger(owner);
		if (!messenger?.setWidget) return;
		this.attached.add(owner);
		if (this.deps.mode() === "tui")
			messenger.setWidget((terminal: TerminalFacts) => {
				this.factsByOwner.set(owner, terminal);
				this.painters.set(owner, () => terminal.requestRender());
				return {
					render: (width: number) => this.renderLines(owner, width, terminal.rows),
					invalidate: () => terminal.requestRender(),
				};
			}, "belowEditor");
		else messenger.setWidget(this.renderLines(owner, LINE_HOST_WIDTH, LINE_HOST_ROWS), "belowEditor");
	}

	/** Repaint after a run snapshot changes. */
	onChange(run: RunView): void {
		this.repaint(run.owner);
	}

	/** Repaint the attached strip; a display failure never changes a run. */
	repaint(owner: string): void {
		if (!this.attached.has(owner)) return;
		const messenger = this.deps.messenger(owner);
		if (!messenger?.setWidget) return;
		if (this.deps.mode() === "tui") {
			try {
				this.painters.get(owner)?.();
			} catch {
				/* Display failures do not change the run. */
			}
		} else messenger.setWidget(this.renderLines(owner, LINE_HOST_WIDTH, LINE_HOST_ROWS), "belowEditor");
	}

	/** Remove the strip; the owning session keeps its runs. */
	clear(owner: string): void {
		this.attached.delete(owner);
		this.painters.delete(owner);
		this.factsByOwner.delete(owner);
		try {
			this.deps.messenger(owner)?.setWidget?.(undefined, "belowEditor");
		} catch {
			/* Detach even when the UI has gone. */
		}
	}
}
