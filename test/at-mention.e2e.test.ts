import { describe, expect, it } from "vitest";
import { runAtMentionNative } from "./fixtures/at-mention-native.ts";
import { PI_AVAILABLE, startPi } from "./fixtures/pi-rpc.ts";
import { writeFixtureRegistry } from "./fixtures/registry.ts";

const INDEX = new URL("../src/index.ts", import.meta.url).pathname;

describe.skipIf(!PI_AVAILABLE)("at-mention on the real Pi host", () => {
	it("executes the pinned-host spike", () => {
		const evidence = runAtMentionNative("at-mention-spike");
		expect(evidence.applied).toEqual({ text: "@reader ", cursor: { line: 0, col: 8 } });
		expect(evidence.submitted).toBe("@reader inspect this");
		expect(evidence.mergedLabels).toEqual(["reader", "reader.md", "README.md"]);
	});

	it.each([
		"launch",
		"leading-space",
		"guidance",
		"registry",
		"notify-registry",
		"notify-admission",
		"notify-acknowledgement",
		"notify-guidance",
		"capacity",
		"depth",
		"readiness",
		"extension",
		"non-tui",
		"file",
		"ordinary",
		"bare-at",
		"pick-and-file",
	])("uses a disposable interactive session: %s", (scenario) => {
		const evidence = runAtMentionNative("interactive-at-mention", scenario);
		expect(evidence).toMatchObject({ scenario, verified: true });
	});

	it("passes RPC input through unchanged without reading a broken registry", async () => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", INDEX],
			env: { OMPS_REGISTRY: "" },
			seed: async ({ agentDir }) => writeFixtureRegistry(agentDir, "version: 1\nagents: [invalid]\n"),
		});
		try {
			await fixture.send({ type: "prompt", message: "@reader inspect src" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(fixture.model.requests).toHaveLength(1);
			expect(JSON.stringify(fixture.model.requests[0])).toContain("@reader inspect src");
			expect(
				fixture.records.some((record) => record.type === "extension_ui_request" && record.method === "notify"),
			).toBe(false);
		} finally {
			await fixture.dispose();
		}
	});
});
