// Terminal-result rules, driven by synthetic RPC records. No process involved.
import { describe, expect, it } from "vitest";
import { VIOLATION_ENTRY } from "../protocol.ts";
import type { RpcRecord } from "../rpc.ts";
import { decide, ResultJudge, type Assessment, type FinalFacts } from "../result.ts";

const TOKEN = "tok";

const assistant = (text: string, stopReason = "stop", extra: object = {}): RpcRecord => ({
	type: "message_end",
	message: { role: "assistant", stopReason, content: text === "" ? [] : [{ type: "text", text }], ...extra },
});
const settled: RpcRecord = { type: "agent_settled" };

/** Feed records to a judge whose task was accepted. */
function judged(...records: RpcRecord[]): ResultJudge {
	const judge = new ResultJudge(TOKEN);
	judge.taskAccepted();
	for (const record of records) judge.observe(record);
	return judge;
}

const good: FinalFacts = { exit: { code: 0, signal: null } };

describe("assessment", () => {
	it("is pending until the agent settles", () => {
		expect(judged({ type: "agent_start" }, assistant("answer")).assess()).toBe("pending");
	});

	it("is ok after a final `stop` message and agent_settled, and returns the text", () => {
		const assessment = judged(
			{ type: "agent_start" },
			assistant("all done"),
			{ type: "agent_end", willRetry: false },
			settled,
		).assess();
		expect(assessment).toEqual({ ok: true, output: "all done" });
	});

	it("joins text blocks and ignores thinking and tool-call blocks", () => {
		const message = {
			type: "message_end",
			message: {
				role: "assistant",
				stopReason: "stop",
				content: [
					{ type: "thinking", thinking: "hmm" },
					{ type: "text", text: "one" },
					{ type: "toolCall", name: "x" },
					{ type: "text", text: "two" },
				],
			},
		};
		expect(judged(message, settled).assess()).toEqual({ ok: true, output: "one\ntwo" });
	});

	it("does not count agent_end or a user message as completion", () => {
		const user = { type: "message_end", message: { role: "user", content: "hi" } };
		expect(judged(user, { type: "agent_end", willRetry: false }).assess()).toBe("pending");
		expect(judged(user, settled).assess()).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/no assistant response/),
		});
	});

	it("ignores a settle seen before the task was accepted", () => {
		const judge = new ResultJudge(TOKEN);
		judge.observe(assistant("early"));
		judge.observe(settled);
		expect(judge.assess()).toBe("pending");
	});

	it("goes back to pending when another run starts after a settle", () => {
		expect(judged(assistant("first"), settled, { type: "agent_start" }).assess()).toBe("pending");
	});

	it.each([
		["an empty final message", assistant(""), /empty/],
		["a cut-off response", assistant("partial", "length"), /cut off/],
		["an aborted run", assistant("partial", "aborted"), /aborted/],
		["a turn that ended on a tool call", assistant("calling", "toolUse"), /without a final answer/],
		["a provider error", assistant("", "error", { errorMessage: "529 overloaded" }), /provider error: 529 overloaded/],
	])("fails on %s", (_label, final, reason) => {
		const assessment = judged(final, settled).assess() as Exclude<Assessment, "pending">;
		expect(assessment.ok).toBe(false);
		expect((assessment as { reason: string }).reason).toMatch(reason);
	});

	it("fails when the agent settles with no assistant message at all", () => {
		expect(judged(settled).assess()).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/no assistant response/),
		});
	});
});

describe("fatal errors take precedence over output", () => {
	it("keeps a run failed when an extension handler error is followed by a good answer", () => {
		const judge = judged(
			{ type: "extension_error", event: "tool_call", error: "guard threw" },
			assistant("a fine answer"),
			settled,
		);
		expect(judge.assess()).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/extension error in tool_call: guard threw/),
		});
		expect(judge.partial()).toBe("a fine answer");
	});

	it("fails on a permission violation recorded by the guard, before the agent settles", () => {
		const judge = judged({
			type: "entry_appended",
			entry: { customType: VIOLATION_ENTRY, data: { token: TOKEN, tool: "write" } },
		});
		expect(judge.assess()).toMatchObject({ ok: false, reason: expect.stringMatching(/permission violation: write/) });
	});

	it("fails on a prompt the guard refused, and names its source", () => {
		const judge = judged({
			type: "entry_appended",
			entry: { customType: VIOLATION_ENTRY, data: { token: TOKEN, input: "extension" } },
		});
		expect(judge.assess()).toMatchObject({
			ok: false,
			reason: "permission violation: a prompt from extension was refused",
		});
	});

	it("ignores a violation entry that carries another run's token", () => {
		const judge = judged({
			type: "entry_appended",
			entry: { customType: VIOLATION_ENTRY, data: { token: "other", tool: "write" } },
		});
		expect(judge.assess()).toBe("pending");
	});

	it("fails on a protocol error", () => {
		expect(judged({ type: "protocol_error", reason: "malformed JSON record" }).assess()).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/protocol error: malformed JSON record/),
		});
	});

	it("reports the first fatal error", () => {
		const judge = judged(
			{ type: "extension_error", event: "a", error: "first" },
			{ type: "protocol_error", reason: "second" },
		);
		expect((judge.assess() as { reason: string }).reason).toMatch(/first/);
	});
});

describe("provider retries", () => {
	const erroring = assistant("", "error", { errorMessage: "529 overloaded" });
	const retry = [
		{ type: "auto_retry_start", attempt: 1, errorMessage: "529 overloaded" },
		{ type: "agent_end", willRetry: true },
	];

	it("lets a run complete when a retry later succeeds", () => {
		const judge = judged(
			{ type: "agent_start" },
			erroring,
			...retry,
			{ type: "auto_retry_end", success: true, attempt: 2 },
			{ type: "agent_start" },
			assistant("recovered"),
			settled,
		);
		expect(judge.assess()).toEqual({ ok: true, output: "recovered" });
	});

	it("stays pending while a retry is scheduled, even after agent_end", () => {
		expect(judged(erroring, ...retry).assess()).toBe("pending");
	});

	it("fails when the retries run out", () => {
		const judge = judged(
			erroring,
			...retry,
			{ type: "auto_retry_end", success: false, finalError: "529 overloaded" },
			settled,
		);
		expect(judge.assess()).toMatchObject({
			ok: false,
			reason: expect.stringMatching(/provider failed after retries: 529 overloaded/),
		});
	});
});

describe("decide: every gate must pass", () => {
	const ok: Assessment = { ok: true, output: "answer" };

	it("completes only when the answer, the saved output, the exit and the cleanup all succeed", () => {
		expect(decide(ok, good)).toEqual({ state: "completed" });
	});

	it("fails when the child exits without settling, even with exit code zero", () => {
		expect(decide("pending", good)).toEqual({ state: "failed", error: "child exited without a settled result" });
	});

	it("fails when the output could not be saved", () => {
		expect(decide(ok, { ...good, persistError: "disk full" })).toEqual({
			state: "failed",
			error: "could not save output: disk full",
		});
	});

	it.each([
		[{ code: 1, signal: null }, /exited with code 1/],
		[{ code: null, signal: "SIGKILL" as const }, /killed by SIGKILL/],
	])("fails when the child's exit is not clean: %j", (exit, reason) => {
		const outcome = decide(ok, { ...good, exit });
		expect(outcome.state).toBe("failed");
		expect(outcome.error).toMatch(reason);
	});

	it("fails when cleanup cannot be confirmed", () => {
		expect(decide(ok, { ...good, cleanupError: "process group 99 still alive" })).toEqual({
			state: "failed",
			error: "cleanup failed: process group 99 still alive",
			cleanupFailed: true,
		});
	});

	it("reports the protocol-level failure before later gates", () => {
		expect(decide({ ok: false, reason: "extension error" }, { ...good, persistError: "disk full" })).toEqual({
			state: "failed",
			error: "extension error",
		});
	});
});
