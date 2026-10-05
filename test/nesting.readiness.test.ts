import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../protocol.ts";
import type { LaunchInput } from "../runner.ts";
import type { RpcChannel } from "../rpc.ts";
import { runGate, StartupError } from "../startup.ts";

const lineage = {
	registryPath: "/operator/registry.yaml",
	depth: 1,
	maxDepth: 3,
	rootSessionId: "root",
	runId: "child",
};
const input = { guardPath: "/ext/guard.ts", runToken: "token", cwd: tmpdir(), lineage } as LaunchInput;
const fail = (message: string) => new StartupError(message);
function channel(lineageValue: unknown): RpcChannel {
	const records = [
		{
			type: "entry_appended",
			entry: {
				customType: READY_ENTRY,
				data: { token: "token", ok: true, problems: [], tools: [], cwd: tmpdir(), lineage: lineageValue },
			},
		},
	];
	return {
		records,
		request: async (command: { type: string }) =>
			command.type === "get_commands"
				? {
						success: true,
						data: {
							commands: [{ name: PREFLIGHT_COMMAND, source: "extension", sourceInfo: { path: input.guardPath } }],
						},
					}
				: { success: true, data: { disposition: "handled" } },
		waitFor: async () => records[0],
	} as unknown as RpcChannel;
}

describe("nesting readiness evidence", () => {
	it("accepts matching validated lineage", async () => {
		expect((await runGate(input, channel(lineage), 1000, fail)).lineage).toEqual(lineage);
	});
	it.each([
		undefined,
		{ ...lineage, depth: 0 },
		{ ...lineage, depth: 2, parentRunId: "parent" },
		{ ...lineage, maxDepth: 4 },
		{ ...lineage, rootSessionId: "another" },
		{ ...lineage, runId: "another" },
		{ ...lineage, registryPath: "/another/registry.yaml" },
	])("rejects missing, malformed or mismatched lineage %j before task submission", async (value) => {
		await expect(runGate(input, channel(value), 1000, fail)).rejects.toThrow(/lineage/);
	});
});
