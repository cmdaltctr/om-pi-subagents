import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetView } from "../src/config.ts";
import { FleetStrip } from "../src/fleet.ts";
import { FleetWidget, type TerminalFacts, type WidgetComponent } from "../src/fleet-widget.ts";
import type { Messenger } from "../src/notify.ts";
import type { ObservedNode, ObservedTree } from "../src/observation.ts";
import type { RunView } from "../src/runs.ts";

const run = (id: string, state: RunView["state"], startedAt = 1): RunView => ({
	id,
	owner: "session",
	agent: `agent-${id}`,
	cwd: "/work",
	state,
	startedAt,
	...(state === "completed" ? { endedAt: startedAt + 100 } : {}),
});

const node = (id: string, parentRunId?: string, depth = 1): ObservedNode => ({
	owner: "session",
	rootSessionId: "session",
	runId: id,
	parentRunId,
	depth,
	agent: "agent",
	state: "running",
	startedAt: 1,
	revision: 1,
	activeTools: [],
	incomplete: false,
	reasons: [],
});

const tree = (nodes: ObservedNode[], incomplete = false): ObservedTree => ({
	owner: "session",
	rootSessionId: "session",
	runId: nodes[0].runId,
	nodes,
	pending: 0,
	incomplete,
	reasons: incomplete ? ["nodes-omitted" as const] : [],
});

function setup(options: { mode?: "tui" | "rpc"; trees?: ObservedTree[]; view?: FleetView } = {}) {
	const runs: RunView[] = [];
	const trees = options.trees ?? [];
	const setWidget = vi.fn();
	const messengerFor = vi.fn((owner: string): Messenger | undefined =>
		owner === "session" ? { send: vi.fn(), setStatus: vi.fn(), setWidget } : undefined,
	);
	const requestRender = vi.fn();
	const widget = new FleetWidget({
		messenger: messengerFor,
		runs: (owner) => runs.filter((entry) => entry.owner === owner),
		trees: (owner) => trees.filter((entry) => entry.owner === owner),
		visibleAgents: () => 5,
		keys: () => ({ toggle: "alt+o", inspect: "alt+i" }),
		strip: new FleetStrip(() => options.view ?? "collapsed"),
		mode: () => options.mode ?? "tui",
		now: () => 61_000,
	});
	const terminal: TerminalFacts = { rows: 40, requestRender };
	const linesOf = (content: unknown): string[] => {
		const factory = content as (facts: TerminalFacts) => WidgetComponent;
		return factory(terminal).render(100);
	};
	return { widget, runs, trees, setWidget, requestRender, messengerFor, linesOf, terminal };
}

describe("fleet widget", () => {
	it("attaches one below-editor strip that renders live terminal facts", () => {
		const h = setup();
		h.runs.push(run("run-1", "running"));
		h.widget.attach("session");
		expect(h.setWidget).toHaveBeenCalledTimes(1);
		const [content, placement] = h.setWidget.mock.calls[0];
		expect(placement).toBe("belowEditor");
		const component = (content as (facts: TerminalFacts) => WidgetComponent)(h.terminal);
		expect(component.render(100)).toEqual(["Agents: 1 active | 0 observed descendants | alt+o list | alt+i inspect"]);
		// A narrower terminal re-renders within the same attached component.
		const narrow = component.render(30);
		expect(narrow).toHaveLength(1);
		expect(narrow[0].length).toBeLessThanOrEqual(30);
		h.widget.attach("session");
		expect(h.setWidget).toHaveBeenCalledTimes(1);
	});

	it("repaints the attached strip through the terminal after run changes", () => {
		const h = setup();
		h.runs.push(run("run-1", "starting"));
		h.widget.attach("session");
		// The host invokes the factory once when it registers the component.
		expect(h.linesOf(h.setWidget.mock.calls[0][0])[0]).toContain("1 active");
		h.widget.onChange(run("run-1", "running"));
		expect(h.requestRender).toHaveBeenCalledTimes(1);
		h.runs.push(run("run-2", "running"));
		h.widget.onChange(run("run-2", "running"));
		expect(h.requestRender).toHaveBeenCalledTimes(2);
	});

	it("maps manager snapshots and retained observation evidence into root rows", () => {
		const h = setup({
			trees: [
				tree([
					{ ...node("run-1"), taskSummary: "Map the API", activeTools: [{ id: "call-1", name: "read" }] },
					node("child-1", "run-1", 2),
					node("grandchild-1", "child-1", 3),
				]),
			],
		});
		h.runs.push(run("run-1", "running"));
		h.widget.attach("session");
		h.widget.toggle();
		const lines = h.linesOf(h.setWidget.mock.calls[0][0]);
		expect(lines[1]).toContain("Map the API");
		expect(lines[1]).toContain("running");
		expect(lines[1]).toContain("read");
		expect(lines[1]).toContain("2 descendants");
		expect(lines[0]).toEqual("Agents: 1 active | 2 observed descendants");
	});

	it("renders no widget lines without run evidence", () => {
		const h = setup();
		h.widget.attach("session");
		expect(h.linesOf(h.setWidget.mock.calls[0][0])).toEqual([]);
	});

	it("keeps the idle summary of the latest terminal root after all work ends", () => {
		const h = setup();
		h.runs.push(run("run-1", "running", 1), run("run-2", "completed", 2));
		h.widget.attach("session");
		h.runs.shift();
		h.widget.onChange(run("run-1", "completed"));
		const lines = h.linesOf(h.setWidget.mock.calls[0][0]);
		expect(lines).toEqual(["Agents: idle | last agent-run-2 completed | alt+o list | alt+i inspect"]);
	});

	it("marks incomplete observation evidence without hiding the count", () => {
		const h = setup({ trees: [tree([node("run-1"), node("child-1", "run-1", 2)], true)] });
		h.runs.push(run("run-1", "running"));
		h.widget.attach("session");
		const lines = h.linesOf(h.setWidget.mock.calls[0][0]);
		expect(lines[0]).toContain("1 observed descendants (incomplete)");
	});

	it("omits key hints for disabled shortcuts but keeps the counts", () => {
		const h = setup();
		h.runs.push(run("run-1", "running"));
		const setWidget = h.setWidget;
		const messengerFor = h.messengerFor;
		const widget = new FleetWidget({
			messenger: messengerFor,
			runs: (owner) => h.runs.filter((entry) => entry.owner === owner),
			trees: () => [],
			visibleAgents: () => 5,
			keys: () => ({ toggle: "", inspect: "" }),
			strip: new FleetStrip(() => "collapsed"),
			mode: () => "tui",
			now: () => 61_000,
		});
		widget.attach("session");
		const lines = (setWidget.mock.calls[0][0] as (facts: TerminalFacts) => WidgetComponent)(h.terminal).render(100);
		expect(lines).toEqual(["Agents: 1 active | 0 observed descendants"]);
	});

	it("sends plain lines to hosts without component support", () => {
		const h = setup({ mode: "rpc" });
		h.runs.push(run("run-1", "running"));
		h.widget.attach("session");
		expect(h.setWidget).toHaveBeenCalledExactlyOnceWith(
			["Agents: 1 active | 0 observed descendants | alt+o list | alt+i inspect"],
			"belowEditor",
		);
		h.runs[0] = run("run-1", "completed");
		h.widget.onChange(run("run-1", "completed"));
		const [lines, placement] = h.setWidget.mock.lastCall as [string[], string];
		expect(lines).toEqual(["Agents: idle | last agent-run-1 completed | alt+o list | alt+i inspect"]);
		expect(placement).toBe("belowEditor");
	});

	it("ignores owners without a live messenger", () => {
		const h = setup();
		h.widget.attach("other-session");
		expect(h.setWidget).not.toHaveBeenCalled();
		h.widget.onChange(run("run-1", "running"));
		expect(h.requestRender).not.toHaveBeenCalled();
	});

	describe("linger after the last run", () => {
		beforeEach(() => vi.useFakeTimers());
		afterEach(() => vi.useRealTimers());

		const finish = (h: ReturnType<typeof setup>, id: string) => {
			h.runs.splice(0, h.runs.length, ...h.runs.map((entry) => (entry.id === id ? run(id, "completed") : entry)));
			h.widget.onChange(run(id, "completed"));
		};

		it("shows the expanded tree by default and clears 10 seconds after the last run ends", () => {
			const h = setup({ view: "expanded" });
			h.runs.push(run("run-1", "running"));
			h.widget.attach("session");
			expect(h.linesOf(h.setWidget.mock.calls[0][0]).length).toBeGreaterThan(1);
			finish(h, "run-1");
			expect(h.linesOf(h.setWidget.mock.calls[0][0])).toEqual([
				"Agents: idle | last agent-run-1 completed | alt+o list | alt+i inspect",
			]);
			vi.advanceTimersByTime(9_999);
			expect(h.linesOf(h.setWidget.mock.calls[0][0])).toHaveLength(1);
			const renders = h.requestRender.mock.calls.length;
			vi.advanceTimersByTime(1);
			expect(h.linesOf(h.setWidget.mock.calls[0][0])).toEqual([]);
			expect(h.requestRender.mock.calls.length).toBe(renders + 1);
		});

		it("cancels the clear when a run starts inside the linger", () => {
			const h = setup();
			h.runs.push(run("run-1", "running"));
			h.widget.attach("session");
			finish(h, "run-1");
			vi.advanceTimersByTime(5_000);
			h.runs.push(run("run-2", "running", 2));
			h.widget.onChange(run("run-2", "running", 2));
			vi.advanceTimersByTime(10_000);
			expect(h.linesOf(h.setWidget.mock.calls[0][0])[0]).toContain("1 active");
		});

		it("shows a later run after the widget has cleared", () => {
			const h = setup();
			h.runs.push(run("run-1", "running"));
			h.widget.attach("session");
			finish(h, "run-1");
			vi.advanceTimersByTime(10_000);
			h.runs.push(run("run-2", "starting", 2));
			h.widget.onChange(run("run-2", "starting", 2));
			expect(h.linesOf(h.setWidget.mock.calls[0][0])[0]).toContain("1 active");
		});

		it("cancels the timer when the session clears the strip", () => {
			const h = setup();
			h.runs.push(run("run-1", "running"));
			h.widget.attach("session");
			finish(h, "run-1");
			h.widget.clear("session");
			expect(vi.getTimerCount()).toBe(0);
			const renders = h.requestRender.mock.calls.length;
			vi.advanceTimersByTime(10_000);
			expect(h.requestRender.mock.calls.length).toBe(renders);
		});

		it("keeps retained runs for inspection after the widget clears", () => {
			const h = setup();
			h.runs.push(run("run-1", "running"));
			h.widget.attach("session");
			finish(h, "run-1");
			vi.advanceTimersByTime(10_000);
			expect(h.runs.map((entry) => entry.id)).toEqual(["run-1"]);
			expect(h.widget.renderLines("session", 100, 40)).toEqual([]);
		});
	});

	it("clears the strip on demand", () => {
		const h = setup();
		h.runs.push(run("run-1", "running"));
		h.widget.attach("session");
		h.widget.clear("session");
		expect(h.setWidget).toHaveBeenLastCalledWith(undefined, "belowEditor");
		h.widget.onChange(run("run-1", "running"));
		expect(h.setWidget).toHaveBeenCalledTimes(2);
	});
});
