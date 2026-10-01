// Terminal notifications and the status line. Messaging is injected, so the rules are testable
// without a parent Pi session.

import { isTerminal, type RunView } from "./runs.ts";

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
}

export interface NotifierDeps {
	/** The live owning parent, or nothing once its session has ended. */
	messenger(): Messenger | undefined;
	readOutput(run: RunView): Promise<string | undefined>;
	directoryFor(run: RunView): string;
	/** Saved apart from the run's result, so a failed delivery never changes it. */
	recordDelivery(run: RunView, result: { delivered: boolean; error?: string }): Promise<void>;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function createNotifier(deps: NotifierDeps) {
	const notified = new Set<string>();

	async function compose(run: RunView): Promise<string> {
		const directory = deps.directoryFor(run);
		const lines = [`OMPSS run ${run.id} (${run.agent}) ${run.state}.`, `Files: ${directory}`];
		if (run.error) lines.push(`Error: ${run.error}`);
		const output = await deps.readOutput(run).catch(() => undefined);
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

			const messenger = deps.messenger();
			if (!messenger) return record({ delivered: false, error: "the owning session has ended" });
			try {
				await messenger.send(
					{
						customType: RESULT_MESSAGE,
						content: await compose(run),
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

		/** Show the active run in the status line, and clear it when the run ends. */
		onChange(run: RunView): void {
			deps.messenger()?.setStatus?.(isTerminal(run.state) ? undefined : `ompss: ${run.agent} ${run.state}`);
		},
	};
}
