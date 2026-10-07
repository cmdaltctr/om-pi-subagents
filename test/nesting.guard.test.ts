import { describe, expect, it } from "vitest";
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../src/protocol.ts";
import { PI_AVAILABLE, startPi } from "./fixtures/pi-rpc.ts";

const guard = new URL("../src/child-guard.ts", import.meta.url).pathname;
describe.skipIf(!PI_AVAILABLE)("real child lineage validation", () => {
	it.each([
		undefined,
		{ depth: 0 },
		{ registryPath: "/operator/registry.yaml", depth: 2, maxDepth: 3, rootSessionId: "root", runId: "child" },
	])("fails readiness for a marked child with invalid lineage %j", async (lineage) => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", guard],
			env: {
				OMPS_CHILD: "1",
				OMPS_RUN_TOKEN: "token",
				OMPS_POLICY: JSON.stringify({ tools: [], startupDeadlineMs: 500, lineage }),
			},
		});
		try {
			expect((await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` })).data.disposition).toBe(
				"handled",
			);
			const entry = await fixture.waitFor(
				(record) => record.type === "entry_appended" && record.entry.customType === READY_ENTRY,
			);
			expect(entry.entry.data.ok).toBe(false);
			expect(entry.entry.data.problems.join(" ")).toMatch(/lineage/);
			expect(fixture.model.requests).toHaveLength(0);
		} finally {
			await fixture.dispose();
		}
	});
});
