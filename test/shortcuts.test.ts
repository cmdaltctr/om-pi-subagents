import { writeFixtureRegistry } from "./fixtures/registry.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { occupiedByBuiltin, registerViewShortcuts, shortcutConflict } from "../src/shortcuts.ts";
import { loadRegistry, normaliseKey, type UiSettings } from "../src/config.ts";

const defaults: UiSettings = {
	maxVisibleAgents: 5,
	fleetView: "expanded",
	showManagementList: true,
	toggleKey: "alt+o",
	inspectKey: "alt+i",
	navigationDownKey: "down",
	navigationUpKey: "up",
};

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

describe("navigation conflicts", () => {
	const resolveKeys = (keys: Partial<UiSettings>, resolved: Record<string, unknown>) => {
		const h = harness();
		return registerViewShortcuts(h.pi, { ...defaults, ...keys }, h.actions, resolved);
	};
	it("retains only matching default movement, history and picker overlaps", () => {
		const registration = resolveKeys(
			{},
			{
				"tui.editor.cursorDown": "down",
				"tui.editor.historyNext": "down",
				"tui.select.down": "down",
				"tui.editor.cursorUp": "up",
				"tui.editor.historyPrevious": "up",
				"tui.select.up": "up",
			},
		);
		expect(registration.keys.navigationDownKey).toBe("down");
		expect(registration.keys.navigationUpKey).toBe("up");
		expect(registration.diagnostics).toEqual([]);
	});
	it.each(["app.interrupt", "tui.altScreen.lineDown", "tui.select.up"])(
		"refuses an additional owner of default Down: %s",
		(action) => {
			const registration = resolveKeys({}, { "tui.editor.cursorDown": "down", [action]: "down" });
			expect(registration.keys.navigationDownKey).toBe("off");
			expect(registration.diagnostics.join(" ")).toContain(action);
		},
	);
	it("names every effective modified-arrow conflict and gives manual recovery without fallback", () => {
		const requested = { navigationDownKey: "ctrl+shift+down", navigationUpKey: "ctrl+shift+up" };
		const registration = resolveKeys(requested, {
			"tui.altScreen.nextPrompt": ["shift+ctrl+down", "ctrl+down"],
			"tui.altScreen.previousPrompt": "ctrl+shift+up",
		});
		expect(registration.keys.navigationDownKey).toBe("off");
		expect(registration.keys.navigationUpKey).toBe("off");
		expect(registration.diagnostics.join(" ")).toMatch(
			/tui\.altScreen\.nextPrompt.*keybindings\.json.*\/hotkeys.*\/reload/,
		);
		expect(registration.diagnostics.join(" ")).toContain("tui.altScreen.previousPrompt");
		const released = resolveKeys(requested, {
			"tui.altScreen.nextPrompt": "ctrl+down",
			"tui.altScreen.previousPrompt": "ctrl+up",
		});
		expect(released.keys).toMatchObject(requested);
		expect(released.diagnostics).toEqual([]);
	});
	it("refuses even editor overlaps for custom navigation and preserves explicit off", () => {
		const result = resolveKeys(
			{ navigationDownKey: "alt+p", navigationUpKey: "off" },
			{ "tui.editor.historyNext": "alt+p" },
		);
		expect(result.keys.navigationDownKey).toBe("off");
		expect(result.keys.navigationUpKey).toBe("off");
		expect(result.diagnostics).toHaveLength(1);
	});
});

describe("shared shortcut conflicts", () => {
	it("returns registration's owner-specific guidance for equivalent array bindings", () => {
		const resolved = {
			"app.tools.expand": ["f1", "shift+ctrl+o"],
			"app.test": "ctrl+shift+o",
			"app.unrelated": 12,
		};
		const message = shortcutConflict("toggleKey", "ctrl+shift+o", resolved);
		expect(message).toBe(
			"ctrl+shift+o is bound to a built-in action: app.tools.expand, app.test. Choose another key in /omps-settings or manually remap the named actions in keybindings.json; check /hotkeys, then /reload.",
		);
		const h = harness();
		const registration = registerViewShortcuts(h.pi, { ...defaults, toggleKey: "ctrl+shift+o" }, h.actions, resolved);
		expect(registration.diagnostics).toEqual([message]);
		expect(h.actions.onConflict).toHaveBeenCalledWith(message);
	});

	it.each(["toggleKey", "inspectKey", "navigationDownKey", "navigationUpKey"] as const)(
		"treats off as unbound for %s",
		(field) => expect(shortcutConflict(field, "off", { "app.test": "off" })).toBeUndefined(),
	);

	it("uses effective remaps instead of former default ownership", () => {
		expect(shortcutConflict("toggleKey", "ctrl+o", { "app.tools.expand": "ctrl+y" })).toBeUndefined();
		expect(shortcutConflict("toggleKey", "ctrl+y", { "app.tools.expand": "ctrl+y" })).toContain("app.tools.expand");
	});

	it.each([
		["navigationDownKey", "down", ["tui.editor.cursorDown", "tui.editor.historyNext", "tui.select.down"]],
		["navigationUpKey", "up", ["tui.editor.cursorUp", "tui.editor.historyPrevious", "tui.select.up"]],
	] as const)("permits only matching default overlaps for %s", (field, key, owners) => {
		const resolved = Object.fromEntries(owners.map((owner) => [owner, key]));
		expect(shortcutConflict(field, key, resolved)).toBeUndefined();
		const message = shortcutConflict(field, key, { ...resolved, "app.interrupt": key });
		expect(message).toContain("app.interrupt");
		for (const owner of owners) expect(message).not.toContain(owner);
	});

	it.each([
		["toggleKey", "down", "tui.editor.cursorDown"],
		["inspectKey", "up", "tui.editor.cursorUp"],
		["navigationDownKey", "up", "tui.editor.cursorUp"],
		["navigationUpKey", "down", "tui.editor.cursorDown"],
		["navigationDownKey", "down", "tui.editor.cursorUp"],
		["navigationUpKey", "up", "tui.editor.cursorDown"],
		["navigationDownKey", "alt+p", "tui.editor.historyNext"],
		["navigationUpKey", "ctrl+shift+up", "tui.editor.cursorUp"],
	] as const)("blocks %s: %s owned by %s without a matching default exception", (field, key, owner) => {
		expect(shortcutConflict(field, key, { [owner]: key })).toContain(owner);
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
