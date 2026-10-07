import { isKeyRelease, matchesKey } from "@earendil-works/pi-tui";
import type { FleetStrip } from "./fleet.ts";

/** Host facts the navigation needs; supplied from public terminal and editor accessors. */
export interface FleetViewHost {
	readonly strip: FleetStrip;
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
 * Empty-prompt fleet navigation. Down from an empty, focused editor enters selection mode when the
 * expanded strip shows run rows. Only inside selection do Up, Down, Enter and Escape belong to the
 * fleet; outside it Up keeps Pi's prompt history and Escape keeps Pi's interrupt. A draft, a dialog,
 * an overlay or the end of the last active run ends selection and passes the key on.
 *
 * @returns true when the key was consumed and must not reach the editor.
 */
export function handleFleetInput(host: FleetViewHost, data: string): boolean {
	if (isKeyRelease(data)) return false;
	const runIds = host.activeRunIds();
	const usable = host.strip.isExpanded && host.editorOwnsFocus() && host.editorText().length === 0 && runIds.length > 0;
	if (!usable) {
		if (host.strip.isSelecting) {
			host.strip.endSelection();
			host.onViewChanged?.();
		}
		return false;
	}
	if (!host.strip.isSelecting) {
		if (!matchesKey(data, "down")) return false;
		host.strip.startSelection(runIds[0]);
		host.onViewChanged?.();
		return true;
	}
	const current = host.strip.selection() ?? runIds[0];
	if (matchesKey(data, "up") || matchesKey(data, "down")) {
		const index = Math.max(0, runIds.indexOf(current));
		const next = matchesKey(data, "up") ? Math.max(0, index - 1) : Math.min(runIds.length - 1, index + 1);
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
 * Whether the host editor owns input right now, using the public focused-component accessor and
 * overlay state. A dialog or overlay owning focus means fleet keys must pass through.
 */
export function editorOwnsFocus(tui: { getFocusedComponent(): unknown; hasOverlay(): boolean }): boolean {
	return tui.getFocusedComponent() !== null && !tui.hasOverlay();
}
