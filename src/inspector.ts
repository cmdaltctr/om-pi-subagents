import {
	SelectList,
	ScrollView,
	matchesKey,
	wrapTextWithAnsi,
	truncateToWidth,
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { DetailSelection, type DetailReader, type RunDetails } from "./details.ts";
import type { ObservationStore, ObservedNode, ObservedTree } from "./observation.ts";
import { plain } from "./panel.ts";
import { isTerminal } from "./runs.ts";

interface Row {
	root: string;
	node: ObservedNode;
	tree: ObservedTree;
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

const listTheme = {
	selectedPrefix: (text: string) => text,
	selectedText: (text: string) => text,
	description: (text: string) => text,
	scrollInfo: (text: string) => text,
	noMatch: (text: string) => text,
};

/** Read-only overlay. List navigation never starts a detail read until Enter or a row click. */
export class Inspector implements Component {
	private rows = new Map<string, Row>();
	private list: SelectList | undefined;
	private key: string | undefined;
	private selection: DetailSelection | undefined;
	private details: RunDetails | undefined;
	private error: string | undefined;
	private loading = false;
	private requested = false;
	private disposed = false;
	private renderedListHeight = 0;
	private lastHeight = 0;
	private readonly stop: () => void;
	private readonly scroll: ScrollView;

	constructor(private readonly options: InspectorOptions) {
		this.scroll = new ScrollView(
			{ render: (width) => this.detailLines(width), invalidate() {} },
			{ scrollbar: "hidden", overscroll: "contain" },
		);
		this.refresh(options.selectedRunId);
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

	private refresh(selectedRunId?: string): void {
		const previous = this.key ? this.rows.get(this.key)?.node.state : undefined;
		this.lastHeight = Math.max(1, this.options.height());
		this.rows = new Map(
			this.options.observations
				.trees(this.options.owner)
				.flatMap((tree) =>
					tree.nodes.map((node) => [`${tree.runId}:${node.runId}`, { root: tree.runId, node, tree }] as const),
				),
		);
		const entries = [...this.rows.entries()];
		const preferred = selectedRunId ? entries.find(([, row]) => row.node.runId === selectedRunId)?.[0] : this.key;
		const index = Math.max(
			0,
			entries.findIndex(([key]) => key === preferred),
		);
		this.list = new SelectList(
			entries.map(([value, row]) => ({
				value,
				label: `${plain(row.node.agent, 256)} ${row.node.state} (${row.node.runId})${row.node.incomplete ? " [observation incomplete]" : ""}${row.node.runId === row.root && row.tree.incomplete ? " [tree observation incomplete]" : ""}`,
			})),
			Math.max(1, Math.floor((this.lastHeight - 2) / 3)),
			listTheme,
		);
		this.list.setSelectedIndex(index);
		this.list.onSelectionChange = (item) => this.choose(item.value);
		this.list.onSelect = (item) => {
			void this.load(item.value);
		};
		this.list.onCancel = () => this.close();
		const current = entries[index]?.[0];
		if (current !== this.key) this.choose(current);
		const state = current ? this.rows.get(current)?.node.state : undefined;
		if (current && state && state !== previous && isTerminal(state) && this.requested && !this.loading)
			void this.load(current);
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
		const list = this.list?.render(width) ?? [];
		this.renderedListHeight = list.length;
		const body = this.scroll.render(width);
		const height = Math.max(0, this.lastHeight - list.length - 2);
		this.scroll.updateLayout(body.length, height, () => this.redraw());
		return [
			truncateToWidth("OMPSS inspector", width, ""),
			...list,
			...body.slice(this.scroll.scrollTop, this.scroll.scrollTop + height),
			truncateToWidth("Arrows select · Enter details · PageUp/PageDown output · Escape close", width, ""),
		].slice(0, this.lastHeight);
	}

	handleInput(data: string): void {
		if (!this.live()) return;
		if (matchesKey(data, "escape")) return this.close();
		if (this.details && (matchesKey(data, "pageUp") || matchesKey(data, "pageDown"))) {
			this.scroll.scrollBy((matchesKey(data, "pageUp") ? -1 : 1) * Math.max(1, this.scroll.viewportHeight - 1));
			return;
		}
		try {
			this.list?.handleInput(data);
			this.redraw();
		} catch {
			this.close();
		}
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (!this.live()) return undefined;
		try {
			return this.mouse(event);
		} catch {
			this.close();
			return { handled: true };
		}
	}

	private mouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		if (event.y >= 1 && event.y <= this.renderedListHeight)
			return this.list?.handleMouse({ ...event, y: event.y - 1, height: this.renderedListHeight });
		if (event.type === "wheel" && event.y > this.renderedListHeight) {
			this.scroll.scrollBy(event.wheelDelta ?? 0);
			return { handled: true };
		}
		return undefined;
	}

	invalidate(): void {
		this.list?.invalidate();
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
	}
}
