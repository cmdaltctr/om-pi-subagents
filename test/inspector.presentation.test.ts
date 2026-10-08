import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectorFixture, flushInspector, keys, syntheticTheme } from "./fixtures/inspector-synthetic.ts";

const text = (fixture: ReturnType<typeof inspectorFixture>) =>
	stripVTControlCharacters(fixture.inspector.render(100).join("\n"));
afterEach(() => vi.useRealTimers());
describe("inspector themed presentation", () => {
	it.each([false, true])("separates detail section headings from content (partial: %s)", async (partial) => {
		const fixture = inspectorFixture();
		fixture.resize(300);
		fixture.observations.updateRoot(fixture.root, { assistantPreview: "Visible live answer" });
		if (partial) fixture.observations.updateRoot({ ...fixture.root, state: "failed", endedAt: 9000 });
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		const lines = text(fixture)
			.split("\n")
			.map((line) => line.trim());
		for (const heading of [
			"Task",
			"Current activity",
			"Live answer · provisional",
			partial ? "Partial output" : "Saved output",
		]) {
			const index = lines.indexOf(heading);
			expect(index).toBeGreaterThan(0);
			expect(lines[index - 1]).toBe("");
			expect(lines[index + 1]).toBe("");
		}
		fixture.inspector.dispose();
	});
	it.each([false, true])("uses supplied semantic colours and sanitised host Markdown (light: %s)", async (light) => {
		const theme = syntheticTheme(light);
		const fixture = inspectorFixture({ theme });
		fixture.resize(100);
		fixture.observations.updateRoot(fixture.root, {
			activeTools: [
				{ id: "private-1", name: "read" },
				{ id: "private-2", name: "read" },
				{ id: "private-3", name: "grep" },
			],
			assistantPreview: "# Live heading\n\n- item\n\n```ts\nconst safe = true;\n```",
		});
		fixture.observations.markIncomplete({ owner: "session", runId: "root" });
		fixture.read.mockResolvedValue({
			node: fixture.observations.node("session", "root", "root")!,
			task: "Task 界\x1b[2J\u202e",
			output: "# Saved heading\n\n- saved item\n\n```\ncode 界\x1b]52;c;PRIVATE\x07\u202e\n```\n\n\x1b[2JDANGER",
			outputPath: "/synthetic/output.md",
			partial: true,
			taskTruncated: true,
			outputTruncated: true,
		});
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		const lines = fixture.inspector.render(100);
		const shown = stripVTControlCharacters(lines.join("\n"));
		expect(shown).toContain("Current activity");
		expect(shown).toContain("read ×2");
		expect(shown).toContain("grep ×1");
		expect(shown).toContain("Live answer · provisional");
		expect(shown).toContain("Partial output");
		expect(shown).toContain("Tree observation incomplete: connection-lost");
		expect(shown).toContain("Task configuration truncated at 64 KiB");
		expect(shown).toContain("Output truncated at 64 KiB");
		expect(shown).toContain("Saved heading");
		expect(shown).toContain("- saved item");
		expect(shown).not.toContain("# Saved heading");
		expect(theme.fg).toHaveBeenCalledWith("mdCodeBlockBorder", expect.stringContaining("```"));
		expect(shown).not.toContain("PRIVATE");
		expect(shown).not.toContain("private-1");
		expect(lines.join("\n")).not.toContain("\x1b[2J");
		expect(shown).not.toContain("\u202e");
		for (const role of ["accent", "text", "muted", "warning", "mdHeading", "mdListBullet", "mdCodeBlock"])
			expect(theme.fg).toHaveBeenCalledWith(role, expect.any(String));
		for (const width of [1, 8, 18, 45, 100, 160])
			for (const line of fixture.inspector.render(width)) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		fixture.inspector.dispose();
	});
	it("keeps the full retained 4 KiB preview and its truncation marker reachable", async () => {
		const fixture = inspectorFixture();
		fixture.resize(300);
		fixture.observations.updateRoot(fixture.root, { assistantPreview: `${"Word ".repeat(810)}[preview truncated]` });
		const retained = fixture.observations.node("session", "root", "root")!.assistantPreview!;
		expect(Buffer.byteLength(retained)).toBeLessThanOrEqual(4096);
		fixture.read.mockRejectedValue(new Error("saved file unavailable"));
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		const shown = text(fixture);
		expect(shown).toContain("preview truncated");
		expect(shown.match(/Word/g)?.length).toBe(retained.match(/Word/g)?.length);
		expect(shown).toContain("No active tool observed");
		expect(shown).toContain("Unavailable");
		fixture.inspector.dispose();
	});
	it("keeps name, state and elapsed readable in a narrow fixed header", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(9000);
		const fixture = inspectorFixture();
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		// The vertical margin precedes both narrow-header rows.
		const header = stripVTControlCharacters(fixture.inspector.render(30).slice(1, 3).join("\n"));
		expect(header).toContain("builder");
		expect(header).toContain("running");
		expect(header).toContain("8s");
		fixture.inspector.dispose();
	});
	it("refreshes theme caches when invalidated without resetting the viewport", async () => {
		const theme = syntheticTheme();
		const fixture = inspectorFixture({ theme });
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		fixture.inspector.render(100);
		fixture.inspector.handleInput(keys.end);
		// Compare the line-range footer, not the blank bottom margin.
		const before = text(fixture)
			.split("\n")
			.find((line) => line.includes("Lines "));
		vi.mocked(theme.fg).mockImplementation((_role, value) => `\x1b[95m${value}\x1b[39m`);
		fixture.inspector.invalidate();
		const after = fixture.inspector.render(100).join("\n");
		expect(after).toContain("\x1b[95m");
		expect(after).not.toContain("\x1b[37m");
		expect(
			stripVTControlCharacters(after)
				.split("\n")
				.find((line) => line.includes("Lines ")),
		).toBe(before);
		fixture.inspector.dispose();
	});
	it.each([
		["completed", "success"],
		["failed", "error"],
		["cancelled", "warning"],
	] as const)("uses semantic %s outcome colour with explicit status", async (state, role) => {
		const theme = syntheticTheme();
		const fixture = inspectorFixture({ theme });
		fixture.resize(300);
		fixture.observations.updateRoot({ ...fixture.root, state, endedAt: 9000 });
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		expect(text(fixture)).toContain(state);
		expect(theme.fg).toHaveBeenCalledWith(role, state);
		if (state !== "completed") expect(text(fixture)).toContain("Partial output");
		fixture.inspector.dispose();
	});
	it("labels a missing terminal end time unavailable", async () => {
		const fixture = inspectorFixture();
		fixture.observations.updateRoot({ ...fixture.root, state: "completed" });
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		// The header sits below the blank top margin.
		const header = stripVTControlCharacters(fixture.inspector.render(100)[1]);
		expect(header).toContain("completed · Unavailable");
		fixture.inspector.dispose();
	});
	it("advances idle elapsed time without evidence reads and freezes terminal duration", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(9000);
		const fixture = inspectorFixture();
		fixture.inspector.handleInput(keys.enter);
		await flushInspector();
		expect(text(fixture)).toContain("8s");
		const before = fixture.redraw.mock.calls.length;
		vi.advanceTimersByTime(2000);
		expect(fixture.redraw.mock.calls.length).toBeGreaterThan(before);
		expect(text(fixture)).toContain("10s");
		expect(fixture.read).toHaveBeenCalledTimes(1);
		fixture.observations.updateRoot({ ...fixture.root, state: "completed", endedAt: 11000 });
		await flushInspector();
		expect(text(fixture)).toContain("10s");
		const terminalCalls = fixture.redraw.mock.calls.length;
		vi.advanceTimersByTime(8000);
		expect(text(fixture)).toContain("10s");
		expect(fixture.redraw).toHaveBeenCalledTimes(terminalCalls);
		expect(vi.getTimerCount()).toBe(0);
		fixture.inspector.dispose();
	});
	it.each(["close", "dispose", "session"])("disposes refresh and late callbacks on %s", async (reason) => {
		vi.useFakeTimers();
		let live = true;
		const fixture = inspectorFixture({ live: () => live });
		fixture.read.mockImplementation(async () => new Promise(() => {}));
		fixture.inspector.handleInput(keys.enter);
		expect(vi.getTimerCount()).toBe(1);
		const signal = fixture.read.mock.calls[0][2]!;
		if (reason === "session") {
			live = false;
			vi.advanceTimersByTime(1000);
		} else if (reason === "close") fixture.inspector.close();
		else fixture.inspector.dispose();
		expect(signal.aborted).toBe(true);
		expect(vi.getTimerCount()).toBe(0);
		const calls = fixture.redraw.mock.calls.length;
		vi.advanceTimersByTime(5000);
		expect(fixture.redraw).toHaveBeenCalledTimes(calls);
		expect(fixture.read).toHaveBeenCalledTimes(1);
		fixture.inspector.dispose();
	});
});
