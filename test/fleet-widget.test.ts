import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MIN_SUCCESS_LINGER_MS, SPINNER, SPINNER_MS } from "../src/agent-tree-widget.ts";
import type { FleetView } from "../src/config.ts";
import { FleetStrip, LIST_LINGER_MS } from "../src/fleet.ts";
import { FleetWidget, LIST_KEY, TREE_KEY, type TerminalFacts, type WidgetComponent } from "../src/fleet-widget.ts";
import type { Messenger } from "../src/notify.ts";
import type { ObservedNode, ObservedTree } from "../src/observation.ts";
import type { RunView } from "../src/runs.ts";

const START = 100_000;

const run = (id: string, state: RunView["state"], startedAt = START, endedAt?: number): RunView => ({
	id,
	owner: "session",
	agent: `agent-${id}`,
	cwd: "/work",
	state,
	startedAt,
	...(endedAt !== undefined ? { endedAt } : {}),
});

const node = (id: string, patch: Partial<ObservedNode> = {}): ObservedNode => ({
	owner: "session",
	rootSessionId: "session",
	runId: id,
	depth: 1,
	agent: "agent",
	state: "running",
	startedAt: START,
	revision: 1,
	activeTools: [],
	incomplete: false,
	reasons: [],
	...patch,
});

const tree = (nodes: ObservedNode[]): ObservedTree => ({
	owner: "session",
	rootSessionId: "session",
	runId: nodes[0].runId,
	nodes,
	pending: 0,
	incomplete: false,
	reasons: [],
});

function setup(options: { mode?: "tui" | "rpc"; trees?: ObservedTree[]; view?: FleetView; uses?: number } = {}) {
	const runs: RunView[] = [];
	const trees = options.trees ?? [];
	const setWidget = vi.fn();
	const messengerFor = vi.fn((owner: string): Messenger | undefined =>
		owner === "session" ? { send: vi.fn(), setStatus: vi.fn(), setWidget } : undefined,
	);
	const requestRender = vi.fn();
	const strip = new FleetStrip(() => options.view ?? "expanded");
	const widget = new FleetWidget({
		messenger: messengerFor,
		runs: (owner) => runs.filter((entry) => entry.owner === owner),
		trees: (owner) => trees.filter((entry) => entry.owner === owner),
		toolUses: () => options.uses ?? 0,
		visibleAgents: () => 5,
		strip,
		mode: () => options.mode ?? "tui",
		now: () => Date.now(),
	});
	const terminal: TerminalFacts = { rows: 40, requestRender };
	const registered = (key: string) => {
		const call = setWidget.mock.calls.find((entry) => entry[2] === key);
		return call as [unknown, string, string] | undefined;
	};
	const lines = (key: string, width = 100): string[] => {
		const call = registered(key);
		if (!call) return [];
		return (call[0] as (facts: TerminalFacts) => WidgetComponent)(terminal).render(width);
	};
	const update = (entry: RunView) => {
		const index = runs.findIndex((item) => item.id === entry.id);
		if (index === -1) runs.push(entry);
		else runs[index] = entry;
		widget.onChange(entry);
	};
	return { widget, runs, strip, setWidget, requestRender, messengerFor, registered, lines, update };
}

describe("fleet widgets", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(START + 1700);
	});
	afterEach(() => vi.useRealTimers());

	it("registers the tree above the editor and the list below it, once", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		h.widget.attach("session");
		expect(h.setWidget).toHaveBeenCalledTimes(2);
		expect(h.registered(TREE_KEY)?.[1]).toBe("aboveEditor");
		expect(h.registered(LIST_KEY)?.[1]).toBe("belowEditor");
		expect(TREE_KEY).toBe("omps-agents");
		expect(LIST_KEY).toBe("omps");
	});

	it("draws tintin's tree from manager state, observation evidence and tool uses", () => {
		const h = setup({
			uses: 3,
			trees: [tree([node("a", { taskSummary: "Map the API", activeTools: [{ id: "c1", name: "grep" }] })])],
		});
		h.update(run("a", "running"));
		h.widget.attach("session");
		expect(h.lines(TREE_KEY)).toEqual([
			"● Agents",
			`└─ ${SPINNER[0]} agent-a  Map the API · 3 tool uses · 1.7s`,
			"     ⎿  searching…",
		]);
		expect(h.lines(LIST_KEY)[0]).toBe("  ↓ to manage");
		expect(h.lines(LIST_KEY)[1]).toContain("○ agent-a  Map the API");
	});

	it("falls back to the assistant preview, then thinking", () => {
		const h = setup({ trees: [tree([node("a", { assistantPreview: "Drafting the plan" })])] });
		h.update(run("a", "running"));
		h.update(run("b", "running"));
		h.widget.attach("session");
		const lines = h.lines(TREE_KEY);
		expect(lines[2]).toContain("⎿  Drafting the plan");
		expect(lines[4]).toContain("⎿  thinking…");
	});

	it("collapses to the tree heading with a running count and no list", () => {
		const h = setup({ view: "collapsed" });
		h.update(run("a", "running"));
		h.update(run("b", "running"));
		h.widget.attach("session");
		expect(h.lines(TREE_KEY)).toEqual(["● Agents · 2 running"]);
		expect(h.lines(LIST_KEY)).toEqual([]);
	});

	it("shows neither widget when the view is off", () => {
		const h = setup({ view: "off" });
		h.update(run("a", "running"));
		h.widget.attach("session");
		expect(h.lines(TREE_KEY)).toEqual([]);
		expect(h.lines(LIST_KEY)).toEqual([]);
	});

	it("advances the spinner every 80 ms only while a run is active", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		// The host builds the component when it registers the widget.
		h.lines(TREE_KEY);
		const before = h.requestRender.mock.calls.length;
		vi.advanceTimersByTime(SPINNER_MS * 3);
		expect(h.requestRender.mock.calls.length).toBe(before + 3);
		expect(h.lines(TREE_KEY)[1]).toContain(SPINNER[3]);
		h.update(run("a", "completed", START, Date.now()));
		const after = h.requestRender.mock.calls.length;
		vi.advanceTimersByTime(SPINNER_MS * 10);
		expect(h.requestRender.mock.calls.length).toBe(after);
	});

	it("keeps a completed run through a fast turn until the time floor ends", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		h.update(run("a", "completed", START, Date.now()));
		expect(h.lines(TREE_KEY)).toEqual(["○ Agents", "└─ ✓ agent-a · 1.7s"]);
		// The result message starts the parent's next turn at once.
		h.widget.onTurnStart("session");
		vi.advanceTimersByTime(MIN_SUCCESS_LINGER_MS - 1);
		expect(h.lines(TREE_KEY)).toHaveLength(2);
		const renders = h.requestRender.mock.calls.length;
		vi.advanceTimersByTime(1);
		// One repaint removes the line; no spinner timer keeps running.
		expect(h.requestRender.mock.calls.length).toBe(renders + 1);
		expect(h.lines(TREE_KEY)).toEqual([]);
	});

	it("keeps a failed run for two parent turns", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		h.update({ ...run("a", "failed", START, Date.now()), error: "provider error: quota" });
		expect(h.lines(TREE_KEY)[1]).toBe("└─ ✗ agent-a · 1.7s error: provider error: quota");
		h.widget.onTurnStart("session");
		vi.advanceTimersByTime(60_000);
		expect(h.lines(TREE_KEY)).toHaveLength(2);
		h.widget.onTurnStart("session");
		expect(h.lines(TREE_KEY)).toEqual([]);
	});

	it("drops a finished run from the list after 4000 ms with one repaint", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		h.update(run("a", "completed", START, Date.now()));
		expect(h.lines(LIST_KEY)).toHaveLength(2);
		vi.advanceTimersByTime(LIST_LINGER_MS);
		expect(h.lines(LIST_KEY)).toEqual([]);
	});

	it("shows a restarted run's new outcome", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		h.update(run("a", "completed", START, Date.now()));
		h.widget.onTurnStart("session");
		vi.advanceTimersByTime(MIN_SUCCESS_LINGER_MS);
		h.update(run("a", "running", Date.now()));
		h.update(run("a", "completed", Date.now() - 500, Date.now()));
		expect(h.lines(TREE_KEY)[1]).toContain("✓ agent-a");
	});

	it("navigates exactly the rows the list shows, including lingering finished runs", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.update(run("b", "completed", START, Date.now()));
		h.widget.attach("session");
		expect(h.widget.listedRunIds("session")).toEqual(["a", "b"]);
		vi.advanceTimersByTime(LIST_LINGER_MS);
		expect(h.widget.listedRunIds("session")).toEqual(["a"]);
		h.strip.toggle();
		expect(h.widget.listedRunIds("session")).toEqual([]);
	});

	it("renders nothing without run evidence", () => {
		const h = setup();
		h.widget.attach("session");
		expect(h.lines(TREE_KEY)).toEqual([]);
		expect(h.lines(LIST_KEY)).toEqual([]);
	});

	it("sends plain lines under both keys to hosts without component support", () => {
		const h = setup({ mode: "rpc" });
		h.update(run("a", "running"));
		h.widget.attach("session");
		const treeCall = h.setWidget.mock.calls.findLast((call) => call[2] === TREE_KEY)!;
		expect(treeCall[0]).toEqual(["● Agents", "└─ ⠋ agent-a · 1.7s", "     ⎿  thinking…"]);
		expect(treeCall[1]).toBe("aboveEditor");
		const list = h.setWidget.mock.calls.findLast((call) => call[2] === LIST_KEY)!;
		expect(list[1]).toBe("belowEditor");
		// Line hosts get no animation timer.
		const calls = h.setWidget.mock.calls.length;
		vi.advanceTimersByTime(SPINNER_MS * 5);
		expect(h.setWidget.mock.calls.length).toBe(calls);
	});

	it("ignores owners without a live messenger", () => {
		const h = setup();
		h.widget.attach("other-session");
		expect(h.setWidget).not.toHaveBeenCalled();
		h.widget.onChange(run("a", "running"));
		expect(h.requestRender).not.toHaveBeenCalled();
	});

	it("clears both widgets and stops every timer on demand", () => {
		const h = setup();
		h.update(run("a", "running"));
		h.widget.attach("session");
		h.widget.clear("session");
		expect(h.setWidget).toHaveBeenCalledWith(undefined, "aboveEditor", TREE_KEY);
		expect(h.setWidget).toHaveBeenCalledWith(undefined, "belowEditor", LIST_KEY);
		const renders = h.requestRender.mock.calls.length;
		vi.advanceTimersByTime(10_000);
		expect(h.requestRender.mock.calls.length).toBe(renders);
		expect(vi.getTimerCount()).toBe(0);
	});
});
