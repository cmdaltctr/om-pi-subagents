import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getKeybindings, type KeyId } from "@earendil-works/pi-tui";
import type { UiSettings } from "./config.ts";

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
 * a remapped `app.tools.expand` frees its old key without OMPSS editing any keybinding.
 */
export function occupiedByBuiltin(key: string, resolved: ResolvedBindings = builtinBindings()): boolean {
	for (const keys of Object.values(resolved)) {
		if (keys === key || (Array.isArray(keys) && keys.includes(key as never))) return true;
	}
	return false;
}

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
	const bound: { maxVisibleAgents: number; toggleKey: string; inspectKey: string } = {
		...settings,
		toggleKey: "off",
		inspectKey: "off",
	};
	const last = new Map<string, number>();
	const once = (name: string, run: (ctx: ExtensionContext) => void) => (ctx: ExtensionContext) => {
		const now = Date.now();
		if (now - (last.get(name) ?? 0) < DISPATCH_GUARD_MS) return;
		last.set(name, now);
		run(ctx);
	};
	const bind = (field: "toggleKey" | "inspectKey", description: string, run: (ctx: ExtensionContext) => void) => {
		const key = settings[field];
		if (key === "off") return;
		if (occupiedByBuiltin(key, resolved)) {
			const message = `${key} is bound to a built-in action; choose another key in /ompss-settings`;
			diagnostics.push(message);
			actions.onConflict?.(message);
			return;
		}
		pi.registerShortcut(key as KeyId, { description, handler: once(field, run) });
		bound[field] = key;
	};
	bind("toggleKey", "Toggle the OMPSS agent fleet", actions.toggleFleet);
	bind("inspectKey", "Inspect OMPSS agents", actions.openInspection);
	return { keys: Object.freeze(bound) as UiSettings, diagnostics: Object.freeze(diagnostics) };
}
