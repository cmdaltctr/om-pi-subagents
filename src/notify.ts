// Terminal result delivery and the status line. Messaging is injected, so the rules are testable
// without a parent Pi session. The persistent fleet strip lives in fleet-widget.ts: this module
// never paints a widget, so result delivery cannot race the presentation layer.

import { plain } from "./plain.ts";
import type { RunView } from "./runs.ts";

export const RESULT_MESSAGE = "omps-result";
/** Most result text put into the parent's conversation. The full text stays in output.md. */
export const MAX_OUTPUT_CHARS = 4000;
/** Agent-name bound for the single-run status line. */
const MAX_NAME_CHARS = 48;

/** Terminal facts a live strip component needs from an interactive host. */
export interface TerminalFacts {
	readonly rows: number;
	requestRender(): void;
	/** Public focus accessors for view navigation; absent where the host exposes none. */
	readonly focus?: { getFocusedComponent(): unknown; hasOverlay(): boolean };
}

/** A live widget component; the host renders, invalidates and disposes it. */
export interface WidgetComponent {
	render(width: number): string[];
	invalidate(): void;
	dispose?(): void;
}

/** Interactive hosts keep a live component; line hosts receive plain lines. */
export type WidgetContent = ((terminal: TerminalFacts) => WidgetComponent) | string[] | undefined;

export interface Messenger {
	send(
		message: { customType: string; content: string; display: boolean; details: unknown },
		options: { deliverAs: "followUp"; triggerTurn: true },
	): Promise<void>;
	/** Absent when the parent has no UI. */
	setStatus?: (text: string | undefined) => void;
	setWidget?: (content: WidgetContent, placement?: "aboveEditor" | "belowEditor") => void;
}

export interface NotifierDeps {
	/** The live owning parent, or nothing once its session has ended. */
	messenger(owner: string): Messenger | undefined;
	readOutput(run: RunView): Promise<string | undefined>;
	directoryFor(run: RunView): string;
	/** Saved apart from the run's result, so a failed delivery never changes it. */
	recordDelivery(run: RunView, result: { delivered: boolean; error?: string }): Promise<void>;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isTerminalState = (state: RunView["state"]) =>
	state === "completed" || state === "failed" || state === "cancelled";

export function createNotifier(deps: NotifierDeps) {
	const notified = new Set<string>();
	/** Active runs per owner; drives the status line only. */
	const active = new Map<string, Map<string, { agent: string; state: RunView["state"] }>>();

	function status(owner: string): string | undefined {
		const runs = [...(active.get(owner)?.values() ?? [])];
		if (!runs.length) return undefined;
		if (runs.length > 1) return `omps: ${runs.length} active runs`;
		return `omps: ${plain(runs[0].agent, MAX_NAME_CHARS)} ${runs[0].state}`;
	}

	function apply(run: RunView): void {
		const messenger = deps.messenger(run.owner);
		if (!messenger) return;
		let session = active.get(run.owner);
		if (!session) {
			session = new Map();
			active.set(run.owner, session);
		}
		if (isTerminalState(run.state)) session.delete(run.id);
		else session.set(run.id, { agent: run.agent, state: run.state });
		try {
			messenger.setStatus?.(status(run.owner));
		} catch {
			/* A status failure must not block delivery. */
		}
	}

	function compose(run: RunView, output: string | undefined): string {
		const directory = deps.directoryFor(run);
		const lines = [`OMPS run ${run.id} (${run.agent}) ${run.state}.`, `Files: ${directory}`];
		if (run.error) lines.push(`Error: ${run.error}`);
		if (output === undefined) lines.push("No output was saved.");
		else
			lines.push(
				"Result:",
				output.length > MAX_OUTPUT_CHARS
					? `${output.slice(0, MAX_OUTPUT_CHARS)}\n[truncated; full text in ${directory}/output.md]`
					: output,
			);
		return lines.join("\n");
	}

	return {
		/** Update the status line from authoritative lifecycle snapshots. */
		onChange(run: RunView): void {
			apply(run);
		},

		/** Send one follow-up for a finished run. A cancelled run sends nothing. Never throws. */
		async onTerminal(run: RunView): Promise<void> {
			if (run.state === "cancelled" || notified.has(run.id)) return;
			notified.add(run.id);
			const record = (result: { delivered: boolean; error?: string }) =>
				deps.recordDelivery(run, result).catch(() => undefined);

			if (!deps.messenger(run.owner)) return record({ delivered: false, error: "the owning session has ended" });
			try {
				// Capture terminal order before a delayed read; the status line cannot stay active.
				apply(run);
				const output = await deps.readOutput(run).catch(() => undefined);
				const messenger = deps.messenger(run.owner);
				if (!messenger) return record({ delivered: false, error: "the owning session has ended" });
				await messenger.send(
					{
						customType: RESULT_MESSAGE,
						content: compose(run, output),
						display: true,
						details: { runId: run.id, state: run.state, directory: deps.directoryFor(run) },
					},
					{ deliverAs: "followUp", triggerTurn: true },
				);
				await record({ delivered: true });
			} catch (error) {
				await record({ delivered: false, error: errorText(error) });
			}
		},
	};
}
