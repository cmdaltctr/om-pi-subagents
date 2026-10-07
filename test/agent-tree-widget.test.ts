import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import {
	describeActivity,
	ERROR_LINGER_TURNS,
	formatMs,
	MIN_SUCCESS_LINGER_MS,
	renderAgentTree,
	renderFinishedLine,
	SPINNER,
	TreeLinger,
	type TreeAgent,
} from "../src/agent-tree-widget.ts";

const NOW = 100_000;
const theme = { fg: (_colour: string, text: string) => text, bold: (text: string) => text };

function agent(id: string, patch: Partial<TreeAgent> = {}): TreeAgent {
	return {
		id,
		name: `agent-${id}`,
		description: `Task ${id}`,
		status: "running",
		toolUses: 0,
		startedAt: NOW - 1700,
		activeTools: [],
		...patch,
	};
}

const render = (agents: TreeAgent[], width = 120, frame = 0) =>
	renderAgentTree(agents, { width, frame, now: NOW, theme });

describe("tree rendering adapted from tintin", () => {
	it("draws four running agents as tintin's two-line tree", () => {
		const lines = render([
			agent("a", { toolUses: 3, activeTools: ["read"] }),
			agent("b"),
			agent("c", { toolUses: 1 }),
			agent("d"),
		]);
		expect(lines).toEqual([
			"● Agents",
			`├─ ${SPINNER[0]} agent-a  Task a · 3 tool uses · 1.7s`,
			"│    ⎿  reading…",
			`├─ ${SPINNER[0]} agent-b  Task b · 1.7s`,
			"│    ⎿  thinking…",
			`├─ ${SPINNER[0]} agent-c  Task c · 1 tool use · 1.7s`,
			"│    ⎿  thinking…",
			`└─ ${SPINNER[0]} agent-d  Task d · 1.7s`,
			"     ⎿  thinking…",
		]);
	});

	it("advances the spinner frame", () => {
		expect(render([agent("a")], 120, 3)[1]).toContain(SPINNER[3]);
	});

	it("describes activity in tintin's wording", () => {
		expect(describeActivity(["read"])).toBe("reading…");
		expect(describeActivity(["read", "read"])).toBe("reading 2 files…");
		expect(describeActivity(["grep", "grep", "grep"])).toBe("searching 3 patterns…");
		expect(describeActivity(["bash", "read"])).toBe("running command, reading…");
		expect(describeActivity(["mcp__x__y"])).toBe("mcp__x__y…");
		expect(describeActivity([], `\n  ${"x".repeat(70)}\nsecond`)).toBe(`${"x".repeat(60)}…`);
		expect(describeActivity([], "   ")).toBe("thinking…");
		expect(describeActivity([])).toBe("thinking…");
	});

	it("draws finished lines with tintin's icons", () => {
		const ended = { startedAt: NOW - 3100, completedAt: NOW };
		expect(renderFinishedLine(agent("a", { ...ended, status: "completed", toolUses: 2 }), theme)).toBe(
			"✓ agent-a  Task a · 2 tool uses · 3.1s",
		);
		expect(renderFinishedLine(agent("b", { ...ended, status: "error", error: "e".repeat(80) }), theme)).toBe(
			`✗ agent-b  Task b · 3.1s error: ${"e".repeat(60)}`,
		);
		expect(renderFinishedLine(agent("c", { ...ended, status: "stopped" }), theme)).toBe(
			"■ agent-c  Task c · 3.1s stopped",
		);
		expect(formatMs(1234)).toBe("1.2s");
	});

	it("omits the task gap before a run reports its summary", () => {
		expect(render([agent("a", { description: "" })])[1]).toBe(`└─ ${SPINNER[0]} agent-a · 1.7s`);
		const ended = { startedAt: NOW - 1000, completedAt: NOW, status: "completed" as const, description: "" };
		expect(renderFinishedLine(agent("a", ended), theme)).toBe("✓ agent-a · 1.0s");
	});

	it("uses the dim heading once no agent runs", () => {
		const lines = render([agent("a", { status: "completed", startedAt: NOW - 1000, completedAt: NOW })]);
		expect(lines).toEqual(["○ Agents", "└─ ✓ agent-a  Task a · 1.0s"]);
		expect(render([])).toEqual([]);
	});

	it("caps content at 12 lines, running first, then finished, then a more line", () => {
		const running = ["a", "b", "c", "d", "e", "f"].map((id) => agent(id));
		const finished = ["g", "h"].map((id) => agent(id, { status: "completed", completedAt: NOW }));
		const lines = render([...finished, ...running]);
		expect(lines).toHaveLength(12);
		expect(lines[0]).toBe("● Agents");
		expect(lines.slice(1, 11).filter((line) => line.includes(SPINNER[0]))).toHaveLength(5);
		expect(lines.at(-1)).toBe("└─ +3 more (1 running, 2 finished)");
	});

	it("fits every line to a narrow width", () => {
		const lines = render([agent("a", { description: "d".repeat(200) }), agent("b")], 40);
		for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(40);
	});
});

describe("tree linger", () => {
	it("keeps a completed run for one turn and at least the time floor", () => {
		const linger = new TreeLinger();
		linger.markFinished("a", NOW);
		expect(linger.shouldShow("a", "completed", NOW)).toBe(true);
		linger.onTurnStart();
		// The result message starts a turn at once; the floor keeps the tick visible.
		expect(linger.shouldShow("a", "completed", NOW + 1000)).toBe(true);
		expect(linger.shouldShow("a", "completed", NOW + MIN_SUCCESS_LINGER_MS)).toBe(false);
	});

	it("keeps a completed run past the floor until a turn starts", () => {
		const linger = new TreeLinger();
		linger.markFinished("a", NOW);
		expect(linger.shouldShow("a", "completed", NOW + 60_000)).toBe(true);
		linger.onTurnStart();
		expect(linger.shouldShow("a", "completed", NOW + 60_000)).toBe(false);
	});

	it("keeps failed and cancelled runs for two turns with no time floor", () => {
		expect(ERROR_LINGER_TURNS).toBe(2);
		for (const status of ["error", "stopped"] as const) {
			const linger = new TreeLinger();
			linger.markFinished("a", NOW);
			linger.onTurnStart();
			expect(linger.shouldShow("a", status, NOW)).toBe(true);
			linger.onTurnStart();
			expect(linger.shouldShow("a", status, NOW)).toBe(false);
		}
	});

	it("resets the age when a run starts again and ignores repeated finish marks", () => {
		const linger = new TreeLinger();
		linger.markFinished("a", NOW);
		linger.onTurnStart();
		linger.markFinished("a", NOW + 10_000);
		expect(linger.shouldShow("a", "completed", NOW + 10_000)).toBe(false);
		linger.markRunning("a");
		linger.markFinished("a", NOW + 20_000);
		expect(linger.shouldShow("a", "completed", NOW + 20_000)).toBe(true);
	});
});
