import { describe, expect, it, vi } from "vitest";
import { FleetStrip } from "../src/fleet.ts";
import { editorOwnsFocus, handleFleetInput } from "../src/fleet-view.ts";

function host(overrides: Partial<Parameters<typeof handleFleetInput>[0]> = {}) {
	const strip = new FleetStrip();
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

describe("fleet navigation", () => {
	it("moves the selection through every active root and consumes arrows", () => {
		const h = host();
		h.strip.toggle();
		expect(handleFleetInput(h.host, "\x1b[B")).toBe(true);
		expect(h.strip.selection()).toBe("run-b");
		expect(handleFleetInput(h.host, "\x1b[B")).toBe(true);
		expect(h.strip.selection()).toBe("run-c");
		expect(handleFleetInput(h.host, "\x1b[A")).toBe(true);
		expect(h.strip.selection()).toBe("run-b");
		expect(h.viewChanged).toHaveBeenCalledTimes(3);
	});

	it("clamps at both ends so every root stays reachable without wrapping", () => {
		const h = host();
		h.strip.toggle();
		expect(handleFleetInput(h.host, "\x1b[A")).toBe(true);
		expect(h.strip.selection()).toBe("run-a");
		for (let index = 0; index < 6; index++) handleFleetInput(h.host, "\x1b[B");
		expect(h.strip.selection()).toBe("run-c");
	});

	it("collapses on Escape without cancelling work", () => {
		const h = host();
		h.strip.toggle();
		expect(handleFleetInput(h.host, "\x1b")).toBe(true);
		expect(h.strip.isExpanded).toBe(false);
	});

	it("inspects the selected run on Enter", () => {
		const h = host();
		h.strip.toggle();
		handleFleetInput(h.host, "\x1b[B");
		expect(handleFleetInput(h.host, "\r")).toBe(true);
		expect(h.inspect).toHaveBeenCalledWith("run-b");
	});

	it("passes keys through when the fleet is collapsed", () => {
		const h = host();
		expect(handleFleetInput(h.host, "\x1b[B")).toBe(false);
		expect(h.strip.selection()).toBeUndefined();
	});

	it("passes keys through while the editor holds a non-empty draft", () => {
		const h = host({ editorText: () => "typing a prompt" });
		h.strip.toggle();
		expect(handleFleetInput(h.host, "\x1b[B")).toBe(false);
	});

	it("passes keys through when a dialog or overlay owns focus", () => {
		const h = host({ editorOwnsFocus: () => false });
		h.strip.toggle();
		expect(handleFleetInput(h.host, "\x1b[B")).toBe(false);
		expect(handleFleetInput(h.host, "\x1b")).toBe(false);
	});

	it("ignores key-release events so one tap performs one action", () => {
		const h = host();
		h.strip.toggle();
		handleFleetInput(h.host, "\x1b[B");
		// Kitty release for the same arrow: no second move.
		expect(handleFleetInput(h.host, "\x1b[1;1:3B")).toBe(false);
		expect(h.strip.selection()).toBe("run-b");
	});

	it("passes through when no active root remains", () => {
		const h = host({ activeRunIds: () => [] });
		h.strip.toggle();
		expect(handleFleetInput(h.host, "\x1b[B")).toBe(false);
	});

	it("passes ordinary typing through untouched", () => {
		const h = host();
		h.strip.toggle();
		expect(handleFleetInput(h.host, "x")).toBe(false);
	});
});

describe("focus check", () => {
	it("requires a focused component and no overlay", () => {
		expect(editorOwnsFocus({ getFocusedComponent: () => ({}), hasOverlay: () => false })).toBe(true);
		expect(editorOwnsFocus({ getFocusedComponent: () => null, hasOverlay: () => false })).toBe(false);
		expect(editorOwnsFocus({ getFocusedComponent: () => ({}), hasOverlay: () => true })).toBe(false);
	});
});
