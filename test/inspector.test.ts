import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { ObservationStore } from "../src/observation.ts";
import { Inspector } from "../src/inspector.ts";
import type { RunDetails } from "../src/details.ts";
import { inspectorFixture, flushInspector, keys, syntheticTheme } from "./fixtures/inspector-synthetic.ts";

function setup(count = 8, maxDepth = 3) {
	const observations = new ObservationStore();
	observations.updateRoot({
		id: "root",
		owner: "session",
		agent: "builder",
		cwd: "/work",
		state: "running",
		startedAt: 1,
		nesting: { registryPath: "/r", rootSessionId: "session", depth: 1, maxDepth },
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
		// The top margin moves the child row down by one terminal row.
		expect(
			fixture.inspector.handleMouse({
				type: "click",
				button: "left",
				x: 3,
				y: 3,
				screenX: 3,
				screenY: 3,
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
		// The top margin moves the grandchild row down by one terminal row.
		expect(
			fixture.inspector.handleMouse({
				type: "click",
				button: "left",
				x: 3,
				y: 4,
				screenX: 3,
				screenY: 4,
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
		fixture.inspector.handleInput("\x1b[C");
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

describe("inspector margins and wrapped picker text", () => {
	it.each(["picker", "details"])("keeps four margins and the footer at 80x24 on %s", async (screen) => {
		const fixture = inspectorFixture();
		fixture.resize(24);
		fixture.observations.updateRoot(fixture.root, { taskSummary: "X".repeat(160) });
		fixture.read.mockResolvedValue({
			node: fixture.observations.node("session", "root", "root")!,
			task: "X".repeat(200),
			outputPath: "/synthetic/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		if (screen === "details") {
			fixture.inspector.handleInput(keys.enter);
			await flushInspector();
		}
		const lines = fixture.inspector.render(80).map(stripVTControlCharacters);
		expect(lines).toHaveLength(24);
		expect(lines[0].trim()).toBe("");
		expect(lines[23].trim()).toBe("");
		expect(lines[1].slice(0, 16)).toBe("  OMPS inspector");
		for (const line of lines.filter((value) => value.trim())) {
			expect(line.startsWith("  ")).toBe(true);
			expect(visibleWidth(line)).toBeLessThanOrEqual(78);
		}
		expect(lines.some((line) => visibleWidth(line) === 78)).toBe(true);
		expect(lines[22]).toContain(screen === "picker" ? "Esc close" : "Esc back");
		fixture.inspector.dispose();
	});

	it.each(["picker", "details"])("drops only the unavailable margins on %s", async (screen) => {
		const fixture = inspectorFixture();
		if (screen === "details") {
			fixture.inspector.handleInput(keys.enter);
			await flushInspector();
		}
		for (const [width, height] of [
			[30, 24],
			[80, 8],
			[30, 8],
			[39, 9],
			[40, 10],
		]) {
			fixture.resize(height);
			const lines = fixture.inspector.render(width).map(stripVTControlCharacters);
			const x = width >= 40 ? 2 : 0;
			const y = height >= 10 ? 1 : 0;
			expect(lines).toHaveLength(height);
			expect(lines[y].slice(0, x + 14)).toBe(`${" ".repeat(x)}OMPS inspector`);
			if (y) {
				expect(lines[0].trim()).toBe("");
				expect(lines.at(-1)!.trim()).toBe("");
			}
			const footer = lines[height - y - 1];
			expect(footer).toContain(screen === "picker" ? "↑↓ select" : "Lines ");
			for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width - x);
		}
		fixture.inspector.dispose();
	});

	it.each(["picker", "details"])("reserves the footer at height two on %s", async (screen) => {
		const fixture = inspectorFixture();
		fixture.resize(2);
		if (screen === "details") {
			fixture.inspector.handleInput(keys.enter);
			await flushInspector();
		}
		const lines = fixture.inspector.render(80);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("builder");
		expect(lines[1]).toContain(screen === "picker" ? "Esc close" : "Esc back");
		fixture.inspector.dispose();
	});

	it("keeps the selected agent alone at height one", () => {
		const fixture = inspectorFixture();
		fixture.inspector.handleInput(keys.down);
		fixture.resize(1);
		const lines = fixture.inspector.render(80);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain(">   reader-1");
		expect(lines[0]).not.toContain("Esc");
		fixture.inspector.dispose();
	});

	it.each([18, 30, 80])("keeps the selected detail agent visible at height one and width %i", async (width) => {
		const fixture = inspectorFixture();
		fixture.inspector.handleInput(keys.down);
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		fixture.resize(1);
		const lines = fixture.inspector.render(width).map(stripVTControlCharacters);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("reader-1");
		expect(lines[0]).not.toContain("Esc");
		expect(visibleWidth(lines[0])).toBeLessThanOrEqual(width);
		fixture.inspector.dispose();
	});

	it("wraps a nested summary at its agent indent and caps it at three lines with an ellipsis", () => {
		const fixture = inspectorFixture();
		const child = fixture.observations.node("session", "root", "child-1")!;
		expect(
			fixture.observations.ingest(
				{ owner: "session", runId: "root" },
				{
					...child,
					revision: child.revision + 1,
					taskSummary: "Summary " + "界 segment ".repeat(14) + "TAIL",
				},
			),
		).toBe("accepted");
		fixture.inspector.handleInput(keys.down);
		fixture.resize(24);
		const lines = fixture.inspector.render(44).map(stripVTControlCharacters);
		const row = lines.findIndex((line) => line.includes(">   reader-1"));
		const summaries = lines.slice(row + 1, row + 4);
		expect(summaries).toHaveLength(3);
		expect(summaries[0]).toContain("Summary");
		for (const line of summaries) {
			expect(line).toMatch(/^ {6}\S/);
			expect(line).toContain("segment");
			expect(visibleWidth(line)).toBeLessThanOrEqual(42);
		}
		expect(summaries[2]).toMatch(/…$/);
		expect(summaries.join("\n")).not.toContain("TAIL");
		expect(lines[row + 4]).toContain("reader-2");
		fixture.inspector.dispose();
	});

	it.each([18, 30, 31])(
		"bounds deep-chain indentation to keep the selected name and summary visible at width %i",
		(width) => {
			const fixture = setup(1, 21);
			fixture.resize(10);
			const connection = { owner: "session", runId: "root" };
			try {
				for (let index = 1; index <= 20; index++) {
					expect(
						fixture.observations.ingest(connection, {
							owner: index === 1 ? "child-session" : `chain-session-${index}`,
							rootSessionId: "session",
							runId: `chain-${index}`,
							parentRunId: index === 1 ? "root" : `chain-${index - 1}`,
							childSessionId: `chain-session-${index + 1}`,
							depth: index + 1,
							agent: `reader-${index}`,
							state: "running",
							startedAt: 1,
							revision: 1,
							activeTools: [],
							...(index === 20 ? { taskSummary: "界".repeat(100) + "TAIL" } : {}),
						}),
					).toBe("accepted");
					fixture.inspector.handleInput(keys.down);
				}
				const lines = fixture.inspector.render(width).map(stripVTControlCharacters);
				const row = lines.findIndex((line) => line.startsWith("> "));
				expect(lines[row]).toContain("reader-20");
				for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				if (width < 30) {
					expect(lines.join("\n")).not.toContain("界");
				} else {
					const nameColumn = lines[row].indexOf("reader-20");
					expect(width - nameColumn).toBeGreaterThanOrEqual(2);
					const summaries = lines.slice(row + 1, row + 4);
					expect(summaries).toHaveLength(3);
					for (const line of summaries) {
						expect(line.indexOf("界")).toBe(nameColumn);
						expect(line.trim()).toMatch(/^界+…?$/);
					}
					expect(summaries[2]).toMatch(/…$/);
					expect(lines[row + 4]).not.toContain("界");
					expect(summaries.join("\n")).not.toContain("TAIL");
				}
				expect(fixture.read).not.toHaveBeenCalled();
			} finally {
				fixture.inspector.dispose();
			}
		},
	);

	it("wraps a complete summary without adding an ellipsis", () => {
		const fixture = inspectorFixture();
		const summary = "Summary " + "word ".repeat(18) + "END";
		fixture.observations.updateRoot(fixture.root, { taskSummary: summary });
		const lines = fixture.inspector.render(80).map(stripVTControlCharacters);
		const row = lines.findIndex((line) => line.includes("> builder"));
		const summaries = lines.slice(row + 1, row + 3);
		expect(summaries.map((line) => line.trim()).join(" ")).toBe(summary);
		expect(lines[row + 3]).toContain("reader-1");
		expect(summaries.join("")).not.toContain("…");
		fixture.inspector.dispose();
	});

	it("wraps the complete warning beyond three lines and retains its warning colour", () => {
		const fixture = inspectorFixture({ theme: syntheticTheme() });
		fixture.resize(24);
		const connection = { owner: "session", runId: "root" };
		for (const reason of [
			"connection-lost",
			"nodes-omitted",
			"tools-omitted",
			"ancestor-terminal",
			"backlog-expired",
		] as const)
			fixture.observations.markIncomplete(connection, reason);
		const warning = `Tree observation incomplete: ${fixture.observations.tree("session", "root")!.reasons.join(", ")}`;
		const lines = fixture.inspector.render(30);
		const start = lines.findIndex((line) => stripVTControlCharacters(line).includes("Tree observation"));
		const end = lines.findIndex((line, index) => index > start && stripVTControlCharacters(line).includes("reader-1"));
		const wrapped = lines.slice(start, end);
		expect(wrapped.length).toBeGreaterThan(3);
		expect(wrapped.map((line) => stripVTControlCharacters(line).trim()).join(" ")).toBe(warning);
		for (const line of wrapped) {
			expect(line).toContain("\x1b[33m");
			expect(visibleWidth(line)).toBeLessThanOrEqual(30);
			expect(line).not.toContain("…");
		}
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
		inspector.handleInput("\x1b");
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
		// The horizontal margin now precedes the selected-row marker.
		expect(inspector.render(100).some((line) => line.startsWith("  > ") && line.includes("child-1"))).toBe(true);
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
		// Selection still uses the same marker inside the horizontal margin.
		expect(lines.some((line) => line.startsWith("  > ") && line.includes("child-2"))).toBe(true);
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
		expect(lines).toContain("reader · completed");
		expect(lines).toContain("Run: child-1");
		expect(lines).toContain("Task for child-1");
		inspector.dispose();
	});
});
