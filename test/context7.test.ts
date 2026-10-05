// A Context7-shaped research agent on native MCP, using the local MCP fixture.
// Names follow `mcp__<server>__<tool>`, with hyphens as real Context7 tool names have.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { childHarness } from "./fixtures/child.ts";

const harness = childHarness();
afterEach(() => harness.cleanup());

const RESOLVE = "mcp__context7__resolve-library-id";
const QUERY = "mcp__context7__query-docs";
const DENIED = "mcp__context7__delete-library";
const APPROVED = ["tool_search", RESOLVE, QUERY];

const mcpServers = {
	context7: { tools: ["resolve-library-id", "query-docs", "delete-library"] },
	fixture: { tools: ["lookup", "delete", "peek"] },
};

/** Files that hold credentials or configuration. The run must not touch them. */
const PROTECTED = ["auth.json", "mcp-auth.json", "mcp.json", "models.json", "settings.json"];

const seed = async ({ agentDir }: { agentDir: string }) => {
	// nosemgrep: AIK_ts_generic_path_traversal -- The test agent directory is generated and the credential canary filename is fixed.
	await writeFile(join(agentDir, "auth.json"), '{"provider":{"type":"oauth","access":"SECRET-ACCESS-TOKEN"}}');
	// nosemgrep: AIK_ts_generic_path_traversal -- The test agent directory is generated and the credential canary filename is fixed.
	await writeFile(join(agentDir, "mcp-auth.json"), '{"context7":{"token":"SECRET-MCP-TOKEN"}}');
	// nosemgrep: AIK_ts_generic_path_traversal -- The test agent directory is generated and the configuration filename is fixed.
	await writeFile(join(agentDir, "settings.json"), '{"defaultTools":["read"]}');
};

const checksums = async (agentDir: string) =>
	Object.fromEntries(
		await Promise.all(
			PROTECTED.map(
				async (name) =>
					[
						name,
						createHash("sha256")
							// nosemgrep: AIK_ts_generic_path_traversal -- The generated test agent directory is combined only with the fixed PROTECTED allowlist.
							.update(await readFile(join(agentDir, name)))
							.digest("hex"),
					] as const,
			),
		),
	);

describe("Context7-shaped research agent", () => {
	it("runs the approved tools, denies the rest, and leaves credentials and config unchanged", async () => {
		let before: Record<string, string> = {};
		const outcome = await harness.run({
			tools: APPROVED,
			mcpServers,
			seed: async (paths) => {
				await seed(paths);
				// The workspace has already written models.json and mcp.json, so every protected file exists here.
				before = await checksums(paths.agentDir);
			},
			waitForMcp: true,
			script: () => [
				{ tool: "tool_search", args: { query: "library docs" } },
				{ tool: RESOLVE, args: { q: "react" } },
				{ tool: QUERY, args: { q: "hooks" } },
				{ tool: DENIED, args: {} },
				{ tool: "mcp__fixture__delete", args: {} },
				{ text: "done" },
			],
		});

		expect(outcome.mcpCalls).toEqual(["resolve-library-id", "query-docs"]);
		expect(outcome.toolResults.join(" ")).toContain("ok:resolve-library-id");
		expect(outcome.toolResults.join(" ")).toContain("ok:query-docs");
		expect(outcome.violations.map((violation) => violation.tool)).toEqual([DENIED, "mcp__fixture__delete"]);
		expect(await checksums(outcome.workspace.agentDir)).toEqual(before);
		expect(Object.keys(before)).toEqual(PROTECTED);
	});
});
