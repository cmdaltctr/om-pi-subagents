// Permission canaries against the real Pi 0.99.1 CLI. A scripted model attempts forbidden calls;
// the tests then look for any effect: a file on disk or a call that reached the MCP server.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./test/fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { childHarness } from "./test/fixtures/child.ts";

const RELAY = new URL("./test/fixtures/relay-extension.ts", import.meta.url).pathname;
const LATE_TOOL = new URL("./test/fixtures/late-tool-extension.ts", import.meta.url).pathname;

const harness = childHarness();
afterEach(() => harness.cleanup());

describe("direct calls outside the approved list", () => {
	it("blocks a forbidden write, leaves the file unchanged and records the violation", async () => {
		const outcome = await harness.run({
			tools: ["read"],
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "write", args: { path: join(cwd, "target.txt"), content: "pwned" } }, { text: "done" }],
		});
		expect(existsSync(join(outcome.workspace.cwd, "target.txt"))).toBe(false);
		expect(outcome.violations).toEqual([{ token: "run-token", tool: "write" }]);
		expect(outcome.toolResults.join(" ")).toMatch(/Tool write not found|not approved/);
	});

	it("blocks a forbidden shell call", async () => {
		const outcome = await harness.run({
			tools: ["read"],
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "bash", args: { command: `touch ${join(cwd, "shell.txt")}` } }, { text: "done" }],
		});
		expect(existsSync(join(outcome.workspace.cwd, "shell.txt"))).toBe(false);
		expect(outcome.violations.map((violation) => violation.tool)).toEqual(["bash"]);
	});

	it("lets an approved tool run and records no violation", async () => {
		const outcome = await harness.run({
			tools: ["read"],
			files: { "note.txt": "NOTE-CONTENT-31" },
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "read", args: { path: join(cwd, "note.txt") } }, { text: "done" }],
		});
		expect(outcome.violations).toEqual([]);
		expect(outcome.toolResults.join(" ")).toContain("NOTE-CONTENT-31");
	});
});

// Pi's `--tools` allowlist stops the attempts in the other groups by itself. A trusted extension that
// registers a tool after start-up is outside that allowlist. Only the guard's execution-time check remains.
describe("a trusted extension registers a tool at run time", () => {
	it("blocks the unapproved tool, leaves no trace and records the violation", async () => {
		const outcome = await harness.run({
			tools: ["read"],
			extensions: [LATE_TOOL],
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "late_tool", args: { path: join(cwd, "late.txt") } }, { text: "done" }],
		});
		expect(existsSync(join(outcome.workspace.cwd, "late.txt"))).toBe(false);
		expect(outcome.violations.map((violation) => violation.tool)).toEqual(["late_tool"]);
		expect(outcome.toolResults.join(" ")).toMatch(/Tool late_tool not found|not approved/);
	});

	it("blocks it when an approved wrapper runs it through ctx.executeTool", async () => {
		const outcome = await harness.run({
			tools: ["relay"],
			extensions: [RELAY, LATE_TOOL],
			script: (cwd) => [
				// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a temporary cwd and the canary filename is fixed.
				{ tool: "relay", args: { tool: "late_tool", args: { path: join(cwd, "late.txt") } } },
				{ text: "done" },
			],
		});
		expect(existsSync(join(outcome.workspace.cwd, "late.txt"))).toBe(false);
		expect(outcome.violations.map((violation) => violation.tool)).toContain("late_tool");
	});

	it("runs the same tool when the agent approves it", async () => {
		const outcome = await harness.run({
			tools: ["read", "late_tool"],
			extensions: [LATE_TOOL],
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "late_tool", args: { path: join(cwd, "late.txt") } }, { text: "done" }],
		});
		expect(existsSync(join(outcome.workspace.cwd, "late.txt"))).toBe(true);
		expect(outcome.violations).toEqual([]);
	});
});

describe("tools discovered at run time", () => {
	it("blocks an MCP tool found through tool_search, and no request reaches the server", async () => {
		const outcome = await harness.run({
			tools: ["tool_search"],
			waitForMcp: true,
			script: () => [
				{ tool: "tool_search", args: { query: "delete" } },
				{ tool: "mcp__fixture__delete", args: {} },
				{ text: "done" },
			],
		});
		expect(outcome.mcpCalls).toEqual([]);
		expect(outcome.violations.map((violation) => violation.tool)).toEqual(["mcp__fixture__delete"]);
	});

	it("denies an MCP tool that advertises readOnlyHint, because the name is not approved", async () => {
		const outcome = await harness.run({
			tools: ["tool_search"],
			waitForMcp: true,
			script: () => [
				{ tool: "tool_search", args: { query: "peek" } },
				{ tool: "mcp__fixture__peek", args: {} },
				{ text: "done" },
			],
		});
		expect(outcome.mcpCalls).toEqual([]);
		expect(outcome.violations.map((violation) => violation.tool)).toEqual(["mcp__fixture__peek"]);
	});
});

describe("nested calls through an approved wrapper", () => {
	it("blocks a forbidden write that the wrapper runs through ctx.executeTool", async () => {
		const outcome = await harness.run({
			tools: ["relay"],
			extensions: [RELAY],
			script: (cwd) => [
				// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a temporary cwd and the canary filename is fixed.
				{ tool: "relay", args: { tool: "write", args: { path: join(cwd, "nested.txt"), content: "x" } } },
				{ text: "done" },
			],
		});
		expect(existsSync(join(outcome.workspace.cwd, "nested.txt"))).toBe(false);
		expect(outcome.violations.map((violation) => violation.tool)).toContain("write");
	});

	it("blocks an unapproved MCP tool that the wrapper runs, and no request reaches the server", async () => {
		const outcome = await harness.run({
			tools: ["relay", "mcp__fixture__lookup"],
			extensions: [RELAY],
			waitForMcp: true,
			script: () => [{ tool: "relay", args: { tool: "mcp__fixture__delete", args: {} } }, { text: "done" }],
		});
		expect(outcome.mcpCalls).toEqual([]);
		expect(outcome.violations.map((violation) => violation.tool)).toContain("mcp__fixture__delete");
	});
});

// Pi narrows codemode's `tools` object to the approved tools, so these attempts never reach the guard.
// They still guard against a Pi upgrade that widens that object.
describe("codemode scripts", () => {
	it("cannot call an unapproved MCP tool", async () => {
		const outcome = await harness.run({
			tools: ["codemode", "mcp__fixture__lookup"],
			waitForMcp: true,
			script: () => [
				{ tool: "codemode", args: { code: "return await tools.mcp__fixture__delete({});" } },
				{ text: "done" },
			],
		});
		expect(outcome.mcpCalls).toEqual([]);
		expect(outcome.toolResults.join(" ")).toMatch(/No tool calls were made/);
	});

	it("cannot write a file", async () => {
		const outcome = await harness.run({
			tools: ["codemode"],
			script: (cwd) => [
				{
					tool: "codemode",
					args: {
						// nosemgrep: AIK_ts_generic_path_traversal -- The temporary cwd and fixed filename form a deliberate permission canary.
						code: `return await tools.write({ path: ${JSON.stringify(join(cwd, "nested.txt"))}, content: "x" });`,
					},
				},
				{ text: "done" },
			],
		});
		expect(existsSync(join(outcome.workspace.cwd, "nested.txt"))).toBe(false);
		expect(outcome.toolResults.join(" ")).toMatch(/No tool calls were made/);
	});
});

// Each attempt above must do real harm when its tool IS approved. Otherwise the canary proves nothing.
describe("controls: the same attempts succeed when the tool is approved", () => {
	it("lets an approved write create the file", async () => {
		const outcome = await harness.run({
			tools: ["read", "write"],
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "write", args: { path: join(cwd, "target.txt"), content: "ok" } }, { text: "done" }],
		});
		expect(existsSync(join(outcome.workspace.cwd, "target.txt"))).toBe(true);
		expect(outcome.violations).toEqual([]);
	});

	it("lets an approved shell call run", async () => {
		const outcome = await harness.run({
			tools: ["bash"],
			// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a generated cwd and the canary filename is fixed.
			script: (cwd) => [{ tool: "bash", args: { command: `touch ${join(cwd, "shell.txt")}` } }, { text: "done" }],
		});
		expect(existsSync(join(outcome.workspace.cwd, "shell.txt"))).toBe(true);
	});

	it.each(["delete", "peek"])("lets tool_search reach an approved MCP tool: %s", async (name) => {
		const outcome = await harness.run({
			tools: ["tool_search", `mcp__fixture__${name}`],
			waitForMcp: true,
			script: () => [
				{ tool: "tool_search", args: { query: name } },
				{ tool: `mcp__fixture__${name}`, args: {} },
				{ text: "done" },
			],
		});
		expect(outcome.mcpCalls).toEqual([name]);
		expect(outcome.violations).toEqual([]);
	});

	it("lets the relay wrapper run an approved write and an approved MCP tool", async () => {
		const write = await harness.run({
			tools: ["relay", "write"],
			extensions: [RELAY],
			script: (cwd) => [
				// nosemgrep: AIK_ts_generic_path_traversal -- The harness supplies a temporary cwd and the canary filename is fixed.
				{ tool: "relay", args: { tool: "write", args: { path: join(cwd, "nested.txt"), content: "x" } } },
				{ text: "done" },
			],
		});
		expect(existsSync(join(write.workspace.cwd, "nested.txt"))).toBe(true);
		expect(write.violations).toEqual([]);
		await harness.cleanup();

		const mcp = await harness.run({
			tools: ["relay", "mcp__fixture__delete"],
			extensions: [RELAY],
			waitForMcp: true,
			script: () => [{ tool: "relay", args: { tool: "mcp__fixture__delete", args: {} } }, { text: "done" }],
		});
		expect(mcp.mcpCalls).toEqual(["delete"]);
		expect(mcp.violations).toEqual([]);
	});

	it("lets codemode reach an approved MCP tool and an approved write", async () => {
		const mcp = await harness.run({
			tools: ["codemode", "mcp__fixture__delete"],
			waitForMcp: true,
			script: () => [
				{ tool: "codemode", args: { code: "return await tools.mcp__fixture__delete({});" } },
				{ text: "done" },
			],
		});
		expect(mcp.mcpCalls).toEqual(["delete"]);
		await harness.cleanup();

		const write = await harness.run({
			tools: ["codemode", "write"],
			script: (cwd) => [
				{
					tool: "codemode",
					args: {
						// nosemgrep: AIK_ts_generic_path_traversal -- The temporary cwd and fixed filename form a deliberate permission canary.
						code: `return await tools.write({ path: ${JSON.stringify(join(cwd, "nested.txt"))}, content: "x" });`,
					},
				},
				{ text: "done" },
			],
		});
		expect(existsSync(join(write.workspace.cwd, "nested.txt"))).toBe(true);
	});
});
