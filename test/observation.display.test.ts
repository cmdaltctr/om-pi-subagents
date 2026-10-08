import { describe, expect, it, vi } from "vitest";
import { ObservationStore } from "../src/observation.ts";
import { parseObservation } from "../src/observation-validation.ts";
import { ObservationRelay } from "../src/observation-relay.ts";
import { TransportObservationStore } from "../src/observation-transport.ts";
import { OBSERVATION_ENTRY } from "../src/protocol.ts";
import type { RpcRecord } from "../src/rpc.ts";
import type { RunView } from "../src/runs.ts";

const root: RunView = {
	id: "direct",
	owner: "root",
	agent: "delegator",
	cwd: "/work",
	state: "running",
	startedAt: 1,
	nesting: { registryPath: "/registry.yaml", depth: 1, maxDepth: 4, rootSessionId: "root" },
};

const base = {
	owner: "child-session",
	rootSessionId: "root",
	runId: "descendant",
	parentRunId: "direct",
	depth: 2,
	agent: "writer",
	state: "running",
	revision: 1,
	startedAt: 2,
	activeTools: [],
};

function channel() {
	let listener: ((value: RpcRecord) => void) | undefined;
	return {
		onRecord: (callback: (value: RpcRecord) => void) => {
			listener = callback;
			return () => {
				listener = undefined;
			};
		},
		request: async () => ({ success: true, data: { sessionId: "child-session" } }),
		emit: (value: RpcRecord) => listener?.(value),
	};
}

const assistant = (text: string): RpcRecord => ({
	type: "message_end",
	message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text }] },
});

describe("display-text validation", () => {
	it("retains optional task summaries and assistant previews", () => {
		const parsed = parseObservation({
			...base,
			taskSummary: "Map the validation module",
			assistantPreview: "Reading the module now",
		});
		expect(parsed?.snapshot.taskSummary).toBe("Map the validation module");
		expect(parsed?.snapshot.assistantPreview).toBe("Reading the module now");
	});

	it("preserves preview Markdown line breaks and indentation while flattening task labels", () => {
		const markdown = "    indented code\n\n# Heading\n- first\n- second\n\n```ts\n  run();\n```";
		const parsed = parseObservation({ ...base, taskSummary: "First\nsecond", assistantPreview: markdown });
		expect(parsed?.snapshot.assistantPreview).toBe(markdown);
		expect(parsed?.snapshot.taskSummary).toBe("First second");
	});

	it("sanitises multiline preview controls and normalises carriage returns", () => {
		const parsed = parseObservation({
			...base,
			assistantPreview: "# Heading\r\n- \u001b[2Jfirst\u0007\r- second\u202e\n```\n\tcode\n```",
		});
		expect(parsed?.snapshot.assistantPreview).toBe("# Heading\n- first\n- second\n```\n    code\n```");
		expect(parseObservation({ ...base, assistantPreview: "\n\t\u001b[2J\u202e" })).toBeUndefined();
	});

	it("counts retained preview line breaks against the UTF-8 budget", () => {
		expect(parseObservation({ ...base, assistantPreview: "\n".repeat(4096) + "answer" })).toBeUndefined();
	});

	it("keeps older records without display text valid", () => {
		const parsed = parseObservation(base);
		expect(parsed?.snapshot.taskSummary).toBeUndefined();
		expect(parsed?.snapshot.assistantPreview).toBeUndefined();
	});

	it("rejects a task summary over 160 characters", () => {
		expect(parseObservation({ ...base, taskSummary: "x".repeat(161) })).toBeUndefined();
		expect(parseObservation({ ...base, taskSummary: "x".repeat(160) })?.snapshot.taskSummary).toHaveLength(160);
	});

	it("rejects an assistant preview over 4 KiB of UTF-8", () => {
		expect(parseObservation({ ...base, assistantPreview: "a".repeat(4096) })?.snapshot.assistantPreview).toHaveLength(
			4096,
		);
		expect(parseObservation({ ...base, assistantPreview: "a".repeat(4097) })).toBeUndefined();
		// Two-byte characters halve the character budget.
		expect(parseObservation({ ...base, assistantPreview: "é".repeat(2049) })).toBeUndefined();
	});

	it("rejects non-string display text", () => {
		expect(parseObservation({ ...base, taskSummary: 12 })).toBeUndefined();
		expect(parseObservation({ ...base, assistantPreview: null })).toBeUndefined();
	});

	it("sanitises terminal controls and direction overrides without rejecting the record", () => {
		const parsed = parseObservation({
			...base,
			taskSummary: "Map\u0007 the\u202e module\u001b[2J",
			assistantPreview: "safe\u001b[2J text\u202d here",
		});
		expect(parsed?.snapshot.taskSummary).toBe("Map the module");
		expect(parsed?.snapshot.assistantPreview).toBe("safe text here");
	});

	it("rejects display text that sanitises to nothing", () => {
		expect(parseObservation({ ...base, taskSummary: " \n\t " })).toBeUndefined();
	});
});

describe("display-text retention", () => {
	it("retains root display text from the manager-owned update", () => {
		const store = new ObservationStore();
		store.updateRoot(root, { taskSummary: "Map the module", assistantPreview: "Reading" });
		const node = store.tree("root", "direct")!.nodes[0];
		expect(node.taskSummary).toBe("Map the module");
		expect(node.assistantPreview).toBe("Reading");
	});

	it("retains descendant display text through validated ingest", () => {
		const store = new ObservationStore();
		store.updateRoot(root);
		store.bindChildSession({ owner: "root", runId: "direct" }, "child-session");
		expect(
			store.ingest(
				{ owner: "root", runId: "direct" },
				{ ...base, taskSummary: "Nested task", assistantPreview: "Working" },
			),
		).toBe("accepted");
		const node = store.node("root", "direct", "descendant")!;
		expect(node.taskSummary).toBe("Nested task");
		expect(node.assistantPreview).toBe("Working");
	});

	it("ignores replayed display text at an unchanged revision", () => {
		const store = new ObservationStore();
		store.updateRoot(root);
		store.bindChildSession({ owner: "root", runId: "direct" }, "child-session");
		store.ingest({ owner: "root", runId: "direct" }, { ...base, assistantPreview: "first", revision: 5 });
		const result = store.ingest(
			{ owner: "root", runId: "direct" },
			{ ...base, assistantPreview: "replayed other text", revision: 5 },
		);
		expect(result).toBe("ignored");
		expect(store.node("root", "direct", "descendant")!.assistantPreview).toBe("first");
	});

	it("never moves display text onto a foreign identity", () => {
		const store = new ObservationStore();
		store.updateRoot(root);
		store.bindChildSession({ owner: "root", runId: "direct" }, "child-session");
		store.ingest({ owner: "root", runId: "direct" }, base);
		const result = store.ingest(
			{ owner: "root", runId: "direct" },
			{ ...base, agent: "other-agent", revision: 2, assistantPreview: "foreign text" },
		);
		expect(result).toBe("rejected");
		expect(store.node("root", "direct", "descendant")!.assistantPreview).toBeUndefined();
	});

	it("keeps a stale preview provisional beside terminal evidence", () => {
		const store = new ObservationStore();
		store.updateRoot(root, { taskSummary: "Map", assistantPreview: "half answer" });
		store.updateRoot({ ...root, state: "failed", endedAt: 3 });
		const node = store.tree("root", "direct")!.nodes[0];
		expect(node.state).toBe("failed");
		expect(node.assistantPreview).toBe("half answer");
	});
});

describe("relay display text", () => {
	function setup(now?: () => number) {
		const observations = new TransportObservationStore();
		const relay = new ObservationRelay({ observations, current: () => root, token: "parent-token", now });
		relay.onChange(root);
		return { observations, relay, tree: () => observations.tree("root", "direct")! };
	}

	it("labels the root with the submitted task", () => {
		const h = setup();
		h.relay.onTask(root, "Summarise the validation module\r\nacross two files");
		expect(h.tree().nodes[0].taskSummary).toBe("Summarise the validation module across two files");
	});

	it("truncates a long task to the 160-character label bound", () => {
		const h = setup();
		h.relay.onTask(root, "t".repeat(400));
		expect(h.tree().nodes[0].taskSummary).toHaveLength(160);
	});

	it("publishes a bounded assistant preview only after the task was submitted", async () => {
		const h = setup();
		const wire = channel();
		h.relay.onReady(root, {});
		h.relay.connect(root, wire, "run-token");
		await new Promise((done) => setTimeout(done, 0));
		wire.emit(assistant("startup replay before the task"));
		expect(h.tree().nodes[0].assistantPreview).toBeUndefined();

		h.relay.onTask(root, "do work");
		wire.emit(assistant("Visible answer text"));
		expect(h.tree().nodes[0].assistantPreview).toBe("Visible answer text");
	});

	it("keeps visible Markdown structure through publication and retained validation", async () => {
		const h = setup();
		const wire = channel();
		h.relay.connect(root, wire, "run-token");
		await Promise.resolve();
		h.relay.onTask(root, "do work");
		const markdown = "    code\n\n# Heading\n- first\n- second\n\n```ts\n  run();\n```";
		wire.emit(assistant(markdown));
		expect(h.tree().nodes[0].assistantPreview).toBe(markdown);
		h.relay.dispose();
	});

	it("truncates a large preview within 4 KiB and marks the cut", async () => {
		const h = setup();
		const wire = channel();
		h.relay.connect(root, wire, "run-token");
		await Promise.resolve();
		h.relay.onTask(root, "do work");
		wire.emit(assistant("ä".repeat(9000)));
		const preview = h.tree().nodes[0].assistantPreview!;
		expect(Buffer.byteLength(preview, "utf8")).toBeLessThanOrEqual(4096);
		expect(preview).toMatch(/truncated/i);
	});

	it("keeps thinking, tool output and stderr out of the preview", async () => {
		const h = setup();
		const wire = channel();
		h.relay.connect(root, wire, "run-token");
		await Promise.resolve();
		h.relay.onTask(root, "do work");
		wire.emit({
			type: "message_end",
			message: { role: "assistant", stopReason: "stop", content: [{ type: "thinking", text: "HIDDEN THOUGHTS" }] },
		});
		wire.emit({
			type: "tool_execution_end",
			toolCallId: "t1",
			toolName: "read",
			result: { content: [{ type: "text", text: "TOOL RESULT" }] },
		});
		wire.emit({ type: "message_update", message: { role: "assistant", content: [{ type: "text", text: "PARTIAL" }] } });
		wire.emit({ type: "stderr", text: "STDERR OUTPUT" });
		const node = h.tree().nodes[0];
		expect(node.assistantPreview).toBeUndefined();
		expect(JSON.stringify(node)).not.toContain("HIDDEN THOUGHTS");
		expect(JSON.stringify(node)).not.toContain("TOOL RESULT");
		expect(JSON.stringify(node)).not.toContain("PARTIAL");
	});

	it("coalesces rapid preview publications to at most five per second", async () => {
		vi.useFakeTimers();
		try {
			const h = setup();
			const wire = channel();
			h.relay.connect(root, wire, "run-token");
			await Promise.resolve();
			h.relay.onTask(root, "do work");
			const seen: (string | undefined)[] = [];
			h.observations.subscribe("root", () => {
				const preview = h.tree().nodes[0].assistantPreview;
				if (seen.at(-1) !== preview) seen.push(preview);
			});
			for (let index = 0; index < 12; index++) {
				vi.advanceTimersByTime(10);
				wire.emit(assistant(`answer ${index}`));
			}
			expect(seen.filter(Boolean).length).toBeLessThanOrEqual(5);
			vi.advanceTimersByTime(500);
			expect(h.tree().nodes[0].assistantPreview).toBe("answer 11");
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("display text over the transport", () => {
	it("carries descendant display text inside the validated envelope", async () => {
		const store = new TransportObservationStore();
		store.updateRoot(root);
		store.bindChildSession({ owner: "root", runId: "direct" }, "child-session");
		const envelope = {
			token: "run-token",
			snapshot: { ...base, taskSummary: "Nested task", assistantPreview: "Working", revision: 3 },
			reasons: [],
			evidenceRevision: 3,
		};
		const wire = {
			onRecord: (callback: (value: RpcRecord) => void, options?: { replay?: boolean }) => {
				if (options?.replay)
					callback({ type: "entry_appended", entry: { customType: OBSERVATION_ENTRY, data: envelope } });
				return () => {};
			},
			request: async () => ({ success: true, data: { sessionId: "child-session" } }),
		};
		const relay = new ObservationRelay({ observations: store, current: () => root, token: "parent-token" });
		relay.onChange(root);
		relay.connect(root, wire, "run-token");
		await new Promise((done) => setTimeout(done, 0));
		const node = store.node("root", "direct", "descendant")!;
		expect(node.taskSummary).toBe("Nested task");
		expect(node.assistantPreview).toBe("Working");
		expect(node.revision).toBe(3);
	});
});

describe("display text never touches execution", () => {
	it("a rejected display record leaves the run outcome unchanged", () => {
		const store = new ObservationStore();
		store.updateRoot(root);
		store.bindChildSession({ owner: "root", runId: "direct" }, "child-session");
		store.ingest({ owner: "root", runId: "direct" }, base);
		const rejected = store.ingest(
			{ owner: "root", runId: "direct" },
			{ ...base, assistantPreview: "z".repeat(5000), revision: 2 },
		);
		expect(rejected).toBe("rejected");
		const node = store.node("root", "direct", "descendant")!;
		expect(node.state).toBe("running");
		expect(node.assistantPreview).toBeUndefined();
	});

	it("publishes display text without any model or delivery interaction", () => {
		const publish = vi.fn();
		const observations = new TransportObservationStore();
		const relay = new ObservationRelay({ observations, current: () => root, publish, token: "parent-token" });
		relay.onChange(root);
		relay.onTask(root, "task");
		const sent = publish.mock.calls.map(([envelope]) => JSON.stringify(envelope));
		expect(sent.some((text) => text.includes("task"))).toBe(true);
	});
});
