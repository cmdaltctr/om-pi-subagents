import {
	ScrollView,
	matchesKey,
	truncateToWidth,
	wrapTextWithAnsi,
	type MarkdownTheme,
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { DetailSelection, type DetailReader, type RunDetails } from "./details.ts";
import type { ObservationStore, ObservedNode, ObservedTree } from "./observation.ts";
import { plain } from "./plain.ts";
import { isTerminal } from "./runs.ts";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { InspectorPresentation, inspectorElapsed } from "./inspector-presentation.ts";

const HORIZONTAL_MARGIN = 2;
const HORIZONTAL_MARGIN_MIN_WIDTH = 40;
const VERTICAL_MARGIN = 1;
const VERTICAL_MARGIN_MIN_HEIGHT = 10;
const SUMMARY_LINE_CAP = 3;

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
	readonly theme?: Theme;
	readonly markdownTheme?: MarkdownTheme;
}

/**
 * Read-only session modal. One parent-first tree with foldable branches; Enter reads the selected
 * node's saved evidence. Navigation starts no process or model request.
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
	private renderedPickerKeys: string[] = [];
	private lastHeight = 0;
	private bodyStart = 1;
	private readonly direct: boolean;
	private readonly stop: (() => void) | undefined;
	private readonly scroll: ScrollView;
	private readonly presentation: InspectorPresentation;
	private elapsedTimer: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly options: InspectorOptions) {
		this.direct = !!options.selectedRunId;
		this.presentation = new InspectorPresentation(options.theme, options.markdownTheme);
		this.scroll = new ScrollView(
			{ render: (width) => this.detailLines(width), invalidate: () => this.presentation.invalidate() },
			{ scrollbar: "hidden", overscroll: "contain", follow: "end" },
		);
		this.scroll.scrollTo(0, { disableFollow: true });
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
		if (options.selectedRunId && this.key) this.open(this.key);
		this.refreshElapsed();
	}

	private refreshElapsed(): void {
		// Failed construction leaves no accessible instance to dispose, so subscribe before starting the timer.
		if (!this.stop) return;
		const node = this.key ? this.rows.get(this.key)?.node : undefined;
		if (!this.live() || !node || isTerminal(node.state)) {
			if (this.elapsedTimer) clearInterval(this.elapsedTimer);
			this.elapsedTimer = undefined;
			return;
		}
		if (this.elapsedTimer) return;
		this.elapsedTimer = setInterval(() => {
			if (!this.live()) return this.dispose();
			this.redraw();
		}, 1000);
		this.elapsedTimer.unref?.();
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
		this.refreshElapsed();
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
		this.scroll.scrollTo(0, { disableFollow: true });
		this.presentation.invalidate();
		this.refreshElapsed();
		this.redraw();
	}

	private open(key: string): void {
		this.choose(key);
		this.detailScreen = true;
		void this.load(key);
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
		if (!this.live()) return;
		try {
			const details = await selection.select(row.root, row.node.runId);
			if (!details || !this.live() || this.selection !== selection) return;
			this.details = details;
			this.loading = false;
			this.redraw();
			const latest = this.rows.get(key)?.node;
			if (latest && latest.state !== row.node.state && isTerminal(latest.state)) void this.load(key);
		} catch (error) {
			if (!this.live() || this.selection !== selection) return;
			this.loading = false;
			this.error = plain((error as Error).message, 1024);
			this.redraw();
		}
	}

	private treeLines(width: number, budget: number): string[] {
		this.renderedPickerKeys = [];
		const rendered = this.visible.map((row) => {
			const marker = row.key === this.key ? "> " : "  ";
			// Reserve readable name space and room for wide summary characters at every displayed depth.
			const indent = "  ".repeat(Math.min(row.indent, Math.max(0, Math.floor((width - marker.length - 12) / 2))));
			const label = `${plain(row.node.agent, 64)} ${row.node.state} · ${inspectorElapsed(row.node)} (${row.node.runId.slice(0, 12)})${row.node.incomplete || row.tree.incomplete ? " [observation incomplete]" : ""}${row.folded ? ` [+${row.hidden} folded]` : ""}`;
			const first = truncateToWidth(`${marker}${indent}${label}`, width, "");
			const lines = [
				row.key === this.key ? this.presentation.colour("accent", first) : this.presentation.colour("text", first),
			];
			if (width >= 30 && budget > 1 && row.node.taskSummary) {
				const prefix = `  ${indent}`;
				const summaryWidth = Math.max(1, width - prefix.length);
				const wrapped = wrapTextWithAnsi(plain(row.node.taskSummary, 512), summaryWidth);
				const summary = wrapped.slice(0, SUMMARY_LINE_CAP);
				if (wrapped.length > SUMMARY_LINE_CAP)
					summary[SUMMARY_LINE_CAP - 1] = `${truncateToWidth(summary[SUMMARY_LINE_CAP - 1], summaryWidth - 1, "")}…`;
				lines.push(
					...summary.map((line) => this.presentation.colour("muted", truncateToWidth(`${prefix}${line}`, width, ""))),
				);
			}
			if (row.node.runId === row.root && row.tree.incomplete)
				lines.push(
					...wrapTextWithAnsi(
						`Tree observation incomplete: ${row.tree.reasons.join(", ") || "missing evidence"}`,
						width,
					).map((line) => this.presentation.colour("warning", truncateToWidth(line, width, ""))),
				);
			return { row, lines };
		});
		const selectedIndex = Math.max(
			0,
			this.visible.findIndex((row) => row.key === this.key),
		);
		let start = selectedIndex;
		let used = rendered[start]?.lines.length ?? 0;
		while (start > 0 && used + rendered[start - 1].lines.length <= budget) used += rendered[--start].lines.length;
		const lines: string[] = [];
		for (const entry of rendered.slice(start)) {
			const available = budget - lines.length;
			if (available <= 0) break;
			if (entry.lines.length > available && lines.length) break;
			const shown = entry.lines.slice(0, available);
			lines.push(...shown);
			this.renderedPickerKeys.push(...shown.map(() => entry.row.key));
		}
		return lines;
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
		return this.presentation.body(
			{ node, tree: selected.tree, lineage, details: this.details, loading: this.loading, error: this.error },
			Math.max(1, width),
		);
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
		this.lastHeight = Math.max(1, this.options.height());
		const x = width >= HORIZONTAL_MARGIN_MIN_WIDTH ? HORIZONTAL_MARGIN : 0;
		const y = this.lastHeight >= VERTICAL_MARGIN_MIN_HEIGHT ? VERTICAL_MARGIN : 0;
		const contentWidth = width - 2 * x;
		const headerRows = this.lastHeight > 2 ? (this.detailScreen && width < 80 && this.lastHeight > 4 ? 2 : 1) : 0;
		const footerRows = this.lastHeight > 1 ? 1 : 0;
		const bodyBudget = this.lastHeight - headerRows - footerRows - 2 * y;
		this.bodyStart = y + headerRows;
		const selected = this.key ? this.rows.get(this.key)?.node : undefined;
		const title = truncateToWidth(
			this.presentation.header(headerRows === 2 ? undefined : this.detailScreen ? selected : undefined),
			contentWidth,
			"",
		);
		const identity = selected
			? truncateToWidth(
					`${this.presentation.colour("accent", plain(selected.agent, 256))} · ${this.presentation.status(selected)} · ${inspectorElapsed(selected)}`,
					contentWidth,
					"",
				)
			: "";
		let body: string[];
		let hint: string;
		if (!this.detailScreen) {
			body = this.treeLines(contentWidth, bodyBudget);
			hint = "↑↓ select · ←→ fold · Enter details · Esc close";
		} else {
			this.renderedPickerKeys = [];
			const content = this.scroll.render(contentWidth);
			this.scroll.updateLayout(content.length, bodyBudget, () => this.redraw());
			// At height one, lineage can wrap the selected agent off the only visible row.
			body =
				this.lastHeight === 1 && selected
					? [identity]
					: content.slice(this.scroll.scrollTop, this.scroll.scrollTop + bodyBudget);
			const range = `Lines ${Math.min(content.length, this.scroll.scrollTop + 1)}–${Math.min(content.length, this.scroll.scrollTop + bodyBudget)}/${content.length}`;
			const controls = contentWidth >= 90 ? "↑↓ scroll · PgUp/PgDn page · Home/End · ←→ agent" : "↑↓ PgUp/PgDn ←→";
			const back = this.direct ? "Esc close" : "Esc back";
			const prefix = truncateToWidth(`${controls} · ${back} · `, Math.max(0, contentWidth - range.length), "");
			hint = `${prefix}${range}`;
		}
		while (body.length < bodyBudget) body.push("");
		const content = [
			...(headerRows ? [title, ...(headerRows === 2 ? [identity] : [])] : []),
			...body,
			...(footerRows ? [this.presentation.colour("muted", truncateToWidth(hint, contentWidth, ""))] : []),
		];
		return [
			...Array<string>(y).fill(""),
			...content.map((line) => `${" ".repeat(x)}${line}`),
			...Array<string>(y).fill(""),
		];
	}

	handleInput(data: string): void {
		if (!this.live()) return;
		if (matchesKey(data, "escape")) {
			if (this.detailScreen && !this.direct) {
				this.detailScreen = false;
				this.redraw();
				return;
			}
			return this.close();
		}
		try {
			if (this.detailScreen) this.navigateDetails(data);
			else this.navigate(data);
			this.redraw();
		} catch {
			this.close();
		}
	}

	private navigateDetails(data: string): void {
		if (matchesKey(data, "up")) this.scroll.scrollBy(-1);
		else if (matchesKey(data, "down")) this.scroll.scrollBy(1);
		else if (matchesKey(data, "pageUp")) this.scroll.scrollBy(-Math.max(1, this.scroll.viewportHeight - 1));
		else if (matchesKey(data, "pageDown")) this.scroll.scrollBy(Math.max(1, this.scroll.viewportHeight - 1));
		else if (matchesKey(data, "home")) this.scroll.scrollTo(0, { disableFollow: true });
		else if (matchesKey(data, "end")) this.scroll.scrollToEnd();
		else if (matchesKey(data, "left") || matchesKey(data, "right")) {
			const index = this.visible.findIndex((row) => row.key === this.key);
			const row = this.visible[index + (matchesKey(data, "left") ? -1 : 1)];
			if (row) this.open(row.key);
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
			if (this.key) this.open(this.key);
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
			if (!this.detailScreen && event.type === "click" && event.button === "left") {
				const key = this.renderedPickerKeys[event.y - this.bodyStart];
				if (!key) return undefined;
				this.open(key);
				this.redraw();
				return { handled: true };
			}
			if (
				this.detailScreen &&
				event.type === "wheel" &&
				event.y >= this.bodyStart &&
				event.y < this.bodyStart + this.scroll.viewportHeight
			) {
				this.scroll.scrollBy(event.wheelDelta ?? 0);
				this.redraw();
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
		if (this.elapsedTimer) clearInterval(this.elapsedTimer);
		this.elapsedTimer = undefined;
		this.stop?.();
		this.selection?.close();
		this.details = undefined;
		this.rows.clear();
		this.visible = [];
		this.renderedPickerKeys = [];
		this.presentation.invalidate();
	}
}
