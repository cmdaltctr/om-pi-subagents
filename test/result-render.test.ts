import { describe, expect, it } from "vitest";
import { collapseResult, RESULT_LINE_LIMIT } from "../src/result-render.ts";

const heading = ["OMPS run run-1 (reader) completed.", "Files: /files/run-1", "Result:"];

describe("collapsed result text", () => {
	it("keeps eight result lines and counts the hidden lines", () => {
		const lines = Array.from({ length: 12 }, (_, index) => `line ${index + 1}`);
		expect(RESULT_LINE_LIMIT).toBe(8);
		expect(collapseResult([...heading, ...lines].join("\n"), RESULT_LINE_LIMIT)).toEqual({
			head: [...heading, ...lines.slice(0, 8)],
			hidden: 4,
		});
	});

	it("shows a short result whole without a hidden count", () => {
		const lines = [...heading, "short answer"];
		expect(collapseResult(lines.join("\n"), 8)).toEqual({ head: lines, hidden: 0 });
	});

	it("keeps the error and partial-output note outside the result limit", () => {
		const lines = [
			"OMPS run run-1 (reader) failed.",
			"Files: /files/run-1",
			"Error: child exited",
			"Result:",
			"> PARTIAL OUTPUT. The run failed.",
			"first",
			"second",
			"third",
		];
		expect(collapseResult(lines.join("\n"), 1)).toEqual({
			head: [...lines.slice(0, 5), "first"],
			hidden: 2,
		});
	});

	it("returns content without a Result label whole", () => {
		const lines = ["unexpected text", "second line", "third line"];
		expect(collapseResult(lines.join("\n"), 1)).toEqual({ head: lines, hidden: 0 });
	});
});
