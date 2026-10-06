import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";
import { acknowledgementLines, LaunchAcknowledgement, type AcknowledgementData } from "../src/acknowledgement.ts";

const identity: AcknowledgementData = { owner: "session", runId: "owned-12345678", agent: "worker" };
const launchText = [
	"Started run owned-12345678 (worker) in the background.",
	"Files: /saved/session/owned-12345678",
	'Check it with "ompss status owned-12345678". The result arrives as a follow-up message.',
].join("\n");

describe("compact launch acknowledgements", () => {
	it("renders one bounded row with the agent, short identity and launch state", () => {
		const lines = acknowledgementLines(identity, false, 100);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("worker");
		expect(lines[0]).toContain("started");
		expect(lines[0]).toContain("owned-12");
	});

	it("reveals bounded acknowledgement text on native expansion without a live tree", () => {
		const collapsed = acknowledgementLines(identity, false, 100, launchText);
		expect(collapsed).toHaveLength(1);
		expect(collapsed.join("\n")).not.toContain("Files:");

		const expanded = acknowledgementLines(identity, true, 100, launchText);
		expect(expanded.join("\n")).toContain("Started run owned-12345678");
		expect(expanded.join("\n")).toContain("Files:");
		// Host expansion reveals acknowledgement text only: one acknowledgement row, no per-run rows or navigation.
		expect(expanded.filter((line) => line.startsWith("OMPSS:"))).toHaveLength(1);
		expect(expanded.join("\n")).not.toContain("descendants");
		expect(expanded.join("\n")).not.toMatch(/running|Arrows|inspect/);
	});

	it("bounds expansion detail to a small fixed budget", () => {
		const wide = `${launchText}\n${Array.from({ length: 2000 }, () => "y".repeat(180)).join("\n")}`;
		const lines = acknowledgementLines(identity, true, 200, wide);
		expect(lines.join("\n").length).toBeLessThanOrEqual(1024);
		expect(lines.length).toBeLessThanOrEqual(5);
	});

	it("labels historical entries without captured labels and invents no run state", () => {
		const historical: AcknowledgementData = { owner: "old-session", runId: "hist-12345678" };
		for (const expanded of [false, true]) {
			const lines = acknowledgementLines(historical, expanded, 100);
			expect(lines).toHaveLength(1);
			expect(lines.join("\n")).toMatch(/unavailable/i);
			expect(lines.join("\n")).toContain("hist-12");
			expect(lines.join("\n")).not.toMatch(/running|completed|failed|cancelled/);
		}
	});

	it.each([0, 1, 8, 20, 80])("fits terminal column width %i and removes unsafe text", (width) => {
		const unsafe: AcknowledgementData = {
			owner: "session",
			runId: "unsafe-12345678",
			agent: "\x1b[2Jdanger\u202e\x07",
		};
		for (const lines of [
			acknowledgementLines(unsafe, false, width),
			acknowledgementLines(unsafe, true, width, `\x1b[31mdetail\u2066\x1b[0m`),
		]) {
			for (const line of lines) {
				expect(visibleWidth(line)).toBeLessThanOrEqual(width);
				expect(line).not.toMatch(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
			}
		}
	});

	it("caps captured agent labels so long personas cannot grow the row", () => {
		const lines = acknowledgementLines({ ...identity, agent: "a".repeat(400) }, false, 400);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("a".repeat(48));
		expect(lines[0]).not.toContain("a".repeat(49));
	});

	it("renders no acknowledgement inside a zero-width host", () => {
		expect(acknowledgementLines(identity, true, 0, launchText)).toEqual([]);
	});

	it("exposes the same lines through the live component", () => {
		const component = new LaunchAcknowledgement(identity, true, launchText);
		expect(component.render(100)).toEqual(acknowledgementLines(identity, true, 100, launchText));
		component.invalidate();
		expect(component.render(60)).toEqual(acknowledgementLines(identity, true, 60, launchText));
	});
});
