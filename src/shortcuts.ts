import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings, type KeyId } from "@earendil-works/pi-tui";
import { normaliseKey, type UiSettings } from "./config.ts";

/** Actions the two view shortcuts perform. */
export interface ViewShortcutActions {
	toggleFleet(ctx: ExtensionContext): void;
	openInspection(ctx: ExtensionContext): void;
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

// Kitty terminals dispatch one tap as a press and a release, and repeats while held.
// Identical actions inside this window run once; deliberate later presses still work.
const DISPATCH_GUARD_MS = 100;

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
): ShortcutRegistration {
	const diagnostics: string[] = [];
	const bound = {
		...settings,
		toggleKey: "off",
		inspectKey: "off",
		navigationDownKey: "off",
		navigationUpKey: "off",
	};
	const last = new Map<string, number>();
	const once = (name: string, run: (ctx: ExtensionContext) => void) => (ctx: ExtensionContext) => {
		const now = Date.now();
		if (now - (last.get(name) ?? 0) < DISPATCH_GUARD_MS) return;
		last.set(name, now);
		run(ctx);
	};
	const resolve = (field: "toggleKey" | "inspectKey" | "navigationDownKey" | "navigationUpKey"): boolean => {
		const key = settings[field];
		if (key === "off") return false;
		const scopedDefault =
			(field === "navigationDownKey" && key === "down") || (field === "navigationUpKey" && key === "up");
		const owners = builtinOwners(key, resolved).filter(
			(action) => !scopedDefault || !DEFAULT_OVERLAPS[field as keyof typeof DEFAULT_OVERLAPS].has(action),
		);
		if (owners.length) {
			const message = `${key} is bound to a built-in action: ${owners.join(", ")}. Choose another key in /omps-settings or manually remap the named actions in keybindings.json; check /hotkeys, then /reload.`;
			diagnostics.push(message);
			actions.onConflict?.(message);
			return false;
		}
		bound[field] = key;
		return true;
	};
	const bind = (field: "toggleKey" | "inspectKey", description: string, run: (ctx: ExtensionContext) => void) => {
		if (resolve(field)) pi.registerShortcut(settings[field] as KeyId, { description, handler: once(field, run) });
	};
	bind("toggleKey", "Toggle the OMPS agent fleet", actions.toggleFleet);
	bind("inspectKey", "Inspect OMPS agents", actions.openInspection);
	// Navigation stays on the scoped terminal-input path, never a global shortcut.
	resolve("navigationDownKey");
	resolve("navigationUpKey");
	return { keys: Object.freeze(bound), diagnostics: Object.freeze(diagnostics) };
}
