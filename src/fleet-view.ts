import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { isKeyRelease, matchesKey, type KeyId } from "@earendil-works/pi-tui";
import type { NavigationKeys } from "./config.ts";
import type { FleetStrip } from "./fleet.ts";

/** Host facts the navigation needs; supplied from public terminal and editor accessors. */
export interface FleetViewHost {
	readonly strip: FleetStrip;
	/** Effective session keys, retained until reload. */
	navigationKeys?(): NavigationKeys;
	/** Active root ids in launch order; the same order the projection renders. */
	activeRunIds(): readonly string[];
	/** The editor draft. Navigation only captures keys while the prompt is empty. */
	editorText(): string;
	/** True when the editor owns input: no dialog, overlay or other component has focus. */
	editorOwnsFocus(): boolean;
	/** Repaint after a view-state change. */
	onViewChanged?(): void;
	/** Open inspection for the selected run. */
	onInspect?(runId: string): void;
}

/**
 * Empty-prompt fleet navigation. The active next key enters selection from a verified empty editor
 * while the management list shows run rows. Previous/next keys move only inside selection; Enter
 * inspects and Escape returns input. Outside selection Pi keeps its keys. A draft, a dialog,
 * an overlay or the end of the last active run ends selection and passes the key on.
 *
 * @returns true when the key was consumed and must not reach the editor.
 */
export function handleFleetInput(host: FleetViewHost, data: string): boolean {
	if (isKeyRelease(data)) return false;
	const runIds = host.activeRunIds();
	const usable =
		host.strip.isListVisible && host.editorOwnsFocus() && host.editorText().length === 0 && runIds.length > 0;
	if (!usable) {
		if (host.strip.isSelecting) {
			host.strip.endSelection();
			host.onViewChanged?.();
		}
		return false;
	}
	const keys = host.navigationKeys?.() ?? host.strip.navigationKeys;
	const down = keys.navigationDownKey !== "off" && matchesKey(data, keys.navigationDownKey as KeyId);
	const up = keys.navigationUpKey !== "off" && matchesKey(data, keys.navigationUpKey as KeyId);
	if (!host.strip.isSelecting) {
		if (!down) return false;
		host.strip.startSelection(runIds[0]);
		host.onViewChanged?.();
		return true;
	}
	const current = host.strip.selection() ?? runIds[0];
	if (up || down) {
		const index = Math.max(0, runIds.indexOf(current));
		const next = up ? Math.max(0, index - 1) : Math.min(runIds.length - 1, index + 1);
		host.strip.select(runIds[next]);
		host.onViewChanged?.();
		return true;
	}
	if (matchesKey(data, "escape")) {
		host.strip.endSelection();
		host.onViewChanged?.();
		return true;
	}
	if (matchesKey(data, "enter")) {
		host.onInspect?.(current);
		return true;
	}
	return false;
}

/**
 * Verify editor ownership through the public focused-component accessor and CustomEditor export.
 * Selectors, overlays and editors outside that contract keep their input.
 */
export function editorOwnsFocus(tui: { getFocusedComponent(): unknown; hasOverlay(): boolean }): boolean {
	try {
		// CustomEditor is the public host editor contract, including supported subclasses.
		return !tui.hasOverlay() && tui.getFocusedComponent() instanceof CustomEditor;
	} catch {
		// Unsupported host focus access must leave keys with Pi.
		return false;
	}
}
