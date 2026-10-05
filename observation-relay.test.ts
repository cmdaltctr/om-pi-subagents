import { describe, expect, it, vi } from "vitest";
import { ObservationRelay } from "./observation-relay.ts";
import { parseObservationEnvelope, TransportObservationStore } from "./observation-transport.ts";
import type { ObservationSnapshot } from "./observation.ts";
import { OBSERVATION_ENTRY } from "./protocol.ts";
import type { RpcRecord } from "./rpc.ts";
import type { RunView } from "./runs.ts";

const root: RunView = {
	id: "direct",
	owner: "root",
	agent: "delegator",
	cwd: "/work",
	state: "starting",
	startedAt: 1,
	nesting: { registryPath: "/registry.yaml", depth: 1, maxDepth: 4, rootSessionId: "root" },
};
const descendant: ObservationSnapshot = {
	owner: "child-session",
	rootSessionId: "root",
	runId: "descendant",
	parentRunId: "direct",
	depth: 2,
	agent: "writer",
	state: "running",
	revision: 10,
	startedAt: 2,
	activeTools: [],
};
const record = (snapshot: ObservationSnapshot, reasons: string[] = []) => ({
	type: "entry_appended",
	entry: {
		customType: OBSERVATION_ENTRY,
		data: { token: "child-token", snapshot, reasons, evidenceRevision: snapshot.revision },
	},
});
function setup(publish = vi.fn()) {
	const observations = new TransportObservationStore();
	let current = root;
	const relay = new ObservationRelay({ observations, current: () => current, publish, token: "parent-token" });
	relay.onChange(root);
	return {
		observations,
		relay,
		publish,
		setCurrent: (run: RunView) => {
			current = run;
			relay.onChange(run);
		},
		tree: () => observations.tree("root", "direct")!,
	};
}
function connection(replay: RpcRecord[] = []) {
	let listener: ((value: RpcRecord) => void) | undefined;
	const detach = vi.fn(() => {
		listener = undefined;
	});
	return {
		detach,
		request: async () => ({ success: true, data: { sessionId: "child-session" } }),
		onRecord: (callback: (value: RpcRecord) => void, options?: { replay?: boolean }) => {
			if (options?.replay) for (const value of replay) callback(value);
			listener = callback;
			return detach;
		},
		emit: (value: RpcRecord) => listener?.(value),
	};
}

describe("observation supervision adapter", () => {
	it("uses the current manager state for task metadata and keeps source tool tracking bounded", () => {
		const h = setup();
		h.setCurrent({ ...root, state: "running" });
		h.relay.onReady(root, { model: "fake/counter" });
		for (let i = 0; i < 200; i++)
			h.relay.onProgress(root, {
				type: "tool_execution_start",
				toolCallId: `tool/${i}`,
				toolName: "read",
				args: { auth: "SECRET" },
			});
		expect(h.tree().nodes[0]).toMatchObject({ state: "running", model: "fake/counter" });
		expect(h.tree().nodes[0].activeTools).toHaveLength(4);
		// Check source retention too: truncating the final snapshot cannot bound an unbounded source map.
		const source = h.relay as unknown as { progress: Map<string, { tools: Map<string, unknown> }> };
		expect(source.progress.get(root.id)?.tools.size).toBe(4);
		expect(h.tree().reasons).toContain("tools-omitted");
		const revision = h.tree().nodes[0].revision;
		h.relay.onProgress(root, { type: "tool_execution_start", toolCallId: "tool/0", toolName: "read" });
		h.relay.onProgress(root, { type: "tool_execution_update", toolCallId: "tool/0", partialResult: "SECRET" });
		h.relay.onProgress(root, { type: "tool_execution_end", toolCallId: "untracked", toolName: "read" });
		expect(h.tree().nodes[0].revision).toBe(revision);
		h.relay.onProgress(root, { type: "tool_execution_end", toolCallId: "tool/0", toolName: "read", result: "SECRET" });
		expect(h.tree().nodes[0].activeTools).toHaveLength(3);
		expect(JSON.stringify(h.publish.mock.calls)).not.toContain("SECRET");
		h.setCurrent({ ...root, state: "completed", endedAt: 4 });
		expect(h.tree().nodes[0].activeTools).toEqual([]);
	});

	it("rewrites each hop token while preserving owner, ancestry and dedicated revisions from replay", async () => {
		const h = setup();
		const pipe = connection([record(descendant, ["nodes-omitted", "backlog-expired"])]);
		const detach = h.relay.connect(root, pipe, "child-token");
		await vi.waitFor(() => expect(h.tree().nodes[1]).toMatchObject(descendant));
		const outgoing = h.publish.mock.calls
			.map(([envelope]) => envelope)
			.filter((e) => e.snapshot.runId === descendant.runId);
		expect(outgoing).toHaveLength(2);
		expect(outgoing[1].reasons).toEqual(expect.arrayContaining(["nodes-omitted", "backlog-expired"]));
		expect(outgoing[0]).toMatchObject({ token: "parent-token", snapshot: descendant });
		expect(h.tree().reasons).toEqual(expect.arrayContaining(["nodes-omitted", "backlog-expired"]));
		pipe.emit(record({ ...descendant, revision: 4, state: "starting" }));
		expect(h.tree().nodes[1].revision).toBe(10);
		detach();
		detach();
		expect(pipe.detach).toHaveBeenCalledTimes(1);
	});

	it("contains failed subscriptions and publishers, then forwards authoritative terminal evidence", () => {
		const h = setup(
			vi.fn(() => {
				throw new Error("publisher failed");
			}),
		);
		expect(h.tree().reasons).toContain("connection-lost");
		expect(() =>
			h.relay.connect(
				root,
				{
					request: async () => ({ success: true, data: { sessionId: "child-session" } }),
					onRecord: () => {
						throw new Error("subscribe failed");
					},
				},
				"child-token",
			),
		).not.toThrow();
		h.setCurrent({ ...root, state: "completed", endedAt: 3 });
		expect(h.tree().nodes[0].state).toBe("completed");
	});

	it("contains rejected async callbacks and publishers without an unhandled rejection", async () => {
		const h = setup(
			vi.fn(async () => {
				throw new Error("publisher failed");
			}),
		);
		const callback = vi.fn(async () => {
			throw new Error("renderer failed");
		});
		h.observations.subscribe("root", callback);
		h.setCurrent({ ...root, state: "running" });
		await vi.waitFor(() => expect(h.tree().reasons).toContain("connection-lost"));
		const count = callback.mock.calls.length;
		h.setCurrent({ ...root, state: "completed", endedAt: 4 });
		expect(callback).toHaveBeenCalledTimes(count);
	});

	it("detaches all subscribers on shutdown and refuses late updates", async () => {
		const h = setup();
		const pipe = connection();
		h.relay.connect(root, pipe, "child-token");
		await Promise.resolve();
		h.relay.dispose();
		h.relay.dispose();
		pipe.emit(record(descendant));
		h.relay.onChange(root);
		h.relay.onReady(root, { model: "fake/counter" });
		expect(pipe.detach).toHaveBeenCalledTimes(1);
		expect(h.observations.trees("root")).toEqual([]);
	});
});

describe("private envelope bounds", () => {
	it("applies 16 KiB to the envelope as well as the snapshot and strips unlisted fields", () => {
		const value = {
			token: "child-token",
			snapshot: { ...descendant, args: "SECRET", result: "SECRET" },
			reasons: [],
			evidenceRevision: 1,
			auth: "SECRET",
		};
		expect(JSON.stringify(parseObservationEnvelope(value, "child-token"))).not.toContain("SECRET");
		expect(parseObservationEnvelope({ ...value, padding: "x".repeat(16 * 1024) }, "child-token")).toBeUndefined();
		expect(parseObservationEnvelope(value, "wrong-token")).toBeUndefined();
		expect(parseObservationEnvelope({ ...value, reasons: ["SECRET"] }, "child-token")).toBeUndefined();
		for (const evidenceRevision of [undefined, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])
			expect(parseObservationEnvelope({ ...value, evidenceRevision }, "child-token")).toBeUndefined();
		for (const childSessionId of ["../foreign", "", "x".repeat(129)])
			expect(
				parseObservationEnvelope({ ...value, snapshot: { ...descendant, childSessionId } }, "child-token"),
			).toBeUndefined();
	});
});
