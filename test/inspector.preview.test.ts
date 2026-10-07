import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/inspector.ts";
import { ObservationStore } from "../src/observation.ts";
import { inspectorFixture } from "./fixtures/inspector-synthetic.ts";

const markdown = "    const INDENTED = true;\n\n# Live heading\n\n- live item\n\n```ts\nvalue();\n```";

describe("retained preview Markdown", () => {
	it("leaves no elapsed timer or read when observation subscription rejects construction", () => {
		vi.useFakeTimers();
		const fixture = inspectorFixture();
		fixture.inspector.dispose();
		vi.spyOn(fixture.observations, "subscribe").mockImplementation(() => {
			throw new Error("Synthetic subscription failure");
		});
		try {
			expect(
				() =>
					new Inspector({
						observations: fixture.observations,
						owner: "session",
						read: fixture.read,
						height: () => 14,
						redraw: fixture.redraw,
						close: fixture.close,
					}),
			).toThrow("Synthetic subscription failure");
			expect(vi.getTimerCount()).toBe(0);
			expect(fixture.read).not.toHaveBeenCalled();
		} finally {
			vi.clearAllTimers();
			vi.useRealTimers();
		}
	});
	it("renders retained line breaks and initial code indentation with the host Markdown component", async () => {
		const observations = new ObservationStore();
		observations.updateRoot(
			{
				id: "root",
				owner: "session",
				agent: "reader",
				cwd: "/synthetic",
				state: "running",
				startedAt: 1,
				nesting: { registryPath: "/synthetic/registry", rootSessionId: "session", depth: 1, maxDepth: 1 },
			},
			{ assistantPreview: markdown },
		);
		const theme = {
			fg: vi.fn((_role: string, text: string) => text),
			bold: (text: string) => text,
			italic: (text: string) => text,
			strikethrough: (text: string) => text,
			underline: (text: string) => text,
		} as unknown as Theme;
		const inspector = new Inspector({
			observations,
			owner: "session",
			read: async () => {
				throw new Error("No saved output in this synthetic case");
			},
			height: () => 80,
			redraw: () => {},
			close: () => {},
			selectedRunId: "root",
			theme,
		});
		try {
			for (let index = 0; index < 6; index++) await Promise.resolve();
			expect(observations.node("session", "root", "root")?.assistantPreview).toBe(markdown);
			const lines = inspector.render(100);
			expect(lines.join("\n")).toContain("Live answer · provisional");
			expect(lines.join("\n")).toContain("Live heading");
			expect(lines.join("\n")).not.toContain("# Live heading");
			expect(theme.fg).toHaveBeenCalledWith("mdCodeBlock", expect.stringContaining("INDENTED"));
			expect(theme.fg).toHaveBeenCalledWith("mdListBullet", expect.any(String));
			for (const line of inspector.render(45)) expect(visibleWidth(line)).toBeLessThanOrEqual(45);
		} finally {
			inspector.dispose();
		}
	});
});
