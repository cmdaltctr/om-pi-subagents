import {
	Container,
	MouseRegion,
	Text,
	truncateToWidth,
	type Component,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import type { ObservedNode, ObservedTree } from "./observation.ts";
import { plain } from "./panel.ts";

function label(node: ObservedNode): string {
	const tools = node.activeTools.map((tool) => plain(tool.name, 128)).join(", ");
	return `${plain(node.agent, 256)} ${node.state} (${node.runId.slice(0, 8)})${tools ? ` · ${tools}` : ""}`;
}

function prefix(node: ObservedNode, nodes: readonly ObservedNode[]): string {
	if (!node.parentRunId || node.runId === nodes[0]?.runId) return "";
	const byId = new Map(nodes.map((entry) => [entry.runId, entry]));
	const last = (entry: ObservedNode) =>
		nodes.findLast((sibling) => sibling.parentRunId === entry.parentRunId)?.runId === entry.runId;
	const ancestors: ObservedNode[] = [];
	let parent = byId.get(node.parentRunId);
	while (parent && parent.runId !== nodes[0].runId) {
		ancestors.unshift(parent);
		parent = parent.parentRunId ? byId.get(parent.parentRunId) : undefined;
	}
	return ancestors.map((ancestor) => (last(ancestor) ? "   " : "|  ")).join("") + (last(node) ? "`- " : "|- ");
}

/** Render retained evidence within terminal columns; hidden rows remain in the observation store. */
export function treeCardLines(
	tree: ObservedTree | undefined,
	expanded: boolean,
	width: number,
	maxVisibleAgents: number,
	expandKey: string,
): string[] {
	if (width < 1) return [];
	const fit = (line: string) => stripVTControlCharacters(truncateToWidth(plain(line, 8192), width, ""));
	if (!tree?.nodes.length) return [fit("OMPSS: observation unavailable")];
	const root = tree.nodes[0];
	if (!expanded) {
		const descendants = tree.nodes.length - 1;
		return [
			fit(
				`${label(root)} · ${descendants} descendants${tree.incomplete ? " · observation incomplete" : ""}${expandKey ? ` · ${expandKey} to expand` : ""}`,
			),
		];
	}
	const shown = tree.nodes.slice(0, maxVisibleAgents);
	// Preserve indentation after sanitising individual fields; plain() would flatten leading spaces.
	const lines = shown.map((node) =>
		stripVTControlCharacters(truncateToWidth(`${prefix(node, tree.nodes)}${label(node)}`, width, "")),
	);
	const hidden = tree.nodes.length - shown.length;
	if (hidden) lines.push(fit(`${hidden} hidden agents · /ompss inspect`));
	if (tree.incomplete) lines.push(fit(`Observation incomplete: ${tree.reasons.join(", ") || "missing evidence"}`));
	lines.push(fit("/ompss inspect · arrows select · Enter details · Escape close"));
	return lines;
}

/** A live host component. Native Pi expansion controls its expanded value. */
export class TreeCard implements Component {
	private readonly content = new Container();

	constructor(
		private readonly tree: () => ObservedTree | undefined,
		private readonly expanded: boolean,
		private readonly visibleAgents: () => number,
		private readonly expandKey: () => string,
		private readonly inspect?: (runId: string) => void,
	) {}

	render(width: number): string[] {
		const current = this.tree();
		const lines = treeCardLines(current, this.expanded, width, this.visibleAgents(), this.expandKey());
		this.content.clear();
		for (const [index, line] of lines.entries()) {
			const node = current?.nodes[index];
			const row = new Text(line, 0, 0);
			if (node && this.inspect && (this.expanded || index === 0) && index < this.visibleAgents()) {
				this.content.addChild(
					new MouseRegion(row, (event) => {
						if (event.type !== "click" || event.button !== "left") return undefined;
						this.inspect?.(node.runId);
						return { handled: true };
					}),
				);
			} else this.content.addChild(row);
		}
		return this.content.render(width);
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		return this.content.handleMouse(event);
	}

	invalidate(): void {
		this.content.invalidate();
	}
}
