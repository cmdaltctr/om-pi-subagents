import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import type { ObservedNode, ObservedTree } from "../src/observation.ts";
import { treeCardLines, TreeCard } from "../src/tree-card.ts";

const node = (id: string, parentRunId?: string, depth = 1, patch: Partial<ObservedNode> = {}): ObservedNode => ({
	owner: "session",
	rootSessionId: "session",
	runId: id,
	parentRunId,
	depth,
	agent: "same-agent",
	state: "running",
	startedAt: 1,
	revision: 1,
	activeTools: [],
	incomplete: false,
	reasons: [],
	...patch,
});
const tree = (
	nodes: ObservedNode[] = [
		node("root-12345678"),
		node("child-12345678", "root-12345678", 2),
		node("grandchild-12345678", "child-12345678", 3),
	],
): ObservedTree => ({
	owner: "session",
	rootSessionId: "session",
	runId: nodes[0].runId,
	nodes,
	pending: 0,
	incomplete: false,
	reasons: [],
});

describe("tree cards", () => {
	it("renders nested ancestry with ASCII branches and separate run identities", () => {
		const lines = treeCardLines(tree(), true, 100, 4, "ctrl+o");
		expect(lines[0]).toContain("root-123");
		expect(lines[1]).toMatch(/^`- same-agent running \(child-12/);
		expect(lines[2]).toMatch(/^   `- same-agent running \(grandchi/);
		expect(lines.join("\n")).not.toContain("undefined");
	});
	it("keeps collapsed cards compact and shows configured expansion hints", () => {
		const lines = treeCardLines(tree(), false, 100, 4, "ctrl+y");
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("2 descendants");
		expect(lines[0]).toContain("ctrl+y");
		expect(lines[0]).not.toContain("ctrl+o");
	});
	it("keeps separate parallel roots and terminal snapshots", () => {
		const completed = tree([node("completed-123", undefined, 1, { state: "completed" })]);
		expect(treeCardLines(completed, true, 100, 4, "ctrl+o")[0]).toContain("completed");
		expect(treeCardLines(tree(), true, 100, 4, "ctrl+o").join("\n")).not.toContain("completed-123");
	});
	it.each([1, 2, 3])("counts root rows in a visible-agent bound of %i", (bound) => {
		const lines = treeCardLines(tree(), true, 100, bound, "ctrl+o");
		if (bound < 3) {
			expect(lines.join("\n")).toContain(`${3 - bound} hidden agents`);
			expect(lines.join("\n")).toContain("/ompss inspect");
		} else expect(lines.join("\n")).not.toContain("hidden agents");
		expect(lines.filter((line) => /same-agent/.test(line))).toHaveLength(bound);
	});
	it("distinguishes incomplete evidence from retained hidden rows", () => {
		const incomplete = { ...tree(), incomplete: true, reasons: ["nodes-omitted" as const] };
		const lines = treeCardLines(incomplete, true, 100, 1, "ctrl+o");
		expect(lines.join("\n")).toContain("2 hidden agents");
		expect(lines.join("\n")).toContain("Observation incomplete");
	});
	it("labels absent observations without inventing a run state", () => {
		const lines = treeCardLines(undefined, true, 100, 4, "ctrl+o");
		expect(lines.join("\n")).toMatch(/unavailable/i);
		expect(lines.join("\n")).not.toMatch(/completed|running/);
	});
	it.each([0, 1, 8, 20, 80])("fits terminal column width %i and removes unsafe text", (width) => {
		const unsafe = tree([
			node("root-12345678", undefined, 1, {
				agent: "\x1b[2J危険🙂\u202e\x07",
				activeTools: [{ id: "tool-1", name: "\x1b[31mread\x1b[0m\u2066" }],
			}),
		]);
		const lines = treeCardLines(unsafe, true, width, 4, "ctrl+o");
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
		}
	});
	it("repaints from live cached preferences without discarding nodes", () => {
		let visible = 1;
		const retained = tree();
		const card = new TreeCard(
			() => retained,
			true,
			() => visible,
			() => "ctrl+o",
		);
		expect(card.render(100).join("\n")).toContain("2 hidden agents");
		visible = 3;
		expect(card.render(100).join("\n")).toContain("grandchi");
		expect(retained.nodes).toHaveLength(3);
	});
	it("consumes row clicks before the enclosing card and leaves hint clicks unused", () => {
		const selected: string[] = [];
		const card = new TreeCard(
			() => tree(),
			true,
			() => 4,
			() => "ctrl+o",
			(id) => {
				selected.push(id);
			},
		);
		card.render(100);
		const event = {
			type: "click" as const,
			button: "left" as const,
			x: 2,
			y: 1,
			width: 100,
			height: 4,
			screenX: 2,
			screenY: 1,
			shift: false,
			alt: false,
			ctrl: false,
		};
		expect(card.handleMouse(event)?.handled).toBe(true);
		expect(selected).toEqual(["child-12345678"]);
		expect(card.handleMouse({ ...event, y: 2 })?.handled).toBe(true);
		expect(selected).toEqual(["child-12345678", "grandchild-12345678"]);
		expect(card.handleMouse({ ...event, y: 3 })).toBeUndefined();
	});
});
