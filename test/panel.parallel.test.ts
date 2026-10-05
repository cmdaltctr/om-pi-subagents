import { describe, expect, it, vi } from "vitest";
import { RunPanel } from "../panel.ts";
import { createNotifier } from "../notify.ts";
import type { RunView } from "../runs.ts";

const run = (id: string, state: RunView["state"] = "starting", owner = "parent"): RunView => ({
	id,
	owner,
	state,
	agent: `agent-${id}`,
	cwd: "/work",
	startedAt: 1,
});
const start = (toolName: string) => ({ type: "tool_execution_start", toolCallId: "same", toolName });
const end = { type: "tool_execution_end", toolCallId: "same" };

function notifications() {
	const setWidget = vi.fn();
	const setStatus = vi.fn();
	const send = vi.fn(async () => undefined);
	const recordDelivery = vi.fn(async (_view: RunView, _result: { delivered: boolean; error?: string }) => undefined);
	const reads = new Map<string, (text: string) => void>();
	const notifier = createNotifier({
		messenger: (owner) => (owner === "parent" ? { setWidget, setStatus, send } : undefined),
		readOutput: (view) => new Promise<string>((done) => reads.set(view.id, done)),
		directoryFor: () => "/runs",
		recordDelivery,
	});
	return { notifier, setWidget, setStatus, send, recordDelivery, reads };
}

describe("parallel run display", () => {
	it("keeps each run id, state and matching tool calls separate", () => {
		const panel = new RunPanel();
		panel.onChange(run("first"));
		panel.onChange(run("second", "running"));
		panel.onProgress(run("first"), start("read"));
		panel.onProgress(run("second"), start("write"));
		panel.onProgress(run("second"), end);
		const lines = panel.render().join("\n");
		expect(lines).toContain("(first)");
		expect(lines).toContain("agent-first starting");
		expect(lines).toContain("agent-second running");
		expect(lines).toContain("Tools: read");
		expect(lines).not.toContain("Tools: write");
	});

	it("bounds the active display without hiding run ownership from admission", () => {
		const panel = new RunPanel();
		for (let id = 0; id < 7; id++) panel.onChange(run(String(id)));
		const lines = panel.render();
		expect(lines.filter((line) => line.startsWith("OMPSS:"))).toHaveLength(4);
		expect(lines.join("\n")).toContain("3 additional active runs");
		panel.onChange(run("0", "completed"));
		expect(panel.render().join("\n")).toContain("agent-4");
	});

	it("retains the latest terminal summary after out-of-order completions and drops expired progress", () => {
		const panel = new RunPanel();
		panel.onChange(run("first"));
		panel.onChange(run("second"));
		panel.onChange(run("second", "completed"));
		panel.setPreview(run("second", "completed"), "SECOND ANSWER");
		expect(panel.render().join("\n")).toContain("agent-first starting");
		expect(panel.render().join("\n")).not.toContain("SECOND ANSWER");
		panel.onChange(run("first", "failed"));
		panel.setPreview(run("first", "failed"), "FIRST PARTIAL");
		panel.setPreview(run("second", "completed"), "LATE SECOND ANSWER");
		panel.onProgress(run("first"), start("late-tool"));
		expect(panel.render().join("\n")).toContain("agent-first failed");
		expect(panel.render().join("\n")).toContain("Partial output: FIRST PARTIAL");
		expect(panel.render().join("\n")).not.toMatch(/late-tool|SECOND ANSWER/);
	});

	it("preserves an active sibling's widget and status during a delayed result read", async () => {
		const h = notifications();
		h.notifier.onChange(run("first", "running"));
		h.notifier.onChange(run("second", "running"));
		h.notifier.onChange(run("first", "completed"));
		const pending = h.notifier.onTerminal(run("first", "completed"));
		h.reads.get("first")!("FIRST ANSWER");
		await pending;
		expect(h.setWidget.mock.lastCall?.[0].join("\n")).toContain("agent-second running");
		expect(h.setStatus.mock.lastCall?.[0]).toBe("ompss: agent-second running");
		expect(h.recordDelivery).toHaveBeenCalledWith(run("first", "completed"), { delivered: true });
	});

	it("delivers both results separately when previews arrive in reverse order", async () => {
		const h = notifications();
		h.notifier.onChange(run("first"));
		h.notifier.onChange(run("second"));
		h.notifier.onChange(run("first", "completed"));
		const first = h.notifier.onTerminal(run("first", "completed"));
		h.notifier.onChange(run("second", "completed"));
		const second = h.notifier.onTerminal(run("second", "completed"));
		h.reads.get("second")!("SECOND ANSWER");
		await second;
		h.reads.get("first")!("FIRST ANSWER");
		await first;
		// A later redraw must also retain the latest preview, not merely the previously rendered text.
		h.notifier.onChange(run("second", "completed"));
		expect(h.setWidget.mock.lastCall?.[0].join("\n")).toContain("SECOND ANSWER");
		expect(h.setWidget.mock.lastCall?.[0].join("\n")).not.toContain("FIRST ANSWER");
		expect(h.send).toHaveBeenCalledTimes(2);
		expect(h.recordDelivery.mock.calls.map(([view]) => view.id).sort()).toEqual(["first", "second"]);
	});
});
