import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings, isKittyProtocolActive, type KeyId } from "@earendil-works/pi-tui";
import { normaliseKey, type UiKeyField, type UiSettings } from "./config.ts";

/** Actions the view shortcuts perform. */
export interface ViewShortcutActions {
	toggleFleet(ctx: ExtensionContext): void;
	openInspection(ctx: ExtensionContext): void;
	/** Omitted by callers without a result renderer. */
	toggleResults?(ctx: ExtensionContext): void;
	/** Surfaced when a configured key cannot bind in this session. */
	onConflict?(message: string): void;
}

/** What actually bound this session. Settings shows these as the active bindings. */
export interface ShortcutRegistration {
	readonly keys: UiSettings;
	readonly diagnostics: readonly string[];
}

/** Effective resolved bindings, keyed by built-in action. Overridable for tests. */
export type ResolvedBindings = Record<string, unknown>;

const builtinBindings = (): ResolvedBindings => getKeybindings().getResolvedBindings();

/**
 * Whether an effective built-in action already owns this key. The host keeps such keys:
 * a remapped `app.tools.expand` frees its old key without OMPS editing any keybinding.
 */
export function occupiedByBuiltin(key: string, resolved: ResolvedBindings = builtinBindings()): boolean {
	return builtinOwners(key, resolved).length > 0;
}

function builtinOwners(key: string, resolved: ResolvedBindings): string[] {
	const wanted = normaliseKey(key);
	return Object.entries(resolved)
		.filter(([_action, keys]) => {
			const list: unknown[] = Array.isArray(keys) ? keys : [keys];
			return list.some((entry) => typeof entry === "string" && normaliseKey(entry) === wanted);
		})
		.map(([action]) => action);
}

// Only these direction-specific overlaps are safe from the verified empty editor.
const DEFAULT_OVERLAPS = {
	navigationDownKey: new Set(["tui.editor.cursorDown", "tui.editor.historyNext", "tui.select.down"]),
	navigationUpKey: new Set(["tui.editor.cursorUp", "tui.editor.historyPrevious", "tui.select.up"]),
};

/** Return owner-specific conflict guidance, preserving the scoped default navigation overlaps. */
export function shortcutConflict(
	field: UiKeyField,
	key: string,
	resolved: ResolvedBindings = builtinBindings(),
): string | undefined {
	if (key === "off") return undefined;
	const scopedDefault =
		(field === "navigationDownKey" && key === "down") || (field === "navigationUpKey" && key === "up");
	const owners = builtinOwners(key, resolved).filter(
		(action) => !scopedDefault || !DEFAULT_OVERLAPS[field as keyof typeof DEFAULT_OVERLAPS].has(action),
	);
	if (owners.length === 0) return undefined;
	return `${key} is bound to a built-in action: ${owners.join(", ")}. Choose another key in /omps-settings or manually remap the named actions in keybindings.json; check /hotkeys, then /reload.`;
}

// Kitty terminals dispatch one tap as a press and a release, and repeats while held.
// Identical actions inside this window run once; deliberate later presses still work.
const DISPATCH_GUARD_MS = 100;

function requiresExtendedReporting(key: string): boolean {
	const match = /^((?:(?:ctrl|shift|alt|super)\+)*)(.+)$/.exec(normaliseKey(key));
	if (!match) return false;
	const [, modifiers, base] = match;
	if (modifiers.includes("super+")) return true;
	if (base.length === 1) {
		if (modifiers.includes("shift+")) return modifiers !== "shift+" || !/^[a-z]$/.test(base);
		// These Ctrl keys have legacy control bytes, including ESC-prefixed Alt variants.
		return modifiers.includes("ctrl+") && !/^[a-z[\]\\_-]$/.test(base);
	}
	if (!modifiers || !["enter", "return", "space", "backspace"].includes(base)) return false;
	if (modifiers === "alt+") return false;
	return modifiers !== "ctrl+" || (base !== "space" && base !== "backspace");
}

/**
 * Register the configured view shortcuts. Called at interactive session start, before the
 * host snapshots editor bindings. Keys occupied by effective built-in actions are refused
 * with guidance rather than overriding host behaviour.
 */
export function registerViewShortcuts(
	pi: ExtensionAPI,
	settings: UiSettings,
	actions: ViewShortcutActions,
	resolved: ResolvedBindings = builtinBindings(),
	kittyActive: () => boolean = isKittyProtocolActive,
): ShortcutRegistration {
	const diagnostics: string[] = [];
	const bound = {
		...settings,
		toggleKey: "off",
		inspectKey: "off",
		navigationDownKey: "off",
		navigationUpKey: "off",
		resultKey: "off",
	};
	const last = new Map<string, number>();
	const once = (name: string, run: (ctx: ExtensionContext) => void) => (ctx: ExtensionContext) => {
		const now = Date.now();
		if (now - (last.get(name) ?? 0) < DISPATCH_GUARD_MS) return;
		last.set(name, now);
		run(ctx);
	};
	const resolve = (field: UiKeyField): boolean => {
		const key = settings[field];
		if (key === "off") return false;
		const message = shortcutConflict(field, key, resolved);
		if (message) {
			diagnostics.push(message);
			actions.onConflict?.(message);
			return false;
		}
		bound[field] = key;
		return true;
	};
	const bind = (
		field: "toggleKey" | "inspectKey" | "resultKey",
		description: string,
		run: (ctx: ExtensionContext) => void,
	) => {
		if (resolve(field)) pi.registerShortcut(settings[field] as KeyId, { description, handler: once(field, run) });
	};
	bind("toggleKey", "Toggle the OMPS agent fleet", actions.toggleFleet);
	bind("inspectKey", "Inspect OMPS agents", actions.openInspection);
	// Navigation stays on the scoped terminal-input path, never a global shortcut.
	resolve("navigationDownKey");
	resolve("navigationUpKey");
	if (actions.toggleResults) {
		bind("resultKey", "Toggle OMPS result messages", actions.toggleResults);
		if (bound.resultKey !== "off" && requiresExtendedReporting(bound.resultKey) && !kittyActive()) {
			const message = `${bound.resultKey} requires extended-key reporting. Terminal support is unverified: kitty is unconfirmed; modifyOtherKeys may still work. The key stays active. Use the host tool-output expansion key as a fallback, or choose another key in /omps-settings.`;
			diagnostics.push(message);
			actions.onConflict?.(message);
		}
	}
	return { keys: Object.freeze(bound), diagnostics: Object.freeze(diagnostics) };
}
