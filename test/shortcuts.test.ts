import { writeFixtureRegistry } from "./fixtures/registry.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { occupiedByBuiltin, registerViewShortcuts } from "../src/shortcuts.ts";
import { loadRegistry, normaliseKey, type UiSettings } from "../src/config.ts";

const defaults: UiSettings = { maxVisibleAgents: 5, fleetView: "expanded", toggleKey: "alt+o", inspectKey: "alt+i" };

function harness(resolved: Record<string, unknown> = {}) {
	const registrations = new Map<string, { description?: string; handler: (ctx: ExtensionContext) => void }>();
	const pi = {
		registerShortcut: (key: string, options: { description?: string; handler: (ctx: ExtensionContext) => void }) =>
			registrations.set(key, options),
	} as unknown as ExtensionAPI;
	const actions = {
		toggleFleet: vi.fn(),
		openInspection: vi.fn(),
		onConflict: vi.fn(),
	};
	return { pi, registrations, actions, resolved };
}

describe("registerViewShortcuts", () => {
	it("binds the configured keys and reports them as active", () => {
		const { pi, registrations, actions, resolved } = harness();
		const registration = registerViewShortcuts(pi, defaults, actions, resolved);
		expect([...registrations.keys()]).toEqual(["alt+o", "alt+i"]);
		expect(registration.keys.toggleKey).toBe("alt+o");
		expect(registration.keys.inspectKey).toBe("alt+i");
		expect(registration.diagnostics).toEqual([]);
		expect(actions.onConflict).not.toHaveBeenCalled();
	});

	it("registers nothing when both keys are off", () => {
		const { pi, registrations, actions, resolved } = harness();
		const registration = registerViewShortcuts(
			pi,
			{ ...defaults, toggleKey: "off", inspectKey: "off" },
			actions,
			resolved,
		);
		expect(registrations.size).toBe(0);
		expect(registration.keys.toggleKey).toBe("off");
		expect(registration.keys.inspectKey).toBe("off");
	});

	it("refuses a key owned by an effective built-in action with guidance", () => {
		const { pi, registrations, actions } = harness({ "app.tools.expand": "ctrl+o" });
		const registration = registerViewShortcuts(pi, { ...defaults, toggleKey: "ctrl+o" }, actions, {
			"app.tools.expand": "ctrl+o",
		});
		expect([...registrations.keys()]).toEqual(["alt+i"]);
		expect(registration.keys.toggleKey).toBe("off");
		expect(registration.diagnostics[0]).toMatch(/ctrl\+o.*built-in.*\/omps-settings/i);
		expect(actions.onConflict).toHaveBeenCalledOnce();
	});

	it("treats a key as free once the operator remaps its built-in action", () => {
		const { pi, registrations, actions } = harness({ "app.tools.expand": "ctrl+y" });
		const registration = registerViewShortcuts(pi, { ...defaults, toggleKey: "ctrl+o" }, actions, {
			"app.tools.expand": "ctrl+y",
		});
		expect([...registrations.keys()]).toEqual(["ctrl+o", "alt+i"]);
		expect(registration.diagnostics).toEqual([]);
	});

	it("accepts array bindings when checking occupancy", () => {
		expect(occupiedByBuiltin("up", { "tui.editor.cursorUp": ["up", "ctrl+p"] })).toBe(true);
		expect(occupiedByBuiltin("ctrl+p", { "tui.editor.cursorUp": ["up", "ctrl+p"] })).toBe(true);
		expect(occupiedByBuiltin("alt+o", { "tui.editor.cursorUp": ["up", "ctrl+p"] })).toBe(false);
	});
});

describe("modifier order", () => {
	it("refuses ctrl+shift+o when Pi binds shift+ctrl+o", () => {
		const { pi, registrations, actions } = harness();
		const resolved = { "app.tree.filter.cycleBackward": "shift+ctrl+o" };
		const registration = registerViewShortcuts(pi, { ...defaults, toggleKey: "ctrl+shift+o" }, actions, resolved);
		expect(registrations.has("ctrl+shift+o")).toBe(false);
		expect(registration.keys.toggleKey).toBe("off");
		expect(registration.diagnostics[0]).toMatch(/ctrl\+shift\+o.*built-in/i);
	});

	it("finds a reordered key inside array bindings", () => {
		expect(occupiedByBuiltin("alt+ctrl+p", { "app.x": ["f1", "ctrl+alt+p"] })).toBe(true);
		expect(occupiedByBuiltin("ctrl+alt+q", { "app.x": ["ctrl+alt+p"] })).toBe(false);
	});

	it("keeps the base key last and sorts modifiers", () => {
		expect(normaliseKey("shift+ctrl+o")).toBe(normaliseKey("ctrl+shift+o"));
		expect(normaliseKey("super+alt+shift+ctrl+-")).toBe("ctrl+shift+alt+super+-");
		expect(normaliseKey("f2")).toBe("f2");
	});
});

describe("shipped defaults", () => {
	it("registers no shortcut for YAML without ui", async () => {
		const dir = await mkdtemp(join(tmpdir(), "omps-shortcuts-"));
		try {
			const path = join(dir, "omps/config.yaml");
			await writeFixtureRegistry(dir, "version: 1\nagents: {}\n");
			const { pi, registrations, actions } = harness();
			registerViewShortcuts(pi, (await loadRegistry(path)).ui, actions, {});
			expect(registrations.size).toBe(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe("dispatch guard", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("performs one action for a press and release pair", () => {
		const { pi, registrations, actions, resolved } = harness();
		registerViewShortcuts(pi, defaults, actions, resolved);
		const handler = registrations.get("alt+o")!.handler;
		const ctx = {} as ExtensionContext;
		handler(ctx);
		vi.advanceTimersByTime(20);
		handler(ctx);
		expect(actions.toggleFleet).toHaveBeenCalledOnce();
	});

	it("performs the action again after the guard window", () => {
		const { pi, registrations, actions, resolved } = harness();
		registerViewShortcuts(pi, defaults, actions, resolved);
		const handler = registrations.get("alt+o")!.handler;
		const ctx = {} as ExtensionContext;
		handler(ctx);
		vi.advanceTimersByTime(250);
		handler(ctx);
		expect(actions.toggleFleet).toHaveBeenCalledTimes(2);
	});

	it("guards the two shortcuts independently", () => {
		const { pi, registrations, actions, resolved } = harness();
		registerViewShortcuts(pi, defaults, actions, resolved);
		const ctx = {} as ExtensionContext;
		registrations.get("alt+o")!.handler(ctx);
		registrations.get("alt+i")!.handler(ctx);
		expect(actions.toggleFleet).toHaveBeenCalledOnce();
		expect(actions.openInspection).toHaveBeenCalledOnce();
	});
});
