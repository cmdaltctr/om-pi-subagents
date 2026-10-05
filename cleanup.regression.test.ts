import { describe, expect, it } from "vitest";
import { decide, ResultJudge, type Assessment, type FinalFacts } from "./result.ts";

const cleanupEntry = (token: string, error = "descendant process tree cannot be inspected") => ({
	type: "entry_appended",
	entry: { customType: "ompss-cleanup-failed", data: { token, runId: "descendant", error } },
});

describe("cleanup uncertainty survives every result gate", () => {
	it.each<Assessment>(["pending", { ok: false, reason: "provider failed" }, { ok: true, output: "answer" }])(
		"blocks launches after assessment %j and an unconfirmed cleanup",
		(assessment) => {
			const facts: FinalFacts = {
				exit: { code: 1, signal: null },
				persistError: "disk full",
				cleanupError: "ps failed",
			};
			expect(decide(assessment, facts)).toMatchObject({
				state: "failed",
				cleanupFailed: true,
				error: expect.stringContaining("ps failed"),
			});
		},
	);

	it("treats a matching descendant cleanup report as fatal before settlement", () => {
		const judge = new ResultJudge("mine");
		judge.taskAccepted();
		judge.observe(cleanupEntry("mine"));
		expect(judge.assess()).toMatchObject({ ok: false, reason: expect.stringContaining("descendant") });
	});

	it("ignores another run's cleanup report", () => {
		const judge = new ResultJudge("mine");
		judge.taskAccepted();
		judge.observe(cleanupEntry("other"));
		expect(judge.assess()).toBe("pending");
	});
});
