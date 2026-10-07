import {
	ScrollView,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { DetailSelection, type DetailReader, type RunDetails } from "./details.ts";
import type { ObservationStore, ObservedNode, ObservedTree } from "./observation.ts";
import { plain } from "./plain.ts";
import { isTerminal } from "./runs.ts";

/** One visible tree row: a retained node plus its fold state. */
interface ModalRow {
	key: string;
	root: string;
	node: ObservedNode;
	tree: ObservedTree;
	indent: number;
	folded: boolean;
	/** Retained descendants hidden behind this fold. They stay inspectable after unfolding. */
	hidden: number;
}

export interface InspectorOptions {
	readonly observations: ObservationStore;
	readonly owner: string;
	readonly read: DetailReader;
	readonly height: () => number;
	readonly redraw: () => void;
	readonly close: () => void;
	readonly live?: () => boolean;
	readonly selectedRunId?: string;
}

/** Below this width the modal shows the tree and details sequentially instead of side by side. */
const SEQUENTIAL_WIDTH = 80;
const TREE_PANE_MIN = 24;

/**
 * Read-only session modal. One parent-first tree with foldable branches; Enter reads the selected
 * node's saved evidence. Navigation never starts a read, a process or a model request.
 */
export class Inspector implements Component {
	private rows = new Map<string, ModalRow>();
	private visible: ModalRow[] = [];
	private key: string | undefined;
	private folded = new Set<string>();
	private detailScreen = false;
	private selection: DetailSelection | undefined;
	private details: RunDetails | undefined;
	private error: string | undefined;
	private loading = false;
	private requested = false;
	private disposed = false;
	private renderedTreeRows = 0;
	private lastRenderedWidth = 0;
	private lastHeight = 0;
	private readonly stop: () => void;
	private readonly scroll: ScrollView;

	constructor(private readonly options: InspectorOptions) {
		this.scroll = new ScrollView(
			{ render: (width) => this.detailLines(width), invalidate() {} },
			{ scrollbar: "hidden", overscroll: "contain" },
		);
		this.rebuild(options.selectedRunId);
		this.stop = this.disposed
			? () => {}
			: options.observations.subscribe(options.owner, () => {
					if (!this.live()) return;
					try {
						this.refresh();
						this.redraw();
					} catch {
						this.close();
					}
				});
		if (options.selectedRunId && this.key) void this.load(this.key);
	}

	private live(): boolean {
		return !this.disposed && (this.options.live?.() ?? true);
	}

	private redraw(): void {
		if (!this.live()) return;
		try {
			this.options.redraw();
		} catch {
			this.close();
		}
	}

	/** Rebuild visible rows parent-first; the selection keeps its run identity. */
	private rebuild(selectedRunId?: string): void {
		const previousState = this.key ? this.rows.get(this.key)?.node.state : undefined;
		this.lastHeight = Math.max(1, this.options.height());
		this.rows = new Map();
		this.visible = [];
		for (const tree of this.options.observations.trees(this.options.owner)) {
			const children = new Map<string, ObservedNode[]>();
			for (const node of tree.nodes) {
				if (!node.parentRunId) continue;
				children.set(node.parentRunId, [...(children.get(node.parentRunId) ?? []), node]);
			}
			const descendants = (runId: string): number =>
				(children.get(runId) ?? []).reduce((total, child) => total + 1 + descendants(child.runId), 0);
			const walk = (node: ObservedNode, indent: number): void => {
				// Siblings keep arrival order, which is launch order; run ids never reorder rows.
				const kids = children.get(node.runId) ?? [];
				const key = `${tree.runId}:${node.runId}`;
				const folded = kids.length > 0 && this.folded.has(key);
				const row: ModalRow = {
					key,
					root: tree.runId,
					node,
					tree,
					indent,
					folded,
					hidden: folded ? descendants(node.runId) : 0,
				};
				this.rows.set(key, row);
				this.visible.push(row);
				if (!folded) for (const kid of kids) walk(kid, indent + 1);
			};
			walk(tree.nodes[0], 0);
		}
		// Keep the selection attached to run identity; fall back to the requested or first row.
		let preferred = this.key;
		if (selectedRunId) {
			preferred = this.visible.find((row) => row.node.runId === selectedRunId)?.key;
			for (const row of this.rows.values())
				if (row.node.runId === selectedRunId) {
					preferred = row.key;
					break;
				}
		}
		const index = Math.max(
			0,
			this.visible.findIndex((row) => row.key === preferred),
		);
		const current = this.visible[index]?.key;
		if (current !== this.key) this.choose(current);
		const state = current ? this.rows.get(current)?.node.state : undefined;
		if (current && state && state !== previousState && isTerminal(state) && this.requested && !this.loading)
			void this.load(current);
	}

	/** A live observation change refreshes rows without dropping the selection or the fold set. */
	private refresh(): void {
		this.rebuild();
	}

	private choose(key: string | undefined): void {
		if (key === this.key) return;
		this.selection?.close();
		this.selection = new DetailSelection(this.options.read, () => this.live());
		this.key = key;
		this.details = undefined;
		this.error = undefined;
		this.loading = false;
		this.requested = false;
		this.detailScreen = false;
		this.scroll.scrollToStart();
		this.redraw();
	}

	private async load(key: string): Promise<void> {
		if (!this.live()) return;
		this.choose(key);
		const row = this.rows.get(key);
		const selection = this.selection;
		if (!row || !selection) return;
		this.loading = true;
		this.requested = true;
		this.error = undefined;
		this.redraw();
		try {
			const details = await selection.select(row.root, row.node.runId);
			if (!details || !this.live() || this.selection !== selection) return;
			this.details = details;
			this.loading = false;
			this.redraw();
			const latest = this.rows.get(key)?.node;
			if (!details.output && latest && latest.state !== details.node.state && isTerminal(latest.state))
				void this.load(key);
		} catch (error) {
			if (!this.live() || this.selection !== selection) return;
			this.loading = false;
			this.error = plain((error as Error).message, 1024);
			this.redraw();
		}
	}

	private treeLines(width: number, budget: number): string[] {
		const selectedIndex = this.visible.findIndex((row) => row.key === this.key);
		const windowed = this.visible.slice(
			Math.max(0, Math.min(selectedIndex - budget + 1, this.visible.length - budget)),
			Math.max(0, Math.min(selectedIndex - budget + 1, this.visible.length - budget)) + budget,
		);
		return windowed.map((row) => {
			const marker = row.key === this.key ? "> " : "  ";
			const label = `${plain(row.node.agent, 64)} ${row.node.state} (${row.node.runId})${row.node.incomplete ? " [observation incomplete]" : ""}${row.node.runId === row.root && row.tree.incomplete ? " [tree observation incomplete]" : ""}${row.folded ? ` [+${row.hidden} folded]` : ""}`;
			return truncateToWidth(`${marker}${"  ".repeat(row.indent)}${label}`, width, "");
		});
	}

	private detailLines(width: number): string[] {
		const selected = this.key ? this.rows.get(this.key) : undefined;
		if (!selected) return ["No retained agents to inspect."];
		const { node } = selected;
		const lineage: string[] = [];
		let ancestor: ObservedNode | undefined = node;
		while (ancestor) {
			lineage.unshift(`${plain(ancestor.agent, 256)} (${ancestor.runId})`);
			const parentId: string | undefined = ancestor.parentRunId;
			ancestor = parentId ? this.options.observations.node(this.options.owner, selected.root, parentId) : undefined;
		}
		const header = [
			...(selected.tree.incomplete
				? [`Tree observation incomplete: ${selected.tree.reasons.join(", ") || "missing evidence"}`]
				: []),
			...(node.incomplete
				? [
						`Selected observation incomplete: ${node.reasons.join(", ") || "missing evidence"}${node.reasons.includes("ancestor-terminal") ? " (terminal evidence missing)" : ""}`,
					]
				: []),
			lineage.join(" > "),
			`Run: ${node.runId}`,
			`State: ${node.state}`,
			`Model: ${node.model ? plain(node.model, 512) : "unavailable"}`,
			`Tools: ${node.activeTools.map((tool) => plain(tool.name, 128)).join(", ") || "none observed"}`,
			// The live preview is display text only; the saved output below stays authoritative.
			...(node.assistantPreview ? [`Preview (provisional): ${plain(node.assistantPreview, 2048)}`] : []),
		];
		let body: string[];
		if (this.error) body = [`Details unavailable: ${this.error}`];
		else if (this.loading) body = ["Reading selected saved files..."];
		else if (!this.details) body = ["Press Enter to read this agent's task and saved output."];
		else
			body = [
				"Task:",
				this.details.task ?? "Unavailable",
				...(this.details.taskTruncated
					? ["[Task configuration truncated at 64 KiB; read config.json in the saved run folder]"]
					: []),
				this.details.partial ? "Partial output:" : "Output:",
				this.details.output ?? "Unavailable",
				...(this.details.outputTruncated ? ["[Output truncated at 64 KiB]"] : []),
				`Saved output: ${plain(this.details.outputPath, 4096)}`,
			];
		return [...header, ...body].flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
	}

	render(width: number): string[] {
		if (!this.live() || width < 1) return [];
		try {
			return this.renderView(width);
		} catch {
			this.close();
			return [];
		}
	}

	private renderView(width: number): string[] {
		if (this.options.height() !== this.lastHeight) this.refresh();
		this.lastRenderedWidth = width;
		const title = truncateToWidth("OMPS inspector", width, "");
		const hint = truncateToWidth(
			this.detailScreen
				? "Escape back · PageUp/PageDown output"
				: "Arrows select · Left/Right fold · Enter details · Escape close",
			width,
			"",
		);
		const bodyBudget = Math.max(1, this.lastHeight - 2);
		if (width < SEQUENTIAL_WIDTH) {
			// Sequential layout: the tree screen, or the opened detail screen after Enter.
			if (!this.detailScreen) {
				const tree = this.treeLines(width, bodyBudget);
				this.renderedTreeRows = tree.length;
				return [title, ...tree, hint];
			}
			this.renderedTreeRows = 0;
			const body = this.scroll.render(width);
			const height = Math.max(0, bodyBudget - 1);
			this.scroll.updateLayout(body.length, height, () => this.redraw());
			return [title, ...body.slice(this.scroll.scrollTop, this.scroll.scrollTop + height), hint];
		}
		// Wide layout: the tree pane keeps every visible row reachable; details sit beside it.
		const treeWidth = Math.max(TREE_PANE_MIN, Math.floor(width * 0.4));
		const detailWidth = Math.max(1, width - treeWidth - 1);
		const tree = this.treeLines(treeWidth, bodyBudget);
		this.renderedTreeRows = tree.length;
		const body = this.scroll.render(detailWidth);
		const height = bodyBudget;
		this.scroll.updateLayout(body.length, height, () => this.redraw());
		const detail = body.slice(this.scroll.scrollTop, this.scroll.scrollTop + height);
		const lines: string[] = [];
		for (let index = 0; index < Math.max(tree.length, detail.length); index++) {
			const left = tree[index] ? truncateToWidth(tree[index].padEnd(treeWidth), treeWidth, "") : " ".repeat(treeWidth);
			lines.push(`${left} ${detail[index] ?? ""}`.trimEnd());
		}
		return [title, ...lines.slice(0, bodyBudget), hint].slice(0, this.lastHeight);
	}

	handleInput(data: string): void {
		if (!this.live()) return;
		if (matchesKey(data, "escape")) {
			if (this.detailScreen) {
				this.detailScreen = false;
				this.scroll.scrollToStart();
				this.redraw();
				return;
			}
			return this.close();
		}
		if (this.details && (matchesKey(data, "pageUp") || matchesKey(data, "pageDown"))) {
			this.scroll.scrollBy((matchesKey(data, "pageUp") ? -1 : 1) * Math.max(1, this.scroll.viewportHeight - 1));
			this.redraw();
			return;
		}
		try {
			this.navigate(data);
			this.redraw();
		} catch {
			this.close();
		}
	}

	private navigate(data: string): void {
		const index = Math.max(
			0,
			this.visible.findIndex((row) => row.key === this.key),
		);
		if (matchesKey(data, "down") && index < this.visible.length - 1) this.choose(this.visible[index + 1].key);
		else if (matchesKey(data, "up") && index > 0) this.choose(this.visible[index - 1].key);
		else if (matchesKey(data, "enter")) {
			if (this.key) void this.load(this.key);
			if (this.lastRenderedWidth < SEQUENTIAL_WIDTH) this.detailScreen = true;
		} else if (matchesKey(data, "left")) {
			const row = this.visible[index];
			if (row) {
				const hasChildren = this.visible.some((other) => other.node.parentRunId === row.node.runId);
				if (hasChildren && !this.folded.has(row.key)) {
					this.folded.add(row.key);
					this.rebuild();
				} else if (row.node.parentRunId) {
					const parentKey = this.visible.find(
						(other) => other.node.runId === row.node.parentRunId && other.root === row.root,
					)?.key;
					if (parentKey) this.choose(parentKey);
				}
			}
		} else if (matchesKey(data, "right")) {
			const row = this.visible[index];
			if (row && this.folded.delete(row.key)) this.rebuild();
		}
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (!this.live()) return undefined;
		try {
			if (event.type === "click" && event.button === "left" && event.y >= 1 && event.y <= this.renderedTreeRows) {
				const row = this.visible[event.y - 1];
				if (row) void this.load(row.key);
				return { handled: true };
			}
			if (event.type === "wheel" && event.y > this.renderedTreeRows) {
				this.scroll.scrollBy(event.wheelDelta ?? 0);
				return { handled: true };
			}
			return undefined;
		} catch {
			this.close();
			return { handled: true };
		}
	}

	invalidate(): void {
		this.scroll.invalidate();
	}

	close(): void {
		if (this.disposed) return;
		this.dispose();
		try {
			this.options.close();
		} catch {
			/* Owned reads and subscriptions are already released. */
		}
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.stop?.();
		this.selection?.close();
		this.details = undefined;
		this.rows.clear();
		this.visible = [];
	}
}
