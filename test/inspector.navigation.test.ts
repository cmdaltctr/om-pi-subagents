import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { inspectorFixture, flushInspector, keys, mouse } from "./fixtures/inspector-synthetic.ts";

const view = (fixture: ReturnType<typeof inspectorFixture>, width = 100) =>
	fixture.inspector.render(width).map(stripVTControlCharacters);
const range = (fixture: ReturnType<typeof inspectorFixture>) => {
	// The bottom margin now follows the footer, so read the final non-blank row.
	const footer = view(fixture).findLast((line) => line.trim())!;
	const match = /Lines (\d+)–(\d+)\/(\d+)/.exec(footer);
	expect(match, footer).not.toBeNull();
	return match!.slice(1).map(Number);
};
function preview(fixture: ReturnType<typeof inspectorFixture>, count = 80) {
	fixture.observations.updateRoot(fixture.root, {
		assistantPreview: Array.from({ length: count }, (_, i) => `Live line ${i} synthetic content for wrapping`).join(
			"\n\n",
		),
	});
}

describe("single-column inspector viewport", () => {
	it.each([30, 100, 160])("opens padded single-column picker-origin details at %i columns", async (width) => {
		const fixture = inspectorFixture();
		fixture.read.mockResolvedValue({
			node: fixture.observations.node("session", "root", "root")!,
			task: "FULL-WIDTH-TASK",
			output: "answer",
			outputPath: "/synthetic/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		fixture.inspector.render(width);
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		const lines = view(fixture, width);
		// Wide terminals now reserve two columns on each side of the detail body.
		expect(lines.find((line) => line.includes("FULL-WIDTH-TASK"))).toBe(`${width >= 40 ? "  " : ""}FULL-WIDTH-TASK`);
		expect(lines.join("\n")).not.toContain("reader-1");
		fixture.inspector.handleInput(keys.escape);
		expect(view(fixture, width).join("\n")).toContain("reader-1");
		expect(fixture.close).not.toHaveBeenCalled();
		fixture.inspector.handleInput(keys.escape);
		expect(fixture.close).toHaveBeenCalledOnce();
	});
	it("pages a provisional-only narrow detail body while a file read is pending", () => {
		const fixture = inspectorFixture();
		preview(fixture);
		fixture.read.mockImplementation(async () => new Promise(() => {}));
		fixture.inspector.render(45);
		fixture.inspector.handleInput(keys.enter);
		// Exclude the top margin, both narrow-detail headers, the footer and the bottom margin.
		const before = view(fixture, 45).slice(3, -2).join("\n");
		fixture.inspector.handleInput(keys.pageDown);
		const after = view(fixture, 45).slice(3, -2).join("\n");
		expect(after).not.toBe(before);
		expect(after).toContain("Live line");
		expect(fixture.read).toHaveBeenCalledTimes(1);
		fixture.inspector.dispose();
	});
	it("opens a run id directly and Escape closes at every width", async () => {
		const fixture = inspectorFixture({ selectedRunId: "child-5" });
		await flushInspector();
		for (const width of [18, 100, 160]) {
			const lines = view(fixture, width);
			// The normal-height header now follows the top margin at every width.
			expect(lines[1]).toContain("OMPS inspector");
			expect(lines.join("\n")).not.toContain("reader-6");
			for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
		fixture.inspector.handleInput(keys.escape);
		expect(fixture.close).toHaveBeenCalledOnce();
	});
	it.each(["loading", "error", "saved"])(
		"scrolls every key with %s evidence and keeps the same agent",
		async (state) => {
			const fixture = inspectorFixture();
			preview(fixture);
			if (state === "loading") fixture.read.mockImplementation(async () => new Promise(() => {}));
			if (state === "error") fixture.read.mockRejectedValue(new Error("synthetic evidence failure"));
			fixture.inspector.handleInput(keys.enter);
			await flushInspector();
			fixture.inspector.render(100);
			expect(range(fixture)[0]).toBe(1);
			fixture.inspector.handleInput(keys.down);
			expect(range(fixture)[0]).toBe(2);
			fixture.inspector.handleInput(keys.up);
			expect(range(fixture)[0]).toBe(1);
			fixture.inspector.handleInput(keys.pageDown);
			expect(range(fixture)[0]).toBeGreaterThan(2);
			fixture.inspector.handleInput(keys.pageUp);
			expect(range(fixture)[0]).toBe(1);
			fixture.inspector.handleInput(keys.end);
			const bottom = range(fixture);
			expect(bottom[1]).toBe(bottom[2]);
			expect(view(fixture).join("\n")).toContain(
				state === "loading"
					? "Reading selected saved files"
					: state === "error"
						? "synthetic evidence failure"
						: "/synthetic/output.md",
			);
			fixture.inspector.handleInput(keys.home);
			expect(range(fixture)[0]).toBe(1);
			expect(fixture.read).toHaveBeenCalledTimes(1);
			fixture.inspector.dispose();
		},
	);
	it("preserves an offset on append, replacement and terminal refresh, and follows only from the bottom", async () => {
		const fixture = inspectorFixture();
		fixture.read.mockResolvedValue({
			node: fixture.observations.node("session", "root", "root")!,
			outputPath: "/synthetic/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		preview(fixture, 65);
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		fixture.inspector.render(100);
		fixture.inspector.handleInput(keys.pageDown);
		const offset = range(fixture)[0];
		preview(fixture, 75);
		expect(range(fixture)[0]).toBe(offset);
		fixture.observations.updateRoot(fixture.root, {
			assistantPreview: "replacement with enough synthetic content to wrap ".repeat(75),
		});
		expect(range(fixture)[0]).toBe(offset);
		fixture.observations.updateRoot({ ...fixture.root, state: "completed", endedAt: 9000 });
		await flushInspector();
		expect(fixture.read).toHaveBeenCalledTimes(2);
		expect(range(fixture)[0]).toBe(offset);
		fixture.inspector.handleInput(keys.end);
		fixture.observations.updateRoot(
			{ ...fixture.root, state: "completed", endedAt: 9000 },
			{ assistantPreview: "appended with enough synthetic content to wrap ".repeat(85) },
		);
		let position = range(fixture);
		expect(position[1]).toBe(position[2]);
		fixture.inspector.handleInput(keys.up);
		const stopped = range(fixture)[0];
		fixture.observations.updateRoot(
			{ ...fixture.root, state: "completed", endedAt: 9000 },
			{ assistantPreview: "changed with enough synthetic content to wrap ".repeat(90) },
		);
		expect(range(fixture)[0]).toBe(stopped);
		// Width changes preserve the vertical margin, with the footer on the penultimate row.
		expect(view(fixture, 30).at(-2)).toContain(`Lines ${stopped}–`);
		expect(range(fixture)[0]).toBe(stopped);
		fixture.resize(8);
		expect(range(fixture)[0]).toBe(stopped);
		fixture.observations.updateRoot(
			{ ...fixture.root, state: "completed", endedAt: 9000 },
			{ assistantPreview: "short" },
		);
		position = range(fixture);
		expect(position[0]).toBeLessThan(stopped);
		for (const height of [1, 2, 3, 8]) {
			fixture.resize(height);
			const lines = view(fixture, 8);
			expect(lines.length).toBeLessThanOrEqual(height);
			for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(8);
		}
		fixture.inspector.dispose();
	});
	it("refreshes output when completion races an in-flight read containing older output", async () => {
		const fixture = inspectorFixture();
		fixture.resize(300);
		const stale = fixture.observations.node("session", "root", "root")!;
		let resolve!: (value: Awaited<ReturnType<typeof fixture.read>>) => void;
		fixture.read.mockImplementationOnce(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		fixture.inspector.handleInput(keys.enter);
		fixture.observations.updateRoot({ ...fixture.root, state: "completed", endedAt: 9000 });
		resolve({
			node: stale,
			task: "Task",
			output: "STALE RUNNING OUTPUT",
			outputPath: "/synthetic/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		await flushInspector();
		expect(fixture.read).toHaveBeenCalledTimes(2);
		expect(view(fixture).join("\n")).not.toContain("STALE RUNNING OUTPUT");
		expect(view(fixture).join("\n")).toContain("Saved line 99");
		fixture.inspector.dispose();
	});
	it("switches detail agents with Left/Right, aborting stale evidence", async () => {
		const fixture = inspectorFixture();
		let resolve!: (value: Awaited<ReturnType<typeof fixture.read>>) => void;
		fixture.read.mockImplementationOnce(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		fixture.inspector.handleInput(keys.enter);
		const signal = fixture.read.mock.calls[0][2]!;
		fixture.inspector.handleInput(keys.right);
		expect(signal.aborted).toBe(true);
		resolve({
			node: fixture.observations.node("session", "root", "root")!,
			task: "STALE TASK",
			outputPath: "/synthetic/output.md",
			partial: false,
			taskTruncated: false,
			outputTruncated: false,
		});
		await flushInspector();
		expect(view(fixture).join("\n")).toContain("Task for child-1");
		expect(view(fixture).join("\n")).not.toContain("STALE TASK");
		fixture.inspector.handleInput(keys.left);
		await flushInspector();
		expect(view(fixture).join("\n")).toContain("Task for root");
		fixture.inspector.dispose();
	});
	it("maps windowed two-line picker clicks to the rendered identity", async () => {
		const fixture = inspectorFixture();
		for (let i = 0; i < 17; i++) fixture.inspector.handleInput(keys.down);
		const lines = view(fixture);
		const y = lines.findIndex((line) => line.includes("Synthetic task 17"));
		expect(y).toBeGreaterThan(0);
		expect(fixture.inspector.handleMouse(mouse("click", y))?.handled).toBe(true);
		await flushInspector();
		expect(fixture.read).toHaveBeenLastCalledWith("root", "child-17", expect.any(AbortSignal));
		expect(view(fixture).join("\n")).toContain("Task for child-17");
		fixture.inspector.dispose();
	});
	it.each([0, 1, 2, 3])("maps wrapped picker line %i to its agent after the top margin", async (offset) => {
		const fixture = inspectorFixture();
		const child = fixture.observations.node("session", "root", "child-1")!;
		expect(
			fixture.observations.ingest(
				{ owner: "session", runId: "root" },
				{
					...child,
					revision: child.revision + 1,
					taskSummary: "WRAPPED " + "summary ".repeat(18),
				},
			),
		).toBe("accepted");
		const lines = view(fixture, 44);
		const row = lines.findIndex((line) => line.includes("reader-1 "));
		expect(row).toBeGreaterThan(0);
		expect(fixture.inspector.handleMouse(mouse("click", row + offset))?.handled).toBe(true);
		await flushInspector();
		expect(fixture.read).toHaveBeenLastCalledWith("root", "child-1", expect.any(AbortSignal));
		fixture.inspector.dispose();
	});
	it("leaves picker margins, header and footer outside the row map", () => {
		const fixture = inspectorFixture();
		fixture.resize(24);
		fixture.inspector.render(80);
		for (const y of [0, 1, 22, 23]) expect(fixture.inspector.handleMouse(mouse("click", y))).toBeUndefined();
		expect(fixture.read).not.toHaveBeenCalled();
		fixture.inspector.dispose();
	});
	it("keeps the padded detail header outside the wheel viewport", async () => {
		const fixture = inspectorFixture();
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		fixture.inspector.render(100);
		expect(fixture.inspector.handleMouse(mouse("wheel", 1))).toBeUndefined();
		expect(fixture.inspector.handleMouse(mouse("wheel", 2))?.handled).toBe(true);
		fixture.inspector.dispose();
	});
	it("keeps selected picker identity visible at tiny heights with incomplete evidence", () => {
		const fixture = inspectorFixture();
		fixture.observations.markIncomplete({ owner: "session", runId: "root" });
		fixture.resize(1);
		expect(view(fixture)[0]).toContain("builder");
		expect(view(fixture)[0]).toContain("> ");
		fixture.inspector.dispose();
	});
	it("wheel-scrolls only the detail body and requests redraw", async () => {
		const fixture = inspectorFixture();
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		fixture.inspector.render(100);
		const before = fixture.redraw.mock.calls.length;
		expect(fixture.inspector.handleMouse(mouse("wheel", 4))?.handled).toBe(true);
		expect(range(fixture)[0]).toBe(4);
		expect(fixture.redraw.mock.calls.length).toBeGreaterThan(before);
		expect(fixture.inspector.handleMouse(mouse("wheel", 0))).toBeUndefined();
		fixture.inspector.dispose();
	});
});
