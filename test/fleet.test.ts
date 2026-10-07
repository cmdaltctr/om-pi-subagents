import { describe, expect, it } from "vitest";
import { FleetStrip, projectFleet, type FleetRoot } from "../src/fleet.ts";

const root = (overrides: Partial<FleetRoot> & Pick<FleetRoot, "runId">): FleetRoot => ({
	agent: "reader",
	state: "running",
	startedAt: 1,
	endedAt: undefined,
	activeTools: [],
	observedDescendants: 0,
	observationIncomplete: false,
	taskSummary: undefined,
	...overrides,
});

const base = { expanded: false, visibleAgents: 5, terminalRows: 40 };

describe("collapsed projection", () => {
	it("uses exactly one content row regardless of active-run count", () => {
		const roots = [1, 2, 3, 4, 5].map((index) => root({ runId: `run-${index}`, startedAt: index }));
		const projection = projectFleet({ ...base, roots });
		expect(projection.rows).toHaveLength(1);
		expect(projection.rows[0]).toMatchObject({ kind: "summary" });
		expect((projection.rows[0] as { text: string }).text).toMatch(/5 active/);
		expect(projection.collapsed).toBe(true);
	});

	it("counts starting, running and stopping roots as active", () => {
		const roots = [
			root({ runId: "a", state: "starting" }),
			root({ runId: "b", state: "running" }),
			root({ runId: "c", state: "stopping" }),
			root({ runId: "d", state: "completed", endedAt: 9 }),
		];
		const projection = projectFleet({ ...base, roots });
		expect((projection.rows[0] as { text: string }).text).toMatch(/3 active/);
	});

	it("sums observed descendants and marks incomplete evidence", () => {
		const roots = [
			root({ runId: "a", observedDescendants: 2 }),
			root({ runId: "b", observedDescendants: 3, observationIncomplete: true }),
		];
		const complete = projectFleet({ ...base, roots });
		expect((complete.rows[0] as { text: string }).text).toMatch(/5 observed descendants \(incomplete\)/);
	});

	it("distinguishes retained hidden evidence from missing evidence", () => {
		const projection = projectFleet({
			...base,
			roots: [root({ runId: "a", observedDescendants: 4 })],
		});
		expect((projection.rows[0] as { text: string }).text).toMatch(/4 observed descendants/);
		expect((projection.rows[0] as { text: string }).text).not.toMatch(/incomplete/);
	});

	it("shows no row without run evidence", () => {
		expect(projectFleet({ ...base, roots: [] }).rows).toEqual([]);
	});

	it("retains one summary of the latest terminal root after all work ends", () => {
		const roots = [
			root({ runId: "older", state: "completed", startedAt: 1, endedAt: 5 }),
			root({ runId: "latest", agent: "builder", state: "failed", startedAt: 2, endedAt: 8 }),
		];
		const projection = projectFleet({ ...base, roots });
		expect(projection.rows).toHaveLength(1);
		expect((projection.rows[0] as { text: string }).text).toMatch(/builder failed/);
	});
});

describe("root ordering and selection", () => {
	it("orders roots by launch order with run id as tie-breaker", () => {
		const roots = [
			root({ runId: "c", startedAt: 5 }),
			root({ runId: "b", startedAt: 2 }),
			root({ runId: "a", startedAt: 2 }),
		];
		const projection = projectFleet({ ...base, roots, expanded: true });
		expect(projection.rows.filter((row) => row.kind === "root").map((row) => (row as { runId: string }).runId)).toEqual(
			["a", "b", "c"],
		);
	});

	it("keeps selection attached to run identity across changes", () => {
		const roots = [root({ runId: "a" }), root({ runId: "b" }), root({ runId: "c" })];
		const selected = projectFleet({ ...base, roots, expanded: true, selectedRunId: "b" });
		const selectedRow = selected.rows.find(
			(row) => row.kind === "root" && (row as { runId: string }).runId === "b",
		) as { selected: boolean };
		expect(selectedRow.selected).toBe(true);

		const afterChange = projectFleet({
			...base,
			roots: [root({ runId: "a" }), root({ runId: "d" })],
			expanded: true,
			selectedRunId: "b",
		});
		expect(afterChange.selectedRunId).toBe("a");
	});

	it("defaults selection to the first active root", () => {
		const roots = [root({ runId: "a" }), root({ runId: "b" })];
		expect(projectFleet({ ...base, roots, expanded: true }).selectedRunId).toBe("a");
	});
});

describe("expanded bounds and overflow", () => {
	it("uses at most seven content rows with the default budget", () => {
		const roots = [1, 2, 3, 4, 5, 6].map((index) => root({ runId: `run-${index}` }));
		const projection = projectFleet({ ...base, roots, expanded: true });
		expect(projection.rows).toHaveLength(7);
		expect(projection.rows.at(-1)).toMatchObject({ kind: "navigation" });
		expect((projection.rows.at(-1) as { text: string }).text).toMatch(/\+1 more/);
	});

	it("windows roots and scrolls the selection into view", () => {
		const roots = [1, 2, 3, 4, 5, 6, 7].map((index) => root({ runId: `run-${index}`, startedAt: index }));
		const windowed = projectFleet({ ...base, roots, expanded: true, visibleAgents: 3 });
		expect(windowed.rows.filter((row) => row.kind === "root")).toHaveLength(3);
		expect((windowed.rows.at(-1) as { text: string }).text).toMatch(/\+4 more/);

		const scrolled = projectFleet({ ...base, roots, expanded: true, visibleAgents: 3, selectedRunId: "run-6" });
		const shown = scrolled.rows.filter((row) => row.kind === "root").map((row) => (row as { runId: string }).runId);
		expect(shown).toContain("run-6");
		expect(scrolled.additionalRoots).toBe(4);
	});

	it("respects a smaller visible-agent preference", () => {
		const roots = [1, 2, 3, 4].map((index) => root({ runId: `run-${index}` }));
		const projection = projectFleet({ ...base, roots, expanded: true, visibleAgents: 2 });
		expect(projection.rows.filter((row) => row.kind === "root")).toHaveLength(2);
		expect((projection.rows.at(-1) as { text: string }).text).toMatch(/\+2 more/);
	});

	it("stays collapsed when a small terminal cannot fit a selectable row and navigation", () => {
		const roots = [root({ runId: "a" }), root({ runId: "b" })];
		const projection = projectFleet({ ...base, roots, expanded: true, terminalRows: 6 });
		expect(projection.collapsed).toBe(true);
		expect(projection.rows).toHaveLength(1);

		const fitting = projectFleet({ ...base, roots, expanded: true, terminalRows: 12 });
		expect(fitting.collapsed).toBe(false);
		expect(fitting.rows).toHaveLength(4);
	});

	it("shows descendant counts beside a root row", () => {
		const roots = [
			root({ runId: "a", taskSummary: "Map the API", activeTools: ["read"], observedDescendants: 3 }),
			root({ runId: "b", state: "starting", taskSummary: "Review" }),
		];
		const projection = projectFleet({ ...base, roots, expanded: true });
		const first = projection.rows.find((row) => row.kind === "root" && (row as { runId: string }).runId === "a") as {
			text: string;
		};
		expect(first.text).toContain("Map the API");
		expect(first.text).toContain("read");
		expect(first.text).toMatch(/3 descendants/);
	});
});

describe("projection purity", () => {
	it("changes no input state and exposes a frozen view", () => {
		const roots = [root({ runId: "b", startedAt: 2 }), root({ runId: "a", startedAt: 1 })];
		const input = { ...base, roots, expanded: true };
		const projection = projectFleet(input);
		expect(roots.map((item) => item.runId)).toEqual(["b", "a"]);
		expect(Object.isFrozen(projection.rows)).toBe(true);
		expect(Object.isFrozen(projection)).toBe(true);
	});
});

describe("strip rendering", () => {
	const keys = { toggle: "alt+o", inspect: "alt+i" };
	const roots = [1, 2, 3, 4, 5].map((index) =>
		root({ runId: `run-${index}`, startedAt: index, taskSummary: `Task ${index}`, observedDescendants: index }),
	);
	const input = { visibleAgents: 5, terminalRows: 40, roots };

	it("keeps five active roots on exactly one persistent content row", () => {
		const strip = new FleetStrip();
		expect(strip.render(input, keys)).toEqual([
			"Agents: 5 active | 15 observed descendants | alt+o list | alt+i inspect",
		]);
	});

	it("expands within the seven-content-row budget and marks the selection", () => {
		const strip = new FleetStrip();
		strip.toggle();
		const lines = strip.render(input, keys);
		expect(lines).toHaveLength(7);
		expect(lines[1]).toBe("> Task 1 running 1 descendants");
		expect(lines[2]).toBe("  Task 2 running 2 descendants");
		expect(lines.at(-1)).toMatch(/Enter inspect/);
	});

	it("returns no lines without run evidence", () => {
		const strip = new FleetStrip();
		expect(strip.render({ ...input, roots: [] }, keys)).toEqual([]);
	});

	it("keeps expansion session-local and collapses without touching run state", () => {
		const strip = new FleetStrip();
		strip.toggle();
		expect(strip.render(input, keys)).toHaveLength(7);
		strip.toggle();
		expect(strip.render(input, keys)).toHaveLength(1);
	});

	it("restores the previous collapsed summary after expansion", () => {
		const strip = new FleetStrip();
		strip.toggle();
		strip.render(input, keys);
		strip.toggle();
		expect(strip.render(input, keys)[0]).toMatch(/5 active/);
	});
});
