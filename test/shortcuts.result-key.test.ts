import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isKittyProtocolActive, matchesKey, setKittyProtocolActive, type KeyId } from "@earendil-works/pi-tui";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UiSettings } from "../src/config.ts";
import { registerViewShortcuts, type ResolvedBindings, type ViewShortcutActions } from "../src/shortcuts.ts";

const settings: UiSettings = {
	maxVisibleAgents: 5,
	fleetView: "expanded",
	showManagementList: true,
	toggleKey: "alt+o",
	inspectKey: "alt+i",
	navigationDownKey: "down",
	navigationUpKey: "up",
	resultKey: "ctrl+shift+e",
};
const ctx = {} as ExtensionContext;
function harness(keys: Partial<UiSettings> = {}, resolved: ResolvedBindings = {}, kitty = true, callback = true) {
	const shortcuts = new Map<KeyId, Parameters<ExtensionAPI["registerShortcut"]>[1]>();
	const pi = {
		registerShortcut: (key: KeyId, options: Parameters<ExtensionAPI["registerShortcut"]>[1]) =>
			shortcuts.set(key, options),
	} as unknown as ExtensionAPI;
	const toggleResults = vi.fn();
	const actions: ViewShortcutActions = {
		toggleFleet: vi.fn(),
		openInspection: vi.fn(),
		onConflict: vi.fn(),
		...(callback ? { toggleResults } : {}),
	};
	const registration = registerViewShortcuts(pi, { ...settings, ...keys }, actions, resolved, () => kitty);
	return { shortcuts, actions, toggleResults, registration };
}

describe("result shortcut registration", () => {
	it("binds the result action after the existing view actions", () => {
		const h = harness();
		expect([...h.shortcuts.keys()]).toEqual(["alt+o", "alt+i", "ctrl+shift+e"]);
		expect(h.registration.keys.resultKey).toBe("ctrl+shift+e");
		expect(h.registration.diagnostics).toEqual([]);
		expect(Object.isFrozen(h.registration.keys)).toBe(true);
		h.shortcuts.get("ctrl+shift+e")!.handler(ctx);
		expect(h.toggleResults).toHaveBeenCalledExactlyOnceWith(ctx);
		expect(h.actions.toggleFleet).not.toHaveBeenCalled();
		expect(h.actions.openInspection).not.toHaveBeenCalled();
	});

	it("keeps off unbound", () => {
		const h = harness({ resultKey: "off" });
		expect([...h.shortcuts.keys()]).toEqual(["alt+o", "alt+i"]);
		expect(h.registration.keys.resultKey).toBe("off");
		expect(h.registration.diagnostics).toEqual([]);
	});

	it("keeps the active result key off when callers supply no callback", () => {
		const h = harness({}, {}, false, false);
		expect([...h.shortcuts.keys()]).toEqual(["alt+o", "alt+i"]);
		expect(h.registration.keys.resultKey).toBe("off");
		expect(h.registration.diagnostics).toEqual([]);
	});

	it("refuses reordered effective host conflicts and names every owner", () => {
		const h = harness(
			{},
			{
				"app.tools.expand": ["ctrl+o", "shift+ctrl+e"],
				"app.other": "ctrl+shift+e",
			},
			false,
		);
		expect(h.shortcuts.has("ctrl+shift+e")).toBe(false);
		expect(h.registration.keys.resultKey).toBe("off");
		expect(h.registration.diagnostics).toHaveLength(1);
		expect(h.registration.diagnostics[0]).toMatch(/app\.tools\.expand.*app\.other.*\/omps-settings.*\/reload/);
		expect(h.actions.onConflict).toHaveBeenCalledExactlyOnceWith(h.registration.diagnostics[0]);
	});

	it("binds a released host key without changing host actions", () => {
		const resolved = { "app.tools.expand": "ctrl+y" };
		const h = harness({ resultKey: "ctrl+o" }, resolved, false);
		expect(h.shortcuts.has("ctrl+o")).toBe(true);
		expect(h.registration.keys.resultKey).toBe("ctrl+o");
		expect(h.registration.diagnostics).toEqual([]);
		expect(resolved).toEqual({ "app.tools.expand": "ctrl+y" });
	});

	it("leaves raw Ctrl+E with its effective editor action", () => {
		const h = harness({ resultKey: "ctrl+e" }, { "tui.editor.cursorLineEnd": ["end", "ctrl+e"] });
		expect(h.registration.keys.resultKey).toBe("off");
		expect(h.shortcuts.has("ctrl+e")).toBe(false);
		expect(h.registration.diagnostics[0]).toContain("tui.editor.cursorLineEnd");
	});
});

describe("extended result keys", () => {
	it.each([
		"ctrl+shift+e",
		"shift+ctrl+r",
		"ctrl+alt+shift+r",
		"alt+shift+r",
		"super+r",
		"ctrl+1",
		"shift+1",
		"shift+enter",
	])("keeps %s active with unverified-support guidance", (resultKey) => {
		const h = harness({ resultKey }, {}, false);
		expect(h.registration.keys.resultKey).toBe(resultKey);
		expect(h.shortcuts.has(resultKey as KeyId)).toBe(true);
		expect(h.registration.diagnostics).toHaveLength(1);
		expect(h.registration.diagnostics[0]).toContain(resultKey);
		expect(h.registration.diagnostics[0]).toMatch(/extended.*unverified.*kitty.*modifyOtherKeys/i);
		expect(h.registration.diagnostics[0]).toMatch(/host.*expansion.*\/omps-settings/i);
		expect(h.actions.onConflict).toHaveBeenCalledExactlyOnceWith(h.registration.diagnostics[0]);
	});

	it.each(["alt+r", "ctrl+alt+r", "ctrl+y", "shift+r", "f2", "ctrl+shift+down", "alt+enter"])(
		"leaves legacy-capable %s active without extended-reporting guidance",
		(resultKey) => {
			const h = harness({ resultKey }, {}, false);
			expect(h.registration.keys.resultKey).toBe(resultKey);
			expect(h.registration.diagnostics).toEqual([]);
		},
	);

	it.each(["\x1b[101;6u", "\x1b[27;6;101~"])(
		"dispatches extended sequence %j without kitty, preserving raw Ctrl+E",
		async (sequence) => {
			const previous = isKittyProtocolActive();
			setKittyProtocolActive(false);
			try {
				const h = harness({}, { "tui.editor.cursorLineEnd": ["end", "ctrl+e"] }, false);
				const dispatch = async (data: string) => {
					for (const [key, shortcut] of h.shortcuts) if (matchesKey(data, key)) await shortcut.handler(ctx);
				};
				await dispatch("\x05");
				expect(h.toggleResults).not.toHaveBeenCalled();
				expect(matchesKey("\x05", "ctrl+e")).toBe(true);
				await dispatch(sequence);
				expect(h.toggleResults).toHaveBeenCalledExactlyOnceWith(ctx);
			} finally {
				setKittyProtocolActive(previous);
			}
		},
	);
});

describe("result dispatch guard", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());
	it("guards result press/release independently and allows later presses", () => {
		const h = harness();
		const result = h.shortcuts.get("ctrl+shift+e")!;
		result.handler(ctx);
		vi.advanceTimersByTime(20);
		result.handler(ctx);
		h.shortcuts.get("alt+o")!.handler(ctx);
		h.shortcuts.get("alt+i")!.handler(ctx);
		expect(h.toggleResults).toHaveBeenCalledOnce();
		expect(h.actions.toggleFleet).toHaveBeenCalledOnce();
		expect(h.actions.openInspection).toHaveBeenCalledOnce();
		vi.advanceTimersByTime(100);
		result.handler(ctx);
		expect(h.toggleResults).toHaveBeenCalledTimes(2);
	});
});
