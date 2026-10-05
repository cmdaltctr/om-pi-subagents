import { describe, expect, it, vi } from "vitest";
import { ObservationStore, OBSERVATION_LIMITS, type ObservationSnapshot } from "../src/observation.ts";
import { RunManager, type RunView } from "../src/runs.ts";

const connection = { owner: "session", runId: "direct" };
const direct = (patch: Partial<RunView> = {}): RunView => ({
	id: "direct",
	owner: "session",
	agent: "builder",
	cwd: "/work",
	state: "running",
	startedAt: 10,
	nesting: { registryPath: "/registry.yaml", rootSessionId: "session", depth: 1, maxDepth: 4 },
	...patch,
});
const snapshot = (patch: Partial<ObservationSnapshot> = {}): ObservationSnapshot => ({
	owner: patch.depth === 4 ? "deeper-session" : patch.depth === 3 ? "nested-session" : "child-session",
	childSessionId: patch.depth === 4 ? undefined : patch.depth === 3 ? "deeper-session" : "nested-session",
	rootSessionId: "session",
	runId: "child",
	parentRunId: "direct",
	depth: 2,
	agent: "reader",
	state: "running",
	model: "provider/model",
	startedAt: 11,
	revision: 1,
	activeTools: [],
	...patch,
});
function setup(now?: () => number) {
	const store = new ObservationStore({ now });
	store.updateRoot(direct());
	store.bindChildSession(connection, "child-session");
	return store;
}
const node = (store: ObservationStore, id = "child") => store.node("session", "direct", id);

describe("identity and schema", () => {
	it("retains identical agent names as separate nodes with private detail owners", () => {
		const store = setup();
		expect(store.ingest(connection, snapshot())).toBe("accepted");
		expect(store.ingest(connection, snapshot({ runId: "sibling" }))).toBe("accepted");
		expect(store.tree("session", "direct")?.nodes.map((n) => n.runId)).toEqual(["direct", "child", "sibling"]);
		expect(node(store)?.owner).toBe("child-session");
		expect(store.tree("foreign", "direct")).toBeUndefined();
		expect(store.node("foreign", "direct", "child")).toBeUndefined();
	});
	it.each(["owner", "rootSessionId", "runId", "parentRunId"] as const)("rejects malformed %s", (field) => {
		for (const value of ["", "../escape", ".", "a/b", "a".repeat(129), 123, null]) {
			const store = setup();
			expect(store.ingest(connection, { ...snapshot(), [field]: value })).toBe("rejected");
			expect(node(store)).toBeUndefined();
		}
	});
	it.each([
		{ depth: 0 },
		{ depth: 2.5 },
		{ depth: Number.MAX_SAFE_INTEGER + 1 },
		{ revision: -1 },
		{ revision: 1.5 },
		{ revision: Number.MAX_SAFE_INTEGER + 1 },
		{ state: "done" },
		{ agent: "" },
		{ agent: 12 },
		{ model: "" },
		{ startedAt: -1 },
		{ startedAt: Infinity },
		{ endedAt: 9 },
		{ endedAt: "later" },
		{ activeTools: null },
		{ activeTools: [{ id: "", name: "read" }] },
		{ activeTools: [{ id: "call", name: "" }] },
		{ activeTools: [{ id: "call", name: 7 }] },
	])("rejects invalid display fields: %j", (patch) => {
		const store = setup();
		expect(store.ingest(connection, { ...snapshot(), ...patch })).toBe("rejected");
		expect(node(store)).toBeUndefined();
		expect(store.tree("session", "direct")?.incomplete).toBe(true);
	});
	it("excludes all unlisted sensitive fields, including nested tool fields", () => {
		const store = setup();
		store.ingest(connection, {
			...snapshot(),
			task: "secret",
			output: "secret",
			thinking: "secret",
			stderr: "secret",
			authentication: "secret",
			arguments: "secret",
			result: "secret",
			activeTools: [{ id: "call", name: "read", arguments: "secret", result: "secret", token: "secret" }],
		});
		expect(node(store)).toMatchObject({ activeTools: [{ id: "call", name: "read" }] });
		expect(JSON.stringify(store.tree("session", "direct"))).not.toContain("secret");
	});
	it("contains unserialisable records without throwing", () => {
		const store = setup();
		const circular: Record<string, unknown> = { ...snapshot() };
		circular.self = circular;
		for (const value of [null, [], "text", circular, { ...snapshot(), secret: 1n }]) {
			expect(() => store.ingest(connection, value)).not.toThrow();
			expect(store.ingest(connection, value)).toBe("rejected");
		}
	});
});

describe("registered lineage", () => {
	it("accepts a great-grandchild only beneath registered parents", () => {
		const store = setup();
		store.ingest(connection, snapshot({ childSessionId: "grand-session" }));
		store.ingest(
			connection,
			snapshot({
				runId: "grandchild",
				parentRunId: "child",
				depth: 3,
				owner: "grand-session",
				childSessionId: "great-session",
			}),
		);
		store.ingest(connection, snapshot({ runId: "great", parentRunId: "grandchild", depth: 4, owner: "great-session" }));
		expect(store.tree("session", "direct")?.nodes.map((n) => n.runId)).toEqual([
			"direct",
			"child",
			"grandchild",
			"great",
		]);
		expect(node(store, "great")).toMatchObject({ depth: 4, parentRunId: "grandchild" });
	});
	it("rejects a foreign root, depth ceiling and inconsistent immediate depth", () => {
		const store = setup();
		for (const patch of [{ rootSessionId: "foreign" }, { depth: 5 }, { depth: 3 }, { depth: 1 }]) {
			expect(store.ingest(connection, snapshot(patch))).toBe("rejected");
		}
		expect(node(store)).toBeUndefined();
	});
	it("rejects another direct branch and unregistered connections", () => {
		const store = setup();
		store.updateRoot(direct({ id: "other" }));
		store.bindChildSession({ owner: "session", runId: "other" }, "child-session");
		store.ingest({ owner: "session", runId: "other" }, snapshot({ runId: "other-child", parentRunId: "other" }));
		for (const source of [
			{ owner: "foreign", runId: "direct" },
			{ owner: "session", runId: "unknown" },
			{ owner: "session", runId: "child" },
		]) {
			expect(store.ingest(source, snapshot())).toBe("rejected");
		}
		expect(store.ingest(connection, snapshot({ parentRunId: "other" }))).toBe("rejected");
		expect(store.ingest(connection, snapshot({ parentRunId: "other-child", depth: 3 }))).toBe("rejected");
		expect(store.ingest(connection, snapshot({ runId: "other-child" }))).toBe("rejected");
		expect(node(store)).toBeUndefined();
	});
	it.each(["parentRunId", "depth", "owner", "agent", "startedAt"] as const)("keeps %s immutable", (field) => {
		const store = setup();
		store.ingest(connection, snapshot());
		const value = { parentRunId: "unknown", depth: 3, owner: "different", agent: "different", startedAt: 12 }[field];
		expect(store.ingest(connection, { ...snapshot({ revision: 2 }), [field]: value })).toBe("rejected");
		expect(node(store)?.[field]).toBe(snapshot()[field]);
	});
	it("rejects self cycles, cycles in the backlog and reparenting beneath a descendant", () => {
		const store = setup();
		expect(store.ingest(connection, snapshot({ parentRunId: "child" }))).toBe("rejected");
		expect(store.ingest(connection, snapshot({ runId: "a", parentRunId: "b", depth: 3 }))).toBe("buffered");
		expect(store.ingest(connection, snapshot({ runId: "b", parentRunId: "a", depth: 2 }))).toBe("rejected");
		store.ingest(connection, snapshot());
		store.ingest(connection, snapshot({ runId: "grand", parentRunId: "child", depth: 3 }));
		expect(store.ingest(connection, snapshot({ parentRunId: "grand", depth: 4, revision: 2 }))).toBe("rejected");
	});
	it("supports a managed parent's direct root with an inherited ceiling", () => {
		const store = new ObservationStore();
		store.updateRoot(
			direct({
				owner: "managed-session",
				nesting: { registryPath: "/r", rootSessionId: "top", parentRunId: "ancestor", depth: 2, maxDepth: 3 },
			}),
		);
		const source = { owner: "managed-session", runId: "direct" };
		store.bindChildSession(source, "child-session");
		expect(
			store.ingest(
				source,
				snapshot({ rootSessionId: "top", depth: 3, owner: "child-session", childSessionId: "nested-session" }),
			),
		).toBe("accepted");
		expect(
			store.ingest(source, snapshot({ rootSessionId: "top", runId: "too-deep", depth: 4, parentRunId: "child" })),
		).toBe("rejected");
		expect(store.tree("managed-session", "direct")?.nodes).toHaveLength(2);
	});
});

describe("authoritative state and revision order", () => {
	it("never accepts descendant metadata for an authoritative root", () => {
		const store = setup();
		expect(
			store.ingest(connection, snapshot({ runId: "direct", parentRunId: undefined, depth: 1, state: "completed" })),
		).toBe("rejected");
		expect(node(store, "direct")).toMatchObject({ owner: "session", state: "running", agent: "builder" });
		store.updateRoot(direct({ state: "completed", endedAt: 20 }), { model: "p/m" });
		expect(node(store, "direct")).toMatchObject({ state: "completed", endedAt: 20, model: "p/m", revision: 3 });
		store.updateRoot(direct());
		expect(node(store, "direct")?.state).toBe("completed");
	});
	it("rejects malformed and conflicting authoritative lineage", () => {
		const store = setup();
		expect(store.updateRoot(direct({ nesting: undefined }))).toBe(false);
		expect(store.updateRoot(direct({ nesting: { ...direct().nesting!, depth: 2, parentRunId: "elsewhere" } }))).toBe(
			false,
		);
		expect(node(store, "direct")?.depth).toBe(1);
	});
	it("ignores duplicate and older revisions, even with changed tools", () => {
		const store = setup();
		store.ingest(connection, snapshot({ revision: 3, activeTools: [{ id: "call", name: "read" }] }));
		for (const revision of [3, 2, 0]) expect(store.ingest(connection, snapshot({ revision }))).toBe("ignored");
		expect(node(store)).toMatchObject({ revision: 3, activeTools: [{ id: "call", name: "read" }] });
	});
	it.each(["completed", "failed", "cancelled"] as const)(
		"prevents %s regression even with newer revisions",
		(state) => {
			const store = setup();
			store.ingest(connection, snapshot({ state, endedAt: 20, revision: 2 }));
			expect(store.ingest(connection, snapshot({ revision: 1 }))).toBe("ignored");
			expect(store.ingest(connection, snapshot({ revision: 3 }))).toBe("rejected");
			expect(
				store.ingest(connection, snapshot({ revision: 4, state: state === "failed" ? "completed" : "failed" })),
			).toBe("rejected");
			expect(node(store)).toMatchObject({ state, revision: 2, endedAt: 20 });
		},
	);
	it("labels missing descendant evidence after ancestor completion without inventing success", () => {
		const store = setup();
		store.ingest(connection, snapshot());
		store.updateRoot(direct({ state: "completed", endedAt: 30 }));
		expect(node(store)).toMatchObject({ state: "running", incomplete: true });
		expect(node(store)?.reasons).toContain("ancestor-terminal");
		store.ingest(connection, snapshot({ state: "completed", endedAt: 25, revision: 2 }));
		expect(node(store)?.reasons).not.toContain("ancestor-terminal");
	});
	it("keeps duplicate tool ids separate between siblings and rejects duplicates within a node", () => {
		const store = setup();
		const activeTools = [{ id: "same-full/id:1", name: "read" }];
		store.ingest(connection, snapshot({ activeTools }));
		store.ingest(connection, snapshot({ runId: "sibling", activeTools }));
		store.ingest(connection, snapshot({ revision: 2 }));
		expect(node(store)?.activeTools).toEqual([]);
		expect(node(store, "sibling")?.activeTools).toEqual(activeTools);
		expect(store.ingest(connection, snapshot({ revision: 3, activeTools: [activeTools[0], activeTools[0]] }))).toBe(
			"rejected",
		);
	});
	it("tool completion changes no lifecycle state and terminal snapshots clear activity", () => {
		const store = setup();
		store.ingest(connection, snapshot({ activeTools: [{ id: "call", name: "read" }] }));
		store.ingest(connection, snapshot({ revision: 2 }));
		expect(node(store)?.state).toBe("running");
		store.ingest(
			connection,
			snapshot({ revision: 3, state: "completed", activeTools: [{ id: "late", name: "read" }] }),
		);
		expect(node(store)?.activeTools).toEqual([]);
	});
});

describe("bounded before-parent backlog", () => {
	it("flushes multiple levels in parent-before-child order and removes the temporary marker", () => {
		const store = setup();
		expect(store.ingest(connection, snapshot({ runId: "great", parentRunId: "grand", depth: 4 }))).toBe("buffered");
		expect(store.ingest(connection, snapshot({ runId: "grand", parentRunId: "child", depth: 3 }))).toBe("buffered");
		expect(node(store, "great")).toBeUndefined();
		expect(store.tree("session", "direct")).toMatchObject({ pending: 2, incomplete: true });
		store.ingest(connection, snapshot());
		expect(store.tree("session", "direct")).toMatchObject({ pending: 0, incomplete: false });
		expect(store.tree("session", "direct")?.nodes.map((n) => n.runId)).toEqual(["direct", "child", "grand", "great"]);
	});
	it("keeps backlog identity, revisions and terminal ordering immutable", () => {
		const store = setup();
		const pending = snapshot({ runId: "grand", parentRunId: "child", depth: 3, state: "completed", revision: 2 });
		store.ingest(connection, pending);
		expect(store.ingest(connection, { ...pending, revision: 1 })).toBe("ignored");
		expect(store.ingest(connection, { ...pending, revision: 3, state: "running" })).toBe("rejected");
		expect(store.ingest(connection, { ...pending, revision: 3, owner: "other" })).toBe("rejected");
		store.ingest(connection, snapshot());
		expect(node(store, "grand")).toMatchObject({ state: "completed", revision: 2 });
	});
	it("bounds the backlog and leaves an explicit overflow marker", () => {
		const store = setup();
		for (let i = 0; i < OBSERVATION_LIMITS.backlog; i++) {
			expect(store.ingest(connection, snapshot({ runId: `pending-${i}`, parentRunId: "missing", depth: 3 }))).toBe(
				"buffered",
			);
		}
		expect(store.ingest(connection, snapshot({ runId: "overflow", parentRunId: "missing", depth: 3 }))).toBe(
			"rejected",
		);
		expect(store.tree("session", "direct")).toMatchObject({ pending: 32, incomplete: true });
		expect(store.tree("session", "direct")?.reasons).toContain("backlog-overflow");
	});
	it("expires missing parents on access without timers, retaining incomplete evidence", () => {
		let now = 0;
		const store = setup(() => now);
		store.ingest(connection, snapshot({ runId: "grand", parentRunId: "child", depth: 3 }));
		now = OBSERVATION_LIMITS.backlogMs;
		expect(store.tree("session", "direct")).toMatchObject({ pending: 0, incomplete: true });
		expect(store.tree("session", "direct")?.reasons).toContain("backlog-expired");
		store.ingest(connection, snapshot());
		expect(node(store, "grand")).toBeUndefined();
	});
	it("rejects buffered inconsistent depth once the parent registers", () => {
		const store = setup();
		store.ingest(connection, snapshot({ runId: "bad", parentRunId: "child", depth: 4 }));
		store.ingest(connection, snapshot());
		expect(node(store, "bad")).toBeUndefined();
		expect(store.tree("session", "direct")?.incomplete).toBe(true);
	});
});

describe("safety bounds and isolation", () => {
	it("retains 256 nodes per owned direct root including the root", () => {
		const store = setup();
		for (let i = 1; i < 256; i++) expect(store.ingest(connection, snapshot({ runId: `child-${i}` }))).toBe("accepted");
		expect(store.ingest(connection, snapshot({ runId: "overflow" }))).toBe("rejected");
		expect(store.tree("session", "direct")?.nodes).toHaveLength(256);
		expect(store.tree("session", "direct")?.reasons).toContain("nodes-omitted");
		store.updateRoot(direct({ id: "other" }));
		store.bindChildSession({ owner: "session", runId: "other" }, "child-session");
		expect(store.ingest({ owner: "session", runId: "other" }, snapshot({ runId: "new", parentRunId: "other" }))).toBe(
			"accepted",
		);
		expect(store.ingest(connection, snapshot({ runId: "child-1", revision: 2, state: "completed" }))).toBe("accepted");
	});
	it("bounds tools to four and visibly marks omitted activity", () => {
		const store = setup();
		store.ingest(
			connection,
			snapshot({ activeTools: Array.from({ length: 5 }, (_, i) => ({ id: `call-${i}`, name: "read" })) }),
		);
		expect(node(store)?.activeTools).toHaveLength(4);
		expect(node(store)?.reasons).toContain("tools-omitted");
		expect(store.tree("session", "direct")?.incomplete).toBe(true);
	});
	it("measures the whole incoming record in UTF-8 bytes, accepting exactly 16 KiB", () => {
		const store = setup();
		const base = { ...snapshot(), ignored: "" };
		const spare = 16384 - Buffer.byteLength(JSON.stringify(base));
		expect(store.ingest(connection, { ...base, ignored: "a".repeat(spare) })).toBe("accepted");
		expect(store.ingest(connection, { ...base, revision: 2, ignored: "a".repeat(spare + 1) })).toBe("rejected");
		expect(store.ingest(connection, { ...base, revision: 2, ignored: "界".repeat(Math.ceil(spare / 3)) })).toBe(
			"rejected",
		);
		expect(node(store)?.revision).toBe(1);
	});
	it("returns detached immutable snapshots and stable parent-first traversal", () => {
		const store = setup();
		const input = snapshot({ activeTools: [{ id: "call", name: "read" }] });
		store.ingest(connection, input);
		const old = node(store)!;
		(input.activeTools as { id: string; name: string }[])[0].name = "write";
		store.ingest(connection, snapshot({ revision: 2, state: "stopping" }));
		expect(old.state).toBe("running");
		expect(old.activeTools[0].name).toBe("read");
		expect(Object.isFrozen(old)).toBe(true);
		expect(Object.isFrozen(old.activeTools[0])).toBe(true);
		store.ingest(connection, snapshot({ runId: "sibling" }));
		store.ingest(connection, snapshot({ runId: "grand", parentRunId: "child", depth: 3 }));
		expect(store.tree("session", "direct")?.nodes.map((n) => n.runId)).toEqual(["direct", "child", "grand", "sibling"]);
	});
	it("does not change admission, run ownership, lifecycle or signals", () => {
		let signal: AbortSignal | undefined;
		const manager = new RunManager((_run, _request, hooks) => {
			signal = hooks.signal;
			return new Promise(() => {});
		});
		const agent = {
			name: "builder",
			personaPath: "p",
			persona: "private",
			tools: [],
			thinking: "off" as const,
			skills: [],
			extensions: [],
		};
		const request = {
			agent,
			task: "private task",
			cwd: "/work",
			limits: { maxDepth: 4, maxConcurrentRuns: 2 },
			nesting: direct().nesting,
		};
		const run = manager.start("session", request);
		const store = new ObservationStore();
		store.updateRoot(run);
		const source = { owner: "session", runId: run.id };
		store.bindChildSession(source, "child-session");
		store.ingest(source, snapshot({ parentRunId: run.id }));
		store.ingest(source, { ...snapshot(), task: "a".repeat(20000) });
		expect(store.node("session", run.id, "child")?.state).toBe("running");
		expect(manager.status("session", run.id)).toEqual(run);
		expect(() => manager.cancel("session", "child")).toThrow("unknown run");
		expect(signal?.aborted).toBe(false);
		expect(() => manager.start("session", request)).not.toThrow();
		expect(JSON.stringify(store.tree("session", run.id))).not.toContain("private");
	});
});

describe("subscriptions and disposal", () => {
	it("notifies only the owning tree and contains subscriber failures", () => {
		const store = setup();
		const changed = vi.fn();
		const foreign = vi.fn();
		store.subscribe("session", () => {
			throw new Error("render failed");
		});
		store.subscribe("session", async () => {
			throw new Error("async render failed");
		});
		const stop = store.subscribe("session", changed, "direct");
		store.subscribe("foreign", foreign);
		store.ingest(connection, snapshot());
		expect(changed).toHaveBeenCalledWith({ owner: "session", runId: "direct" });
		expect(foreign).not.toHaveBeenCalled();
		stop();
		store.ingest(connection, snapshot({ revision: 2 }));
		expect(changed).toHaveBeenCalledTimes(1);
	});
	it("delivers through a callback snapshot when subscriptions change", () => {
		const store = setup();
		const second = vi.fn();
		const late = vi.fn();
		let stop = () => {};
		store.subscribe("session", () => {
			stop();
			store.subscribe("session", late);
		});
		stop = store.subscribe("session", second);
		store.ingest(connection, snapshot());
		expect(second).toHaveBeenCalledTimes(1);
		expect(late).not.toHaveBeenCalled();
	});
	it("can mark a connection incomplete without fabricating terminal state", () => {
		const store = setup();
		store.ingest(connection, snapshot());
		store.markIncomplete(connection);
		expect(store.tree("session", "direct")?.reasons).toContain("connection-lost");
		expect(node(store)?.state).toBe("running");
	});
	it("disposes one owner, refuses late registration and preserves other owners", () => {
		const store = setup();
		const changed = vi.fn();
		store.subscribe("session", changed);
		store.updateRoot(
			direct({ owner: "next", id: "next-root", nesting: { ...direct().nesting!, rootSessionId: "next" } }),
		);
		store.disposeOwner("session");
		expect(store.ingest(connection, snapshot())).toBe("rejected");
		expect(store.updateRoot(direct())).toBe(false);
		expect(store.tree("session", "direct")).toBeUndefined();
		expect(store.trees("next")).toHaveLength(1);
		expect(changed).not.toHaveBeenCalled();
	});
	it("disposes all nodes and listeners idempotently and never accepts late events", () => {
		const store = setup();
		const changed = vi.fn();
		store.subscribe("session", changed);
		store.dispose();
		store.dispose();
		expect(store.trees("session")).toEqual([]);
		expect(store.ingest(connection, snapshot())).toBe("rejected");
		expect(store.updateRoot(direct())).toBe(false);
		store.markIncomplete(connection);
		expect(changed).not.toHaveBeenCalled();
	});
});

describe("additional boundaries", () => {
	it("rejects an authoritative root whose parent is itself", () => {
		const store = new ObservationStore();
		expect(store.updateRoot(direct({ nesting: { ...direct().nesting!, parentRunId: "direct", depth: 2 } }))).toBe(
			false,
		);
	});
	it("includes pending snapshots in the retained-node bound", () => {
		const store = setup();
		for (let i = 0; i < 254; i++) store.ingest(connection, snapshot({ runId: `child-${i}` }));
		expect(store.ingest(connection, snapshot({ runId: "pending", parentRunId: "child", depth: 3 }))).toBe("buffered");
		expect(store.ingest(connection, snapshot())).toBe("rejected");
		expect(store.tree("session", "direct")?.reasons).toContain("nodes-omitted");
	});
	it("keeps authoritative root tool activity bounded with automatic revisions", () => {
		const store = setup();
		store.updateRoot(direct(), { activeTools: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, name: "read" })) });
		expect(node(store, "direct")).toMatchObject({ revision: 3, incomplete: true });
		expect(node(store, "direct")?.activeTools).toHaveLength(4);
		store.updateRoot(direct({ state: "stopping" }));
		expect(node(store, "direct")?.reasons).toContain("tools-omitted");
		store.updateRoot(direct({ state: "stopping" }), { activeTools: [] });
		expect(node(store, "direct")?.reasons).not.toContain("tools-omitted");
	});
	it("allows a reused run id in a different root session without leaking either tree", () => {
		const store = setup();
		store.ingest(connection, snapshot());
		store.updateRoot(direct({ owner: "foreign", nesting: { ...direct().nesting!, rootSessionId: "foreign" } }));
		store.bindChildSession({ owner: "foreign", runId: "direct" }, "child-session");
		expect(
			store.ingest({ owner: "foreign", runId: "direct" }, snapshot({ rootSessionId: "foreign", state: "failed" })),
		).toBe("accepted");
		expect(node(store)?.state).toBe("running");
		expect(store.node("foreign", "direct", "child")?.state).toBe("failed");
	});
});
