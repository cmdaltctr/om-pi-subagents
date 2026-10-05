// Terminal notifications and the status line. Messaging is injected, so the rules are testable
// without a parent Pi session.

import type { RunView } from "./runs.ts";
import { RunPanel } from "./panel.ts";

export const RESULT_MESSAGE = "ompss-result";
/** Most result text put into the parent's conversation. The full text stays in output.md. */
export const MAX_OUTPUT_CHARS = 4000;

export interface Messenger {
	send(
		message: { customType: string; content: string; display: boolean; details: unknown },
		options: { deliverAs: "followUp"; triggerTurn: true },
	): Promise<void>;
	/** Absent when the parent has no UI. */
	setStatus?: (text: string | undefined) => void;
	setWidget?: (lines: string[] | undefined) => void;
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

export function createNotifier(deps: NotifierDeps) {
	const notified = new Set<string>();
	const panel = new RunPanel();

	function draw(run: RunView): void {
		if (!panel.matches(run)) return;
		try {
			deps.messenger(run.owner)?.setStatus?.(panel.status(run.owner));
		} catch {
			/* A status failure must not block the widget. */
		}
		try {
			deps.messenger(run.owner)?.setWidget?.(panel.render(run.owner));
		} catch {
			/* Display failures do not change the run. */
		}
	}

	function compose(run: RunView, output: string | undefined): string {
		const directory = deps.directoryFor(run);
		const lines = [`OMPSS run ${run.id} (${run.agent}) ${run.state}.`, `Files: ${directory}`];
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
		/** Send one follow-up for a finished run. A cancelled run sends nothing. Never throws. */
		async onTerminal(run: RunView): Promise<void> {
			if (run.state === "cancelled" || notified.has(run.id)) return;
			notified.add(run.id);
			const record = (result: { delivered: boolean; error?: string }) =>
				deps.recordDelivery(run, result).catch(() => undefined);

			if (!deps.messenger(run.owner)) return record({ delivered: false, error: "the owning session has ended" });
			try {
				// Capture terminal order before a delayed read; previews cannot choose the idle summary.
				panel.onChange(run);
				const output = await deps.readOutput(run).catch(() => undefined);
				const messenger = deps.messenger(run.owner);
				if (!messenger) return record({ delivered: false, error: "the owning session has ended" });
				panel.setPreview(run, output);
				draw(run);
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

		/** Update the panel from authoritative lifecycle snapshots. */
		onChange(run: RunView): void {
			if (!deps.messenger(run.owner)) return;
			panel.onChange(run);
			draw(run);
		},

		/** Task metadata must not replace a newer lifecycle snapshot. */
		onProgress(run: RunView, record: unknown): void {
			if (!deps.messenger(run.owner) || !panel.matches(run)) return;
			panel.onProgress(run, record);
			try {
				// nosemgrep: AIK_js_tainted_express_render -- This is RunPanel's sanitised string-array renderer, not an Express template or executable expression.
				deps.messenger(run.owner)?.setWidget?.(panel.render(run.owner));
			} catch {
				/* Supervision continues. */
			}
		},
	};
}
