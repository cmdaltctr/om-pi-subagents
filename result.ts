// Terminal-result rules. A run completes only when every gate passes; no single signal proves success.
// `agent_end`, an accepted command, existing output and exit code zero each prove nothing alone.

import { VIOLATION_ENTRY } from "./protocol.ts";
import type { RpcRecord } from "./rpc.ts";
import type { RunOutcome } from "./runs.ts";

export type Assessment = "pending" | { ok: true; output: string } | { ok: false; reason: string };

/** What is known once the child has stopped: how it exited, and whether saving and cleanup worked. */
export interface FinalFacts {
	exit: { code: number | null; signal: NodeJS.Signals | null };
	persistError?: string;
	cleanupError?: string;
}

interface FinalMessage {
	stopReason: string;
	text: string;
	errorMessage?: string;
}

const textOf = (content: unknown): string =>
	Array.isArray(content)
		? content
				.filter((block) => block?.type === "text" && typeof block.text === "string")
				.map((block) => block.text)
				.join("\n")
		: "";

/** Reads a child's RPC records and decides what they prove. Holds the facts; performs no I/O. */
export class ResultJudge {
	private accepted = false;
	private settled = false;
	private fatal: string | undefined;
	private last: FinalMessage | undefined;

	constructor(private readonly token: string) {}

	/** The child acknowledged the task prompt. Earlier records cannot settle a run. */
	taskAccepted(): void {
		this.accepted = true;
	}

	observe(record: RpcRecord): void {
		switch (record.type) {
			case "agent_start":
				this.settled = false;
				break;
			case "agent_settled":
				if (this.accepted) this.settled = true;
				break;
			case "message_end":
				if (record.message?.role === "assistant") {
					this.last = {
						stopReason: record.message.stopReason,
						text: textOf(record.message.content),
						errorMessage: record.message.errorMessage,
					};
				}
				break;
			case "auto_retry_end":
				if (record.success === false) this.fail(`provider failed after retries: ${record.finalError}`);
				break;
			case "extension_error":
				this.fail(`extension error in ${record.event ?? "handler"}: ${record.error}`);
				break;
			case "protocol_error":
				this.fail(`protocol error: ${record.reason}`);
				break;
			case "entry_appended":
				if (record.entry?.customType === VIOLATION_ENTRY && record.entry.data?.token === this.token) {
					this.fail(`permission violation: ${record.entry.data.tool} is not approved`);
				}
				break;
		}
	}

	private fail(reason: string): void {
		this.fatal ??= reason;
	}

	/** What the records prove so far. A fatal error ends the run at once, without waiting for a settle. */
	assess(): Assessment {
		if (this.fatal) return { ok: false, reason: this.fatal };
		if (!this.settled) return "pending";
		const final = this.last;
		if (!final) return { ok: false, reason: "agent settled with no assistant response" };
		switch (final.stopReason) {
			case "stop":
				return final.text.trim() === ""
					? { ok: false, reason: "final assistant message is empty" }
					: { ok: true, output: final.text };
			case "error":
				return { ok: false, reason: `provider error: ${final.errorMessage ?? "unknown"}` };
			case "aborted":
				return { ok: false, reason: "the run was aborted" };
			case "length":
				return { ok: false, reason: "the response was cut off (stop reason length)" };
			default:
				return { ok: false, reason: `the run ended without a final answer (stop reason ${final.stopReason})` };
		}
	}

	/** Latest assistant text, for output that must be labelled partial. */
	partial(): string | undefined {
		return this.last?.text || undefined;
	}
}

const failed = (error: string, cleanupFailed = false): RunOutcome => ({
	state: "failed",
	error,
	...(cleanupFailed && { cleanupFailed }),
});

/** Combine the assessment with the facts gathered at shutdown. The first failing gate names the error. */
export function decide(assessment: Assessment, facts: FinalFacts): RunOutcome {
	if (assessment === "pending") return failed("child exited without a settled result");
	if (!assessment.ok) return failed(assessment.reason);
	if (facts.persistError) return failed(`could not save output: ${facts.persistError}`);
	const { code, signal } = facts.exit;
	if (signal) return failed(`child was killed by ${signal}`);
	if (code !== 0) return failed(`child exited with code ${code}`);
	if (facts.cleanupError) return failed(`cleanup failed: ${facts.cleanupError}`, true);
	return { state: "completed" };
}
