import { describe, expect, it } from "vitest";
import { RunPanel } from "../panel.ts";

describe("compact widget display preference", () => {
	it("uses cached visible-agent bounds while status counts include all active runs", () => {
		let visible = 2;
		const panel = new RunPanel(() => visible);
		for (let id = 0; id < 6; id++) {
			panel.onChange({
				id: `run-${id}`,
				owner: "session",
				agent: `worker-${id}`,
				cwd: "/work",
				state: "running",
				startedAt: id,
			});
		}
		expect(panel.render("session").filter((line) => line.startsWith("OMPSS:"))).toHaveLength(2);
		expect(panel.render("session")).toContain("4 additional active runs");
		expect(panel.status("session")).toBe("ompss: 6 active runs");
		visible = 6;
		expect(panel.render("session").filter((line) => line.startsWith("OMPSS:"))).toHaveLength(6);
		expect(panel.status("session")).toBe("ompss: 6 active runs");
	});
});
