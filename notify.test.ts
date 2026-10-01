import { describe, expect, it, vi } from "vitest";
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

describe("panel delivery", () => {
	function panelSetup() {
		let owner: string | undefined = "s1";
		const setWidget = vi.fn();
		const setStatus = vi.fn();
		const send = vi.fn(async () => undefined);
		const readOutput = vi.fn(async (_run: RunView): Promise<string | undefined> => "THE ANSWER");
		const recordDelivery = vi.fn(async () => undefined);
		const notifier = createNotifier({
			messenger: (requestedOwner = "s1") => (requestedOwner === owner ? { send, setWidget, setStatus } : undefined),
			readOutput,
			recordDelivery,
			directoryFor: () => "/files",
		});
		return {
			notifier,
			setWidget,
			setStatus,
			send,
			readOutput,
			recordDelivery,
			bind: (next: string | undefined) => {
				owner = next;
			},
		};
	}

	it("keeps completed output visible and reads it once for both delivery paths", async () => {
		const h = panelSetup();
		h.notifier.onChange(view({ state: "running" }));
		h.notifier.onChange(view());
		await h.notifier.onTerminal(view());
		expect(h.setWidget.mock.lastCall?.[0].join("\n")).toContain("completed");
		expect(h.setWidget.mock.lastCall?.[0].join("\n")).toContain("THE ANSWER");
		expect(h.send).toHaveBeenCalledTimes(1);
		expect(h.readOutput).toHaveBeenCalledTimes(1);
	});

	it.each(["failed", "cancelled"] as const)("retains %s and preserves cancellation delivery rules", async (state) => {
		const h = panelSetup();
		h.notifier.onChange(view({ state }));
		await h.notifier.onTerminal(view({ state }));
		const text = h.setWidget.mock.lastCall?.[0].join("\n") ?? "";
		expect(text).toContain(state);
		if (state === "failed") expect(text).toContain("Partial output:");
		else {
			expect(h.send).not.toHaveBeenCalled();
			expect(h.readOutput).not.toHaveBeenCalled();
		}
	});

	it("keeps the final state when output cannot be read", async () => {
		const h = panelSetup();
		h.readOutput.mockRejectedValue(new Error("disk unavailable"));
		h.notifier.onChange(view());
		await h.notifier.onTerminal(view());
		expect(h.setWidget.mock.lastCall?.[0]).toEqual(["OMPSS: reader completed"]);
		expect(h.send).toHaveBeenCalledTimes(1);
	});

	it("drops foreign progress and uses the latest lifecycle snapshot for tools", () => {
		const h = panelSetup();
		h.notifier.onChange(view({ state: "running" }));
		const count = h.setWidget.mock.calls.length;
		h.notifier.onChange(view({ owner: "other" }));
		h.notifier.onProgress(view({ owner: "other" }), {
			type: "tool_execution_start",
			toolCallId: "x",
			toolName: "evil",
		});
		expect(h.setWidget).toHaveBeenCalledTimes(count);
		h.notifier.onProgress(view({ state: "starting" }), {
			type: "tool_execution_start",
			toolCallId: "a",
			toolName: "read",
		});
		expect(h.setWidget.mock.lastCall?.[0].join("\n")).toContain("reader running");
		expect(h.setWidget.mock.lastCall?.[0]).toEqual(["OMPSS: reader running", "Tools: read"]);
	});

	it("does not let an old preview replace a newer run", async () => {
		const h = panelSetup();
		let release!: (text: string) => void;
		h.readOutput.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		h.notifier.onChange(view());
		const pending = h.notifier.onTerminal(view());
		h.notifier.onChange(view({ id: "run-2", state: "starting" }));
		release("OLD OUTPUT");
		await pending;
		expect(h.setWidget.mock.lastCall?.[0]).toEqual(["OMPSS: reader starting"]);
	});

	it.each([undefined, "replacement"])("rechecks ownership after an output read when owner becomes %s", async (next) => {
		const h = panelSetup();
		let release!: (text: string) => void;
		h.readOutput.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		h.notifier.onChange(view());
		const pending = h.notifier.onTerminal(view());
		const count = h.setWidget.mock.calls.length;
		h.bind(next);
		release("OLD OUTPUT");
		await pending;
		expect(h.setWidget).toHaveBeenCalledTimes(count);
		expect(h.send).not.toHaveBeenCalled();
		expect(h.recordDelivery).toHaveBeenCalledWith(view(), { delivered: false, error: "the owning session has ended" });
	});

	it.each(["setStatus", "setWidget"] as const)("contains a throwing %s callback independently", async (callback) => {
		const h = panelSetup();
		h[callback].mockImplementation(() => {
			throw new Error("UI failed");
		});
		expect(() => h.notifier.onChange(view({ state: "running" }))).not.toThrow();
		await expect(h.notifier.onTerminal(view())).resolves.toBeUndefined();
		expect(h.send).toHaveBeenCalledTimes(1);
		expect(h.setWidget).toHaveBeenCalled();
		expect(h.setStatus).toHaveBeenCalled();
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
