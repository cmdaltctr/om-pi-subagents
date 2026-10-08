import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { FleetStrip, LIST_LINGER_MS, projectFleet, type FleetRoot } from "../src/fleet.ts";

const NOW = 50_000;

const root = (overrides: Partial<FleetRoot> & Pick<FleetRoot, "runId">): FleetRoot => ({
	agent: "reader",
	state: "running",
	startedAt: NOW - 4000,
	endedAt: undefined,
	activeTools: [],
	observedDescendants: 0,
	observationIncomplete: false,
	taskSummary: undefined,
	toolUses: 0,
	...overrides,
});

const base = { visibleAgents: 5, now: NOW };

describe("list membership", () => {
	it("lists starting, running and stopping roots in launch order with run id as tie-breaker", () => {
		const roots = [
			root({ runId: "b", startedAt: 2 }),
			root({ runId: "a", startedAt: 2, state: "starting" }),
			root({ runId: "c", startedAt: 1, state: "stopping" }),
		];
		expect(projectFleet({ ...base, roots }).runIds).toEqual(["c", "a", "b"]);
	});

	it("keeps a finished root for 4000 ms after it ends, as tintin's list does", () => {
		expect(LIST_LINGER_MS).toBe(4000);
		const done = root({ runId: "done", state: "completed", endedAt: NOW - 3999 });
		const old = root({ runId: "old", state: "failed", endedAt: NOW - 4000 });
		expect(projectFleet({ ...base, roots: [done, old] }).runIds).toEqual(["done"]);
		expect(projectFleet({ ...base, now: NOW + 1, roots: [done] }).runIds).toEqual([]);
	});

	it("shows no row without listed runs", () => {
		expect(projectFleet({ ...base, roots: [] }).rows).toEqual([]);
	});
});

describe("tintin list rows", () => {
	const roots = [1, 2, 3, 4, 5, 6, 7].map((index) =>
		root({
			runId: `run-${index}`,
			startedAt: NOW - 4000 + index,
			agent: `agent-${index}`,
			taskSummary: `Task ${index}`,
		}),
	);
	const strip = () => new FleetStrip();

	it("shows the hint row and hollow markers outside selection", () => {
		const lines = strip().render({ ...base, roots: roots.slice(0, 2) }, 40);
		expect(lines).toEqual([
			"  ↓ to manage",
			"  ○ agent-1  Task 1                   4s",
			"  ○ agent-2  Task 2                   4s",
		]);
	});

	it("fills the selected marker and swaps the hint in selection", () => {
		const s = strip();
		s.startSelection("run-2");
		const lines = s.render({ ...base, roots: roots.slice(0, 3) }, 40);
		expect(lines[0]).toBe("  ↑↓ select · enter inspect · esc back");
		expect(lines.slice(1).map((line) => line.slice(0, 4))).toEqual(["  ○ ", "  ● ", "  ○ "]);
	});

	it("windows rows with tintin's more markers and follows the selection", () => {
		const s = strip();
		const first = s.render({ ...base, roots }, 40);
		expect(first).toHaveLength(7);
		expect(first.at(-1)!.trim()).toBe("↓ 2 more");
		s.startSelection("run-7");
		const last = s.render({ ...base, roots }, 40);
		expect(last[1].trim()).toBe("↑ 2 more");
		expect(last.at(-1)).toContain("● agent-7");
	});

	it("respects a smaller visible-agent preference", () => {
		const lines = strip().render({ ...base, visibleAgents: 2, roots }, 40);
		expect(lines.filter((line) => line.includes("○"))).toHaveLength(2);
		expect(lines.at(-1)!.trim()).toBe("↓ 5 more");
	});

	it("freezes elapsed time once a run ends", () => {
		const done = root({ runId: "d", agent: "a", startedAt: NOW - 9000, endedAt: NOW - 2000, state: "completed" });
		expect(strip().render({ ...base, roots: [done] }, 20)[1]).toBe("  ○ a             7s");
	});

	it("fits every row to a narrow width", () => {
		const long = root({ runId: "x", agent: "a".repeat(30), taskSummary: "t".repeat(200) });
		for (const line of strip().render({ ...base, roots: [long] }, 30))
			expect(visibleWidth(line)).toBeLessThanOrEqual(30);
	});
});

describe("projection purity", () => {
	it("changes no input state and exposes a frozen view", () => {
		const roots = [root({ runId: "b", startedAt: 2 }), root({ runId: "a", startedAt: 1 })];
		const projection = projectFleet({ ...base, roots });
		expect(roots.map((item) => item.runId)).toEqual(["b", "a"]);
		expect(Object.isFrozen(projection.rows)).toBe(true);
		expect(Object.isFrozen(projection)).toBe(true);
	});
});

describe("view state", () => {
	const input = { ...base, roots: [root({ runId: "a" }), root({ runId: "b" })] };

	it("expands by default so the list shows without a key press", () => {
		expect(new FleetStrip().render(input, 80)).toHaveLength(3);
	});

	it("hides the list when collapsed or off", () => {
		expect(new FleetStrip(() => "collapsed").render(input, 80)).toEqual([]);
		expect(new FleetStrip(() => "off").render(input, 80)).toEqual([]);
		expect(new FleetStrip(() => "collapsed").isHidden).toBe(false);
		expect(new FleetStrip(() => "off").isHidden).toBe(true);
	});

	it("toggles for the session without changing the saved view", () => {
		let saved: "expanded" | "collapsed" | "off" = "expanded";
		const strip = new FleetStrip(() => saved);
		strip.toggle();
		expect(strip.render(input, 80)).toEqual([]);
		expect(saved).toBe("expanded");
		strip.toggle();
		expect(strip.render(input, 80)).toHaveLength(3);
		saved = "collapsed";
		strip.resetView();
		expect(strip.render(input, 80)).toEqual([]);
	});

	it("shows an off fleet for the session when toggled", () => {
		const strip = new FleetStrip(() => "off");
		strip.toggle();
		expect(strip.isHidden).toBe(false);
		expect(strip.render(input, 80)).toHaveLength(3);
		strip.toggle();
		expect(strip.render(input, 80)).toEqual([]);
	});

	it("hides only management rows, ends selection and keeps the saved preference across toggles", () => {
		let shown = true;
		const strip = new FleetStrip(
			() => "expanded",
			() => shown,
		);
		strip.startSelection("a");
		shown = false;
		expect(strip.render(input, 80)).toEqual([]);
		expect(strip.isSelecting).toBe(false);
		expect(strip.isExpanded).toBe(true);
		expect(strip.isHidden).toBe(false);
		strip.toggle();
		strip.toggle();
		expect(strip.render(input, 80)).toEqual([]);
		expect(shown).toBe(false);
		shown = true;
		expect(strip.render(input, 80)).toHaveLength(3);
		expect(strip.isSelecting).toBe(false);
	});

	it("shows effective hints and omits inactive navigation actions", () => {
		let keys = { navigationDownKey: "ctrl+shift+down", navigationUpKey: "ctrl+shift+up" };
		const strip = new FleetStrip(
			() => "expanded",
			() => true,
			() => keys,
		);
		expect(strip.render(input, 100)[0]).toContain("ctrl+shift+down to manage");
		strip.startSelection("a");
		expect(strip.render(input, 120)[0]).toContain("ctrl+shift+up/ctrl+shift+down select");
		keys = { navigationDownKey: "ctrl+shift+down", navigationUpKey: "off" };
		expect(strip.render(input, 100)[0]).toContain("ctrl+shift+down select");
		expect(strip.render(input, 100)[0]).not.toContain("off");
		strip.endSelection();
		keys = { navigationDownKey: "off", navigationUpKey: "up" };
		expect(strip.render(input, 100).join("\n")).not.toMatch(/to manage|select|off/);
		expect(strip.render(input, 100).filter((line) => line.includes("○"))).toHaveLength(2);
	});

	it("ends selection when collapsed", () => {
		const strip = new FleetStrip();
		strip.startSelection("a");
		strip.toggle();
		expect(strip.isSelecting).toBe(false);
	});
});
