import { describe, expect, it, vi } from "vitest";
import type { FleetView } from "../src/config.ts";
import { FleetStrip } from "../src/fleet.ts";
import { editorOwnsFocus, handleFleetInput } from "../src/fleet-view.ts";

function host(overrides: Partial<Parameters<typeof handleFleetInput>[0]> = {}, view: FleetView = "expanded") {
	const strip = new FleetStrip(() => view);
	const inspect = vi.fn();
	const viewChanged = vi.fn();
	const base = {
		strip,
		activeRunIds: () => ["run-a", "run-b", "run-c"] as const,
		editorText: () => "",
		editorOwnsFocus: () => true,
		onInspect: inspect,
		onViewChanged: viewChanged,
		...overrides,
	};
	return { host: base, strip, inspect, viewChanged };
}

const DOWN = "\x1b[B";
const UP = "\x1b[A";
const ESCAPE = "\x1b";
const ENTER = "\r";

describe("entering selection", () => {
	it("enters selection at the first root on Down from an empty focused editor", () => {
		const h = host();
		expect(handleFleetInput(h.host, DOWN)).toBe(true);
		expect(h.strip.isSelecting).toBe(true);
		expect(h.strip.selection()).toBe("run-a");
		expect(h.viewChanged).toHaveBeenCalledOnce();
	});

	it.each([
		["Up", UP],
		["Escape", ESCAPE],
		["Enter", ENTER],
	])("leaves %s to Pi outside selection", (_name, key) => {
		const h = host();
		expect(handleFleetInput(h.host, key)).toBe(false);
		expect(h.strip.isSelecting).toBe(false);
		expect(h.inspect).not.toHaveBeenCalled();
	});

	it("passes Down through while the editor holds a draft", () => {
		const h = host({ editorText: () => "typing a prompt" });
		expect(handleFleetInput(h.host, DOWN)).toBe(false);
		expect(h.strip.isSelecting).toBe(false);
	});

	it("passes keys through when a dialog or overlay owns focus", () => {
		const h = host({ editorOwnsFocus: () => false });
		expect(handleFleetInput(h.host, DOWN)).toBe(false);
		expect(handleFleetInput(h.host, ESCAPE)).toBe(false);
	});

	it.each(["collapsed", "off"] as const)("passes Down through when the fleet is %s", (view) => {
		const h = host({}, view);
		expect(handleFleetInput(h.host, DOWN)).toBe(false);
		expect(h.strip.isSelecting).toBe(false);
	});

	it("passes Down through when no active root remains", () => {
		const h = host({ activeRunIds: () => [] });
		expect(handleFleetInput(h.host, DOWN)).toBe(false);
	});

	it("passes ordinary typing through untouched", () => {
		const h = host();
		expect(handleFleetInput(h.host, "x")).toBe(false);
	});
});

describe("inside selection", () => {
	const selecting = (overrides: Partial<Parameters<typeof handleFleetInput>[0]> = {}) => {
		const h = host(overrides);
		handleFleetInput(h.host, DOWN);
		h.viewChanged.mockClear();
		return h;
	};

	it("moves through every active root and clamps at both ends", () => {
		const h = selecting();
		expect(handleFleetInput(h.host, DOWN)).toBe(true);
		expect(h.strip.selection()).toBe("run-b");
		for (let index = 0; index < 6; index++) handleFleetInput(h.host, DOWN);
		expect(h.strip.selection()).toBe("run-c");
		for (let index = 0; index < 6; index++) expect(handleFleetInput(h.host, UP)).toBe(true);
		expect(h.strip.selection()).toBe("run-a");
	});

	it("inspects the selected run on Enter", () => {
		const h = selecting();
		handleFleetInput(h.host, DOWN);
		expect(handleFleetInput(h.host, ENTER)).toBe(true);
		expect(h.inspect).toHaveBeenCalledWith("run-b");
	});

	it("leaves selection on Escape without changing the view", () => {
		const h = selecting();
		expect(handleFleetInput(h.host, ESCAPE)).toBe(true);
		expect(h.strip.isSelecting).toBe(false);
		expect(h.strip.isExpanded).toBe(true);
		expect(h.viewChanged).toHaveBeenCalledOnce();
		expect(handleFleetInput(h.host, UP)).toBe(false);
	});

	it("ends selection and passes the key on when a draft appears", () => {
		let text = "";
		const h = selecting({ editorText: () => text });
		text = "x";
		expect(handleFleetInput(h.host, DOWN)).toBe(false);
		expect(h.strip.isSelecting).toBe(false);
	});

	it("ends selection when the editor loses focus", () => {
		let focused = true;
		const h = selecting({ editorOwnsFocus: () => focused });
		focused = false;
		expect(handleFleetInput(h.host, UP)).toBe(false);
		expect(h.strip.isSelecting).toBe(false);
	});

	it("ends selection when the last active run ends", () => {
		let ids: readonly string[] = ["run-a"];
		const h = selecting({ activeRunIds: () => ids });
		ids = [];
		expect(handleFleetInput(h.host, UP)).toBe(false);
		expect(h.strip.isSelecting).toBe(false);
	});

	it("ignores key-release events so one tap moves once", () => {
		const h = selecting();
		handleFleetInput(h.host, DOWN);
		// Kitty release for the same arrow: no second move.
		expect(handleFleetInput(h.host, "\x1b[1;1:3B")).toBe(false);
		expect(h.strip.selection()).toBe("run-b");
	});
});

describe("focus check", () => {
	it("requires a focused component and no overlay", () => {
		expect(editorOwnsFocus({ getFocusedComponent: () => ({}), hasOverlay: () => false })).toBe(true);
		expect(editorOwnsFocus({ getFocusedComponent: () => null, hasOverlay: () => false })).toBe(false);
		expect(editorOwnsFocus({ getFocusedComponent: () => ({}), hasOverlay: () => true })).toBe(false);
	});
});
