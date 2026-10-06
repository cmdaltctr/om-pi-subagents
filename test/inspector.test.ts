import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { ObservationStore } from "../src/observation.ts";
import { Inspector } from "../src/inspector.ts";
import type { RunDetails } from "../src/details.ts";

function setup(count = 8) {
	const observations = new ObservationStore();
	observations.updateRoot({
		id: "root",
		owner: "session",
		agent: "builder",
		cwd: "/work",
		state: "running",
		startedAt: 1,
		nesting: { registryPath: "/r", rootSessionId: "session", depth: 1, maxDepth: 3 },
	});
	observations.bindChildSession({ owner: "session", runId: "root" }, "child-session");
	for (let id = 1; id < count; id++)
		observations.ingest(
			{ owner: "session", runId: "root" },
			{
				owner: "child-session",
				rootSessionId: "session",
				runId: `child-${id}`,
				parentRunId: "root",
				depth: 2,
				agent: "reader",
				state: "running",
				startedAt: 1,
				revision: 1,
				activeTools: [],
			},
		);
	const read = vi.fn(async (_root: string, id: string, _signal?: AbortSignal): Promise<RunDetails> => ({
		node: observations.node("session", "root", id)!,
		task: `Task for ${id}`,
		output: `Output for ${id}\n${"line\n".repeat(50)}`,
		outputPath: "/saved/output.md",
		partial: false,
		taskTruncated: false,
		outputTruncated: false,
	}));
	const close = vi.fn();
	const redraw = vi.fn();
	const unsubscribe = vi.fn();
	const subscribe = observations.subscribe.bind(observations);
	vi.spyOn(observations, "subscribe").mockImplementation((owner, callback, runId) => {
		const stop = subscribe(owner, callback, runId);
		return () => {
			unsubscribe();
			stop();
		};
	});
	let height = 20;
	const heightGetter = vi.fn(() => height);
	const inspector = new Inspector({ observations, owner: "session", read, close, redraw, height: heightGetter });
	return {
		observations,
		read,
		close,
		redraw,
		unsubscribe,
		inspector,
		heightGetter,
		resize: (value: number) => {
			height = value;
		},
	};
}
const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
};

describe("read-only inspector", () => {
	it("contains render failure, aborts pending reads and releases its subscription", async () => {
		const fixture = setup();
		let resolve!: (value: RunDetails) => void;
		fixture.read.mockImplementationOnce(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		fixture.inspector.handleInput("\r");
		const signal = fixture.read.mock.calls[0][2] as AbortSignal;
		fixture.heightGetter.mockImplementation(() => {
			throw new Error("render failed");
		});
		expect(() => fixture.inspector.render(80)).not.toThrow();
		expect(signal.aborted).toBe(true);
		expect(fixture.close).toHaveBeenCalledTimes(1);
		expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
		const calls = fixture.redraw.mock.calls.length;
		fixture.observations.markIncomplete({ owner: "session", runId: "root" });
		expect(fixture.redraw).toHaveBeenCalledTimes(calls);
		resolve({
			node: fixture.observations.node("session", "root", "root")!,
			outputPath: "/saved/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		await flush();
		expect(fixture.observations.node("session", "root", "root")?.state).toBe("running");
	});
	it("contains input redraw failures without leaving a rejected load promise", async () => {
		const fixture = setup();
		fixture.redraw.mockImplementation(() => {
			throw new Error("redraw failed");
		});
		expect(() => fixture.inspector.handleInput("\r")).not.toThrow();
		await flush();
		expect(fixture.close).toHaveBeenCalledTimes(1);
		expect(fixture.read).not.toHaveBeenCalled();
		expect(fixture.observations.node("session", "root", "root")?.state).toBe("running");
	});
	it("selects with arrows and reads only after Enter", async () => {
		const fixture = setup();
		fixture.inspector.render(80);
		expect(fixture.read).not.toHaveBeenCalled();
		fixture.inspector.handleInput("\x1b[B");
		fixture.inspector.handleInput("\r");
		await flush();
		expect(fixture.read).toHaveBeenCalledWith("root", "child-1", expect.any(AbortSignal));
		expect(fixture.inspector.render(80).join("\n")).toContain("Task for child-1");
		fixture.inspector.dispose();
	});
	it("keeps every retained hidden agent selectable", async () => {
		const fixture = setup(20);
		for (let index = 0; index < 19; index++) fixture.inspector.handleInput("\x1b[B");
		fixture.inspector.handleInput("\r");
		await flush();
		expect(fixture.read).toHaveBeenCalledWith("root", "child-19", expect.any(AbortSignal));
		fixture.inspector.dispose();
	});
	it("consumes fullscreen row clicks and opens the selected details", async () => {
		const fixture = setup();
		fixture.inspector.render(80);
		expect(
			fixture.inspector.handleMouse({
				type: "click",
				button: "left",
				x: 3,
				y: 2,
				screenX: 3,
				screenY: 2,
				width: 80,
				height: 20,
				shift: false,
				ctrl: false,
				alt: false,
			})?.handled,
		).toBe(true);
		await flush();
		expect(fixture.read).toHaveBeenCalledWith("root", "child-1", expect.any(AbortSignal));
		fixture.inspector.dispose();
	});
	it("W3: a nested fullscreen click reads the grandchild's own task and output without changing its sibling", async () => {
		const fixture = setup(2);
		fixture.resize(40);
		const connection = { owner: "session", runId: "root" };
		const parent = fixture.observations.node("session", "root", "child-1")!;
		expect(
			fixture.observations.ingest(connection, {
				...parent,
				childSessionId: "grandchild-session",
				revision: parent.revision + 1,
			}),
		).toBe("accepted");
		expect(
			fixture.observations.ingest(connection, {
				owner: "grandchild-session",
				rootSessionId: "session",
				runId: "grandchild",
				parentRunId: "child-1",
				depth: 3,
				agent: "nested-reader",
				state: "running",
				startedAt: 1,
				revision: 1,
				activeTools: [],
			}),
		).toBe("accepted");
		expect(
			fixture.observations.ingest(connection, {
				...fixture.observations.node("session", "root", "grandchild")!,
				runId: "child-2",
				agent: "reader",
			}),
		).toBe("accepted");
		const sibling = fixture.observations.node("session", "root", "child-2");
		expect(sibling?.parentRunId).toBe("child-1");
		fixture.inspector.render(100);
		expect(
			fixture.inspector.handleMouse({
				type: "click",
				button: "left",
				x: 3,
				y: 3,
				screenX: 3,
				screenY: 3,
				width: 100,
				height: 40,
				shift: false,
				ctrl: false,
				alt: false,
			})?.handled,
		).toBe(true);
		await flush();
		expect(fixture.read).toHaveBeenCalledWith("root", "grandchild", expect.any(AbortSignal));
		const text = fixture.inspector.render(100).join("\n");
		expect(text).toContain("Task for grandchild");
		expect(text).toContain("Output for grandchild");
		expect(text).not.toContain("Task for child-1");
		expect(text).not.toContain("Output for child-2");
		expect(fixture.observations.node("session", "root", "child-2")).toEqual(sibling);
		expect(sibling?.state).toBe("running");
		fixture.inspector.dispose();
	});
	it.each(["connection-lost", "nodes-omitted"] as const)(
		"W2: shows tree-level %s while retained nodes stay complete, without detail I/O",
		(reason) => {
			const fixture = setup(2);
			fixture.resize(40);
			fixture.observations.markIncomplete({ owner: "session", runId: "root" }, reason);
			const before = fixture.observations.tree("session", "root");
			expect(before?.nodes.every((node) => !node.incomplete)).toBe(true);
			fixture.inspector.handleInput("\x1b[B");
			const text = fixture.inspector.render(100).join("\n");
			expect(text).toContain(`Tree observation incomplete: ${reason}`);
			expect(text).not.toContain("Selected observation incomplete");
			expect(text).not.toContain("hidden agents");
			expect(fixture.read).not.toHaveBeenCalled();
			expect(fixture.observations.tree("session", "root")).toEqual(before);
			for (const line of fixture.inspector.render(18)) expect(visibleWidth(line)).toBeLessThanOrEqual(18);
			expect(fixture.inspector.render(18).length).toBeLessThanOrEqual(40);
			fixture.inspector.dispose();
		},
	);
	it("W2: shows selected missing terminal evidence and removes warnings when that evidence recovers", async () => {
		const fixture = setup(2);
		fixture.resize(40);
		fixture.inspector.handleInput("\x1b[B");
		fixture.inspector.handleInput("\r");
		await flush();
		const root = fixture.observations.node("session", "root", "root")!;
		fixture.observations.updateRoot({
			id: root.runId,
			owner: root.owner,
			agent: root.agent,
			cwd: "/work",
			state: "completed",
			startedAt: 1,
			nesting: { registryPath: "/r", rootSessionId: "session", depth: 1, maxDepth: 3 },
		});
		let text = fixture.inspector.render(100).join("\n");
		expect(text).toContain("Tree observation incomplete: ancestor-terminal");
		expect(text).toContain("Selected observation incomplete: ancestor-terminal");
		expect(text).toContain("terminal evidence missing");
		expect(text).toContain("State: running");
		expect(fixture.observations.node("session", "root", "child-1")?.state).toBe("running");
		const child = fixture.observations.node("session", "root", "child-1")!;
		expect(
			fixture.observations.ingest(
				{ owner: "session", runId: "root" },
				{
					...child,
					state: "completed",
					revision: child.revision + 1,
				},
			),
		).toBe("accepted");
		await flush();
		text = fixture.inspector.render(100).join("\n");
		expect(text).not.toMatch(/observation incomplete|terminal evidence missing/i);
		expect(text).toContain("State: completed");
		fixture.inspector.dispose();
	});
	it.each(["loss", "recovery"])(
		"W2: renders fresh evidence around a delayed selected read during %s",
		async (change) => {
			const fixture = setup(2);
			fixture.resize(40);
			const connection = { owner: "session", runId: "root" };
			if (change === "recovery") fixture.observations.replaceReasons(connection, "root", 1, ["tools-omitted"]);
			const stale = fixture.observations.node("session", "root", "root")!;
			let resolve!: (value: RunDetails) => void;
			fixture.read.mockImplementationOnce(
				async () =>
					new Promise((done) => {
						resolve = done;
					}),
			);
			fixture.inspector.handleInput("\r");
			if (change === "loss") fixture.observations.markIncomplete(connection);
			else fixture.observations.replaceReasons(connection, "root", 2, []);
			resolve({
				node: stale,
				task: "Delayed task",
				outputPath: "/saved/output.md",
				partial: false,
				taskTruncated: false,
				outputTruncated: false,
			});
			await flush();
			const text = fixture.inspector.render(100).join("\n");
			expect(text).toContain("Delayed task");
			if (change === "loss") expect(text).toContain("Tree observation incomplete: connection-lost");
			else expect(text).not.toMatch(/observation incomplete|tools-omitted/i);
			expect(fixture.read).toHaveBeenCalledTimes(1);
			fixture.inspector.dispose();
		},
	);
	it("Escape closes only the viewer and detaches its display listener", () => {
		const fixture = setup();
		fixture.inspector.handleInput("\x1b");
		expect(fixture.close).toHaveBeenCalledTimes(1);
		expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
		const calls = fixture.redraw.mock.calls.length;
		fixture.observations.updateRoot({
			id: "root",
			owner: "session",
			agent: "builder",
			cwd: "/work",
			state: "running",
			startedAt: 1,
			nesting: { registryPath: "/r", rootSessionId: "session", depth: 1, maxDepth: 3 },
		});
		expect(fixture.redraw).toHaveBeenCalledTimes(calls);
		expect(fixture.observations.node("session", "root", "root")?.state).toBe("running");
	});
	it("reflows narrow widths and heights without changing selection", async () => {
		const fixture = setup();
		fixture.inspector.handleInput("\x1b[B");
		fixture.resize(8);
		for (const line of fixture.inspector.render(18)) expect(visibleWidth(line)).toBeLessThanOrEqual(18);
		expect(fixture.inspector.render(18).length).toBeLessThanOrEqual(8);
		fixture.inspector.handleInput("\r");
		await flush();
		expect(fixture.read).toHaveBeenCalledWith("root", "child-1", expect.any(AbortSignal));
		fixture.inspector.dispose();
	});
	it("shows full selected identity, lineage, known model and partial truncation labels", async () => {
		const fixture = setup(2);
		fixture.read.mockImplementation(async () => ({
			node: fixture.observations.node("session", "root", "child-1")!,
			task: "Sensitive selected task",
			output: "Partial answer",
			outputPath: "/saved/output.md",
			partial: true,
			taskTruncated: false,
			outputTruncated: true,
		}));
		fixture.inspector.handleInput("\x1b[B");
		fixture.inspector.handleInput("\r");
		await flush();
		const text = fixture.inspector.render(100).join("\n");
		expect(text).toContain("child-1");
		expect(text).toContain("root");
		expect(text).toContain("Model: unavailable");
		expect(text).toContain("Partial output");
		fixture.inspector.handleInput("\x1b[6~");
		expect(fixture.inspector.render(100).join("\n")).toContain("/saved/output.md");
		fixture.inspector.dispose();
	});
	it("drops delayed reads after selecting a different agent", async () => {
		const fixture = setup();
		let resolve!: (value: RunDetails) => void;
		fixture.read.mockImplementationOnce(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		fixture.inspector.handleInput("\r");
		fixture.inspector.handleInput("\x1b[B");
		resolve({
			node: fixture.observations.node("session", "root", "root")!,
			task: "OLD TASK MUST NOT APPEAR",
			outputPath: "/saved/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		await flush();
		expect(fixture.inspector.render(80).join("\n")).not.toContain("OLD TASK MUST NOT APPEAR");
		fixture.inspector.dispose();
	});
});

/** Root, two direct children and one grandchild beneath the first child. */
function nestedSetup() {
	const observations = new ObservationStore();
	observations.updateRoot({
		id: "root",
		owner: "session",
		agent: "builder",
		cwd: "/work",
		state: "running",
		startedAt: 1,
		nesting: { registryPath: "/r", rootSessionId: "session", depth: 1, maxDepth: 3 },
	});
	observations.bindChildSession({ owner: "session", runId: "root" }, "child-session");
	const child = (runId: string, parentRunId: string, depth: number, owner = "child-session") =>
		observations.ingest(
			{ owner: "session", runId: "root" },
			{
				owner,
				rootSessionId: "session",
				runId,
				parentRunId,
				depth,
				agent: "reader",
				state: "running",
				startedAt: 1,
				revision: 1,
				activeTools: [],
			},
		);
	child("child-1", "root", 2);
	// Deeper hops announce their own child session before their snapshots are accepted.
	const first = observations.node("session", "root", "child-1")!;
	expect(
		observations.ingest(
			{ owner: "session", runId: "root" },
			{ ...first, childSessionId: "grandchild-session", revision: first.revision + 1 },
		),
	).toBe("accepted");
	child("grandchild", "child-1", 3, "grandchild-session");
	child("child-2", "root", 2);
	const read = vi.fn(async (_root: string, id: string, _signal?: AbortSignal): Promise<RunDetails> => ({
		node: observations.node("session", "root", id)!,
		task: `Task for ${id}`,
		output: `Output for ${id}`,
		outputPath: "/saved/output.md",
		partial: false,
		taskTruncated: false,
		outputTruncated: false,
	}));
	const inspector = new Inspector({
		observations,
		owner: "session",
		read,
		close: vi.fn(),
		redraw: vi.fn(),
		height: () => 30,
	});
	return { observations, read, inspector };
}

describe("session tree modal", () => {
	it("orders rows parent-first with indentation beneath the immediate parent", () => {
		const { inspector } = nestedSetup();
		const lines = inspector.render(100);
		const rowOf = (runId: string) => lines.findIndex((line) => line.includes(runId));
		const indentOf = (runId: string) => /^\s*/.exec(lines[rowOf(runId)])![0].length;
		expect(rowOf("root")).toBeGreaterThanOrEqual(0);
		expect(rowOf("child-1")).toBeGreaterThan(rowOf("root"));
		expect(rowOf("grandchild")).toBeGreaterThan(rowOf("child-1"));
		expect(rowOf("child-2")).toBeGreaterThan(rowOf("grandchild"));
		expect(indentOf("child-1")).toBeGreaterThan(indentOf("root"));
		expect(indentOf("grandchild")).toBeGreaterThan(indentOf("child-1"));
		expect(indentOf("child-2")).toBe(indentOf("child-1"));
		inspector.dispose();
	});

	it("folds and unfolds a branch without discarding retained nodes", () => {
		const { inspector, observations } = nestedSetup();
		inspector.render(100);
		// Select child-1, then fold its branch: the grandchild row disappears.
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\x1b[D");
		expect(inspector.render(100).join("\n")).not.toContain("grandchild");
		expect(observations.node("session", "root", "grandchild")).toBeDefined();
		inspector.handleInput("\x1b[C");
		expect(inspector.render(100).join("\n")).toContain("grandchild");
		inspector.dispose();
	});

	it("keeps every retained descendant reachable through unfolding", async () => {
		const { inspector, read } = nestedSetup();
		inspector.render(100);
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\x1b[D");
		inspector.handleInput("\r");
		await flush();
		expect(read).toHaveBeenLastCalledWith("root", "child-1", expect.any(AbortSignal));
		inspector.handleInput("\x1b[C");
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\r");
		await flush();
		expect(read).toHaveBeenLastCalledWith("root", "grandchild", expect.any(AbortSignal));
		inspector.dispose();
	});

	it("keeps selection attached to run identity across folds and refreshes", () => {
		const { inspector, observations } = nestedSetup();
		inspector.render(100);
		// Fold the first branch from its own row; the folded row keeps the selection.
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\x1b[D");
		expect(inspector.render(100).join("\n")).not.toContain("grandchild");
		expect(inspector.render(100).some((line) => line.startsWith("> ") && line.includes("child-1"))).toBe(true);
		inspector.handleInput("\x1b[C");
		// A fresh refresh keeps the same selected run id on a later sibling.
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\x1b[B");
		observations.updateRoot({
			id: "root",
			owner: "session",
			agent: "builder",
			cwd: "/work",
			state: "running",
			startedAt: 1,
			nesting: { registryPath: "/r", rootSessionId: "session", depth: 1, maxDepth: 3 },
		});
		const lines = inspector.render(100);
		expect(lines.some((line) => line.startsWith("> ") && line.includes("child-2"))).toBe(true);
		inspector.dispose();
	});

	it("shows the provisional assistant preview in selected details, labelled provisional", async () => {
		const { inspector, observations } = nestedSetup();
		inspector.render(100);
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\r");
		await flush();
		expect(inspector.render(100).join("\n")).not.toMatch(/provisional/i);
		expect(
			observations.ingest(
				{ owner: "session", runId: "root" },
				{
					...(observations.node("session", "root", "child-1") as unknown as Record<string, unknown>),
					revision: (observations.node("session", "root", "child-1")!.revision ?? 1) + 1,
					assistantPreview: "Latest visible answer text",
					taskSummary: "Update validation",
				},
			),
		).toBe("accepted");
		await flush();
		const text = inspector.render(100).join("\n");
		expect(text).toContain("Latest visible answer text");
		expect(text).toMatch(/provisional/i);
		inspector.dispose();
	});

	it("updates live rows and previews while the modal stays open", async () => {
		const { inspector, observations } = nestedSetup();
		inspector.render(100);
		inspector.handleInput("\x1b[B");
		inspector.handleInput("\r");
		await flush();
		const child = observations.node("session", "root", "child-1")!;
		expect(
			observations.ingest(
				{ owner: "session", runId: "root" },
				{ ...child, state: "completed", revision: child.revision + 1 },
			),
		).toBe("accepted");
		await flush();
		const lines = inspector.render(100).join("\n");
		expect(lines).toMatch(/reader completed \(child-1\)/);
		expect(lines).toContain("Task for child-1");
		inspector.dispose();
	});
});
