import { describe, expect, it } from "vitest";
import { RunPanel, MAX_PREVIEW_CHARS } from "./panel.ts";
import type { RunView } from "./runs.ts";

const run = (overrides: Partial<RunView> = {}): RunView => ({
	id: "r1",
	owner: "s1",
	agent: "reader",
	cwd: "/w",
	state: "starting",
	startedAt: 1,
	...overrides,
});
const start = (toolCallId: string, toolName = "read") => ({ type: "tool_execution_start", toolCallId, toolName });
const end = (toolCallId: string) => ({ type: "tool_execution_end", toolCallId });

describe("run panel", () => {
	it("uses the latest lifecycle state while task progress carries the original snapshot", () => {
		const panel = new RunPanel();
		panel.onChange(run());
		panel.onChange(run({ state: "running" }));
		panel.onProgress(run(), start("a"));
		expect(panel.render()).toEqual(["OMPSS: reader running (r1)", "Tools: read"]);
	});

	it("keeps a tool that started before prompt acknowledgement when the run becomes running", () => {
		const panel = new RunPanel();
		panel.onChange(run());
		panel.onProgress(run(), start("a", "bash"));
		panel.onChange(run({ state: "running" }));
		expect(panel.render()).toEqual(["OMPSS: reader running (r1)", "Tools: bash"]);
	});

	it("matches concurrent and nested calls by identifier, including repeated names", () => {
		const panel = new RunPanel();
		panel.onChange(run());
		panel.onProgress(run(), start("a", "outer"));
		panel.onProgress(run(), start("a/1", "read"));
		panel.onProgress(run(), start("b", "read"));
		panel.onProgress(run(), end("a"));
		expect(panel.render()).toEqual(["OMPSS: reader starting (r1)", "Tools: read, read"]);
		panel.onProgress(run(), end("a/1"));
		expect(panel.render()).toEqual(["OMPSS: reader starting (r1)", "Tools: read"]);
		panel.onProgress(run(), end("unknown"));
		expect(panel.render()).toEqual(["OMPSS: reader starting (r1)", "Tools: read"]);
		panel.onProgress(run(), end("b"));
		expect(panel.render()).toEqual(["OMPSS: reader starting (r1)"]);
	});

	it("ignores invalid, unrelated, foreign and stale events", () => {
		const panel = new RunPanel();
		panel.onChange(run());
		for (const event of [
			null,
			{},
			start(""),
			start("a", ""),
			{ ...start("a"), toolName: 12 },
			{ type: "tool_execution_update", toolCallId: "a", toolName: "read" },
		])
			panel.onProgress(run(), event);
		panel.onProgress(run({ owner: "foreign" }), start("b", "foreign"));
		panel.onProgress(run({ id: "old" }), start("c", "stale"));
		expect(panel.render()).toEqual(["OMPSS: reader starting (r1)"]);
	});

	it.each(["completed", "failed", "cancelled"] as const)("retains %s and clears active calls", (state) => {
		const panel = new RunPanel();
		panel.onChange(run());
		panel.onProgress(run(), start("a", "bash"));
		panel.onChange(run({ state }));
		panel.onProgress(run(), start("late", "read"));
		expect(panel.render()).toEqual([`OMPSS: reader ${state} (r1)`]);
	});

	it("bounds the preview, labels failed output partial and resets on the next run", () => {
		const panel = new RunPanel();
		panel.onChange(run({ state: "failed" }));
		panel.setPreview(run({ state: "failed" }), "x".repeat(MAX_PREVIEW_CHARS * 4));
		const text = panel.render().join("\n");
		expect(text).toContain("Partial output:");
		expect(text.length).toBeLessThan(MAX_PREVIEW_CHARS + 100);
		panel.onChange(run({ id: "r2" }));
		panel.setPreview(run({ state: "failed" }), "old output");
		expect(panel.render()).toEqual(["OMPSS: reader starting (r2)"]);
	});

	it("renders safe plain text without arguments or result bodies", () => {
		const panel = new RunPanel();
		panel.onChange(run({ agent: "reader\x1b[2J\x1b]8;;https://evil\x07name\x1b]8;;\x07" }));
		panel.onProgress(run(), { ...start("a", "read\x1b[31m\r\n\x00"), args: { token: "SECRET" } });
		expect(panel.render().join("\n")).not.toContain("SECRET");
		panel.onChange(run({ state: "completed" }));
		panel.setPreview(run({ state: "completed" }), "answer\x1b[2J\x9b31m\x1b]0;evil\x07\u202e\r\nline");
		const text = panel.render().join("\n");
		expect(text).toContain("answer");
		expect(text).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202e]/);
		expect(text).not.toContain("evil");
	});

	it("keeps the tool display compact", () => {
		const panel = new RunPanel();
		panel.onChange(run());
		for (let i = 0; i < 20; i++) panel.onProgress(run(), start(String(i), "x".repeat(1000)));
		expect(panel.render()).toHaveLength(2);
		expect(panel.render().join("\n").length).toBeLessThan(400);
	});
});
