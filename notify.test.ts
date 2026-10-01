import { describe, expect, it } from "vitest";
import { createNotifier, MAX_OUTPUT_CHARS, RESULT_MESSAGE } from "./notify.ts";
import type { RunView } from "./runs.ts";

const view = (overrides: Partial<RunView> = {}): RunView => ({
	id: "run-1",
	owner: "s1",
	agent: "reader",
	cwd: "/w",
	state: "completed",
	startedAt: 1,
	endedAt: 2,
	...overrides,
});

function setup(
	options: { output?: string | undefined; send?: () => Promise<void>; bound?: boolean; ui?: boolean } = {},
) {
	const sent: Array<{ message: any; options: any }> = [];
	const delivery: Array<{ id: string; result: unknown }> = [];
	const statuses: Array<string | undefined> = [];
	const notifier = createNotifier({
		messenger: () =>
			options.bound === false
				? undefined
				: {
						send: async (message, sendOptions) => {
							await options.send?.();
							sent.push({ message, options: sendOptions });
						},
						setStatus: options.ui === false ? undefined : (text) => statuses.push(text),
					},
		readOutput: async () => ("output" in options ? options.output : "THE ANSWER"),
		directoryFor: (run) => `/files/${run.id}`,
		recordDelivery: async (run, result) => void delivery.push({ id: run.id, result }),
	});
	return { notifier, sent, delivery, statuses };
}

describe("terminal notification", () => {
	it("sends one follow-up that wakes an idle parent or queues behind a busy one", async () => {
		const { notifier, sent } = setup();
		await notifier.onTerminal(view());
		expect(sent).toHaveLength(1);
		expect(sent[0].options).toEqual({ deliverAs: "followUp", triggerTurn: true });
		expect(sent[0].message).toMatchObject({ customType: RESULT_MESSAGE, display: true });
	});

	it("carries the state, agent, result and file path for a completed run", async () => {
		const { notifier, sent } = setup();
		await notifier.onTerminal(view());
		const { content, details } = sent[0].message;
		for (const part of ["completed", "reader", "run-1", "THE ANSWER", "/files/run-1"])
			expect(content, part).toContain(part);
		expect(details).toMatchObject({ runId: "run-1", state: "completed", directory: "/files/run-1" });
	});

	it("carries the error and any partial output for a failed run", async () => {
		const { notifier, sent } = setup({ output: "> PARTIAL OUTPUT. half" });
		await notifier.onTerminal(view({ state: "failed", error: "permission violation: write is not approved" }));
		expect(sent[0].message.content).toMatch(/failed/);
		expect(sent[0].message.content).toContain("permission violation: write is not approved");
		expect(sent[0].message.content).toContain("PARTIAL OUTPUT");
	});

	it("says when no output was saved", async () => {
		const { notifier, sent } = setup({ output: undefined });
		await notifier.onTerminal(view({ state: "failed", error: "boom" }));
		expect(sent[0].message.content).toMatch(/no output/i);
	});

	it("sends nothing for a cancelled run", async () => {
		const { notifier, sent, delivery } = setup();
		await notifier.onTerminal(view({ state: "cancelled" }));
		expect(sent).toEqual([]);
		expect(delivery).toEqual([]);
	});

	it("sends at most one notification per run", async () => {
		const { notifier, sent } = setup();
		await notifier.onTerminal(view());
		await notifier.onTerminal(view());
		expect(sent).toHaveLength(1);
	});

	it("truncates a long result and points to the file", async () => {
		const { notifier, sent } = setup({ output: "x".repeat(MAX_OUTPUT_CHARS * 3) });
		await notifier.onTerminal(view());
		const content: string = sent[0].message.content;
		expect(content.length).toBeLessThan(MAX_OUTPUT_CHARS + 600);
		expect(content).toMatch(/truncated.*\/files\/run-1\/output\.md/s);
	});
});

describe("delivery record", () => {
	it("records success separately from the run result", async () => {
		const { notifier, delivery } = setup();
		await notifier.onTerminal(view());
		expect(delivery).toEqual([{ id: "run-1", result: { delivered: true } }]);
	});

	it("records a failed delivery without throwing", async () => {
		const { notifier, delivery } = setup({ send: async () => Promise.reject(new Error("parent is gone")) });
		await expect(notifier.onTerminal(view())).resolves.toBeUndefined();
		expect(delivery).toEqual([{ id: "run-1", result: { delivered: false, error: "parent is gone" } }]);
	});

	it("does not send, and records why, when the owning session has ended", async () => {
		const { notifier, sent, delivery } = setup({ bound: false });
		await notifier.onTerminal(view());
		expect(sent).toEqual([]);
		expect(delivery).toEqual([{ id: "run-1", result: { delivered: false, error: "the owning session has ended" } }]);
	});

	it("survives a failing record writer", async () => {
		const notifier = createNotifier({
			messenger: () => ({ send: async () => undefined }),
			readOutput: async () => "x",
			directoryFor: () => "/d",
			recordDelivery: async () => Promise.reject(new Error("disk full")),
		});
		await expect(notifier.onTerminal(view())).resolves.toBeUndefined();
	});
});

describe("status line", () => {
	it("shows the active run and clears when it ends", () => {
		const { notifier, statuses } = setup();
		notifier.onChange(view({ state: "starting" }));
		notifier.onChange(view({ state: "running" }));
		notifier.onChange(view({ state: "stopping" }));
		notifier.onChange(view({ state: "completed" }));
		expect(statuses).toEqual(["ompss: reader starting", "ompss: reader running", "ompss: reader stopping", undefined]);
	});

	it("does nothing when there is no UI", () => {
		const { notifier, statuses } = setup({ ui: false });
		notifier.onChange(view({ state: "running" }));
		expect(statuses).toEqual([]);
	});

	it("does nothing when the session has ended", () => {
		const { notifier, statuses } = setup({ bound: false });
		notifier.onChange(view({ state: "running" }));
		expect(statuses).toEqual([]);
	});
});
