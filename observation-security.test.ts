import { describe, expect, it, vi } from "vitest";
import { ObservationRelay } from "./observation-relay.ts";
import { TransportObservationStore, type ObservationEnvelope } from "./observation-transport.ts";
import { OBSERVATION_LIMITS, type ObservationSnapshot } from "./observation.ts";
import { OBSERVATION_ENTRY } from "./protocol.ts";
import type { RpcRecord } from "./rpc.ts";
import type { RunView } from "./runs.ts";

const direct: RunView = {
	id: "direct",
	owner: "viewer-session",
	agent: "builder",
	cwd: "/work",
	state: "running",
	startedAt: 1,
	nesting: { registryPath: "/registry.yaml", rootSessionId: "viewer-session", depth: 1, maxDepth: 4 },
};
const middle: RunView = {
	...direct,
	id: "middle",
	owner: "child-session",
	startedAt: 2,
	nesting: { ...direct.nesting!, parentRunId: "direct", depth: 2 },
};
const snapshot = (patch: Partial<ObservationSnapshot> & { childSessionId?: string } = {}): ObservationSnapshot => ({
	owner: "child-session",
	rootSessionId: "viewer-session",
	runId: "middle",
	parentRunId: "direct",
	depth: 2,
	agent: "builder",
	state: "running",
	startedAt: 2,
	revision: 1,
	activeTools: [],
	...patch,
});
const entry = (value: ObservationSnapshot, reasons: string[] = [], evidenceRevision = 1): RpcRecord => ({
	type: "entry_appended",
	entry: { customType: OBSERVATION_ENTRY, data: { token: "hop-token", snapshot: value, reasons, evidenceRevision } },
});
function pipe(sessionId: unknown = "child-session") {
	const records: RpcRecord[] = [];
	let listener: ((record: RpcRecord) => void) | undefined;
	return {
		records,
		request: vi.fn(async () => ({ success: true, data: { sessionId } })),
		onRecord(callback: (record: RpcRecord) => void, options?: { replay?: boolean }) {
			listener = callback;
			if (options?.replay) for (const record of records) callback(record);
			return () => {
				listener = undefined;
			};
		},
		emit(record: RpcRecord) {
			records.push(record);
			listener?.(record);
		},
	};
}
async function rootHarness(sessionId: unknown = "child-session") {
	const store = new TransportObservationStore();
	const relay = new ObservationRelay({ observations: store, current: (run) => run });
	relay.onChange(direct);
	const channel = pipe(sessionId);
	relay.connect(direct, channel, "hop-token");
	await Promise.resolve();
	await Promise.resolve();
	return { store, relay, channel, tree: () => store.tree(direct.owner, direct.id)! };
}
async function twoHops(now = () => 0) {
	const top = await rootHarness();
	const lower = new TransportObservationStore({ now });
	const published: ObservationEnvelope[] = [];
	const relay = new ObservationRelay({
		observations: lower,
		current: (run) => run,
		token: "hop-token",
		publish(envelope) {
			published.push(envelope);
			top.channel.emit({ type: "entry_appended", entry: { customType: OBSERVATION_ENTRY, data: envelope } });
		},
	});
	relay.onChange(middle);
	const channel = pipe("grand-session");
	relay.connect(middle, channel, "hop-token");
	await Promise.resolve();
	await Promise.resolve();
	const leaf = snapshot({
		runId: "leaf",
		parentRunId: "middle",
		depth: 3,
		owner: "grand-session",
		childSessionId: "great-session",
		startedAt: 3,
	});
	const great = snapshot({ runId: "great", parentRunId: "leaf", depth: 4, owner: "great-session", startedAt: 4 });
	return { top, lower, relay, channel, published, leaf, great, tree: () => lower.tree(middle.owner, middle.id)! };
}

describe("security review regressions", () => {
	it.each(["viewer-session", "foreign-session"])(
		"rejects initial owner forgery %s using the actual child SDK session",
		async (owner) => {
			const h = await rootHarness();
			h.channel.emit(entry(snapshot({ owner })));
			expect(h.tree().nodes.map((node) => node.runId)).toEqual(["direct"]);
			expect(h.tree().reasons).toContain("lineage");
			h.channel.emit(entry(snapshot({ runId: "genuine" })));
			expect(h.tree().nodes[1]).toMatchObject({ runId: "genuine", owner: "child-session" });
			expect(h.channel.request).toHaveBeenCalledWith({ type: "get_state" }, expect.any(Number));
		},
	);

	it.each([null, "../foreign"])(
		"contains unavailable SDK identity %s without admitting remote detail owners",
		async (sessionId) => {
			const h = await rootHarness(sessionId);
			h.channel.emit(entry(snapshot()));
			expect(h.tree().nodes).toHaveLength(1);
			expect(h.tree().incomplete).toBe(true);
			expect(h.tree().nodes[0].state).toBe("running");
			expect(h.tree().nodes[0].childSessionId).toBeUndefined();
		},
	);

	it.each(["viewer-session", "child-session"])(
		"rejects descendant session claims pointing back to ancestor %s",
		async (childSessionId) => {
			const h = await rootHarness();
			h.channel.emit(entry(snapshot({ childSessionId })));
			h.channel.emit(
				entry(snapshot({ runId: "forged-deeper", parentRunId: "middle", depth: 3, owner: childSessionId })),
			);
			expect(h.tree().nodes.map((node) => node.runId)).toEqual(["direct"]);
			expect(h.tree().reasons).toContain("lineage");
		},
	);

	it("verifies a legitimate root-child-grandchild-great-grandchild chain and rejects deeper foreign ownership", async () => {
		const h = await twoHops();
		h.channel.emit(entry(h.leaf));
		h.channel.emit(entry(h.great));
		expect(h.top.tree().nodes.map((node) => [node.runId, node.owner])).toEqual([
			["direct", "viewer-session"],
			["middle", "child-session"],
			["leaf", "grand-session"],
			["great", "great-session"],
		]);
		h.channel.emit(entry({ ...h.great, runId: "forged", owner: "viewer-session" }));
		expect(h.lower.node(middle.owner, middle.id, "forged")).toBeUndefined();
		expect(h.top.store.node(direct.owner, direct.id, "forged")).toBeUndefined();
	});

	it("keeps pending evidence isolated between sibling branches during recovery", async () => {
		const h = await twoHops();
		const sibling = { ...middle, id: "sibling" };
		h.relay.onChange(sibling);
		const siblingPipe = pipe("sibling-session");
		h.relay.connect(sibling, siblingPipe, "hop-token");
		await Promise.resolve();
		siblingPipe.emit(
			entry({ ...h.great, runId: "sibling-great", parentRunId: "sibling-leaf", owner: "sibling-leaf-session" }),
		);
		h.channel.emit(entry(h.great));
		h.channel.emit(entry(h.leaf));
		expect(h.tree().reasons).toEqual([]);
		expect(h.top.tree().reasons).toContain("before-parent");
		siblingPipe.emit(
			entry({
				...h.leaf,
				runId: "sibling-leaf",
				parentRunId: "sibling",
				owner: "sibling-session",
				childSessionId: "sibling-leaf-session",
			}),
		);
		expect(h.top.tree()).toMatchObject({ incomplete: false, reasons: [] });
	});

	it("refuses late SDK identity and replay after disposal", async () => {
		const store = new TransportObservationStore();
		const relay = new ObservationRelay({ observations: store, current: (run) => run });
		relay.onChange(direct);
		let resolve!: (response: RpcRecord) => void;
		const response = new Promise<RpcRecord>((done) => {
			resolve = done;
		});
		const channel = pipe();
		const onRecord = vi.fn(channel.onRecord);
		relay.connect(direct, { onRecord, request: async () => response }, "hop-token");
		relay.dispose();
		resolve({ success: true, data: { sessionId: "child-session" } });
		await Promise.resolve();
		await Promise.resolve();
		expect(onRecord).not.toHaveBeenCalled();
		expect(store.trees(direct.owner)).toEqual([]);
	});

	it("clears two-hop before-parent evidence after recovery and ignores an older pending replay", async () => {
		const h = await twoHops();
		h.channel.emit(entry(h.great));
		expect(h.tree().reasons).toContain("before-parent");
		expect(h.top.tree().reasons).toContain("before-parent");
		const pending = h.published.find((envelope) => envelope.reasons.includes("before-parent"))!;
		h.channel.emit(entry(h.leaf));
		expect(h.tree()).toMatchObject({ pending: 0, incomplete: false, reasons: [] });
		expect(h.top.tree().nodes.map((node) => node.runId)).toEqual(["direct", "middle", "leaf", "great"]);
		expect(h.top.tree()).toMatchObject({ pending: 0, incomplete: false, reasons: [] });
		h.top.channel.emit({ type: "entry_appended", entry: { customType: OBSERVATION_ENTRY, data: pending } });
		expect(h.top.tree().reasons).toEqual([]);
	});

	it("preserves permanent backlog expiry through newer recovery and stale empty reason sets", async () => {
		let now = 0;
		const h = await twoHops(() => now);
		const empty = h.published.at(-1)!;
		h.channel.emit(entry(h.great));
		now = OBSERVATION_LIMITS.backlogMs;
		expect(h.tree().reasons).toContain("backlog-expired");
		expect(h.top.tree().reasons).toContain("backlog-expired");
		h.channel.emit(entry(h.leaf));
		expect(h.top.tree().reasons).not.toContain("before-parent");
		h.top.channel.emit({ type: "entry_appended", entry: { customType: OBSERVATION_ENTRY, data: empty } });
		expect(h.top.tree().reasons).toContain("backlog-expired");
		h.top.channel.emit({
			type: "entry_appended",
			entry: { customType: OBSERVATION_ENTRY, data: { ...empty, evidenceRevision: 10000, reasons: [] } },
		});
		expect(h.top.tree().reasons).toContain("backlog-expired");
		expect(h.top.tree().nodes.map((node) => node.runId)).toEqual(["direct", "middle", "leaf"]);
	});
});
