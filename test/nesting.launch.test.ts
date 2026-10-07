import { readFile, realpath, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PREFLIGHT_COMMAND, VIOLATION_ENTRY } from "../src/protocol.ts";
import { buildLaunch } from "../src/runner.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";
import { PI_AVAILABLE, PI_BIN, startPi } from "./fixtures/pi-rpc.ts";

const guard = new URL("../src/child-guard.ts", import.meta.url).pathname;
async function startManaged(maxDepth: number, tools = ["omps"]) {
	let registryPath = "";
	return startPi({
		mcp: false,
		env: { OMPS_PI_BIN: PI_BIN },
		seed: async ({ agentDir }) => {
			await writeFile(join(agentDir, "delegator.md"), "DELEGATOR-PERSONA-MARKER");
			await writeFile(join(agentDir, "writer.md"), "WRITER-PERSONA-MARKER");
			await writeFile(
				join(agentDir, "om-pi-subagents.yaml"),
				`version: 1\nlimits:\n  maxConcurrentRuns: 4\n  maxDepth: ${maxDepth}\nagents:\n  writer:\n    persona: ./writer.md\n    tools: [write]\n    thinking: off\n`,
			);
			registryPath = await realpath(join(agentDir, "om-pi-subagents.yaml"));
		},
		launch: ({ cwd, agentDir }) =>
			buildLaunch({
				snapshot: {
					name: "delegator",
					personaPath: "unused",
					persona: "DELEGATOR-PERSONA-MARKER",
					tools,
					thinking: "off",
					skills: [],
					extensions: [],
				},
				cwd,
				personaFile: join(agentDir, "delegator.md"),
				guardPath: guard,
				runToken: "token",
				piBin: PI_BIN,
				parentModel: "fake/counter",
				lineage: { ...fixtureLineage(registryPath), maxDepth },
			}),
	});
}

describe.skipIf(!PI_AVAILABLE)("real approved nested launch", () => {
	it("keeps an early parent answer open until the nested result can be consumed", async () => {
		const fixture = await startManaged(3);
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				if (messages.includes("WRITER-PERSONA-MARKER")) return { text: "Writer completed", delayMs: 700 };
				if (!body.messages.some((message: { role: string }) => message.role === "tool"))
					return { tool: "omps", args: { action: "run", agent: "writer", task: "Write the task" } };
				return {
					text: messages.includes("Writer completed") ? "Parent used the nested result" : "Early parent answer",
				};
			};
			await fixture.send({ type: "prompt", message: "Delegate and use the result" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect((await fixture.send({ type: "get_last_assistant_text" })).data.text).toBe("Parent used the nested result");
			expect(fixture.records.filter((record) => record.type === "agent_settled")).toHaveLength(1);
		} finally {
			await fixture.send({ type: "abort" });
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("cancels during final-answer waiting without another model response", async () => {
		const fixture = await startManaged(3);
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				if (messages.includes("WRITER-PERSONA-MARKER")) return { hang: true };
				if (!body.messages.some((message: { role: string }) => message.role === "tool"))
					return { tool: "omps", args: { action: "run", agent: "writer", task: "Write the task" } };
				return { text: "Early parent answer" };
			};
			await fixture.send({ type: "prompt", message: "Delegate and wait" });
			await fixture.waitFor(
				(record) => record.type === "message_end" && record.message?.content?.[0]?.text === "Early parent answer",
			);
			await fixture.waitFor((record) => record.statusText === "omps: writer running");
			expect(fixture.records.some((record) => record.type === "agent_settled")).toBe(false);
			expect((await fixture.send({ type: "get_state" })).data.isStreaming).toBe(true);
			const parentRequests = () =>
				fixture.model.requests.filter((body) => JSON.stringify(body).includes("DELEGATOR-PERSONA-MARKER"));
			const requests = parentRequests().length;
			expect((await fixture.send({ type: "abort" })).success).toBe(true);
			expect((await fixture.send({ type: "get_state" })).data.isStreaming).toBe(false);
			expect(parentRequests()).toHaveLength(requests);
			expect(fixture.records.some((record) => record.message?.customType === "omps-result")).toBe(false);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("admits parallel descendants across tool-use turns before waiting on the final answer", async () => {
		const fixture = await startManaged(3);
		try {
			fixture.model.script = (body) => {
				if (JSON.stringify(body.messages).includes("WRITER-PERSONA-MARKER")) return { hang: true };
				const launched = body.messages.filter((message: { role: string }) => message.role === "tool").length;
				return launched < 2
					? { tool: "omps", args: { action: "run", agent: "writer", task: `Task ${launched + 1}` } }
					: { text: "Both descendants started" };
			};
			await fixture.send({ type: "prompt", message: "Start two descendants" });
			await fixture.waitFor(
				(record) => record.type === "message_end" && record.message?.content?.[0]?.text === "Both descendants started",
			);
			const launches = fixture.records.filter(
				(record) => record.type === "tool_execution_end" && record.toolName === "omps",
			);
			expect(launches).toHaveLength(2);
			expect(launches.every((record) => !record.isError)).toBe(true);
			expect(fixture.records.some((record) => record.type === "agent_settled")).toBe(false);
			expect((await fixture.send({ type: "abort" })).success).toBe(true);
			expect((await fixture.send({ type: "get_state" })).data.isStreaming).toBe(false);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("registers approved delegation at the leaf and returns a clear depth error", async () => {
		const fixture = await startManaged(1);
		try {
			expect((await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` })).data.disposition).toBe(
				"handled",
			);
			fixture.model.script = [
				{ tool: "omps", args: { action: "run", agent: "writer", task: "Write the task" } },
				{ text: "The depth limit prevents this launch" },
			];
			await fixture.send({ type: "prompt", message: "Try to delegate" });
			const result = await fixture.waitFor(
				(record) => record.type === "tool_execution_end" && record.toolName === "omps",
			);
			expect(result.isError).toBe(true);
			expect(JSON.stringify(result.result)).toMatch(/current depth 1.*attempted depth 2.*maxDepth 1/);
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("loads no delegation capability without exact tool approval", async () => {
		const fixture = await startManaged(3, ["read"]);
		try {
			const response = await fixture.send({ type: "get_commands" });
			expect(response.data.commands.some((command: { name: string }) => command.name === "omps")).toBe(false);
			fixture.model.script = [
				{ tool: "omps", args: { action: "run", agent: "writer", task: "Write the task" } },
				{ text: "Delegation was refused" },
			];
			await fixture.send({ type: "prompt", message: "Try to delegate" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(
				fixture.records.some(
					(record) => record.entry?.customType === VIOLATION_ENTRY && record.entry.data.tool === "omps",
				),
			).toBe(true);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("keeps direct write tools unavailable to an approved delegator", async () => {
		const fixture = await startManaged(3);
		try {
			const path = join(fixture.cwd, "forbidden.txt");
			fixture.model.script = [
				{ tool: "write", args: { path, content: "Must be blocked" } },
				{ text: "Direct writing was refused" },
			];
			await fixture.send({ type: "prompt", message: "Try direct writing" });
			const result = await fixture.waitFor(
				(record) => record.type === "tool_execution_end" && record.toolName === "write",
			);
			expect(result.isError).toBe(true);
			await fixture.waitFor((record) => record.type === "agent_settled");
			await expect(readFile(path, "utf8")).rejects.toThrow();
			expect(
				fixture.records.some(
					(record) => record.entry?.customType === VIOLATION_ENTRY && record.entry.data.tool === "write",
				),
			).toBe(true);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("launches a write-capable grandchild with its own tools and private lineage evidence", async () => {
		const fixture = await startManaged(3);
		try {
			const owner = (await fixture.send({ type: "get_state" })).data.sessionId;
			await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const hasToolResult = body.messages.some((message: { role: string }) => message.role === "tool");
				if (messages.includes("WRITER-PERSONA-MARKER")) {
					return hasToolResult
						? { text: "Writer completed" }
						: {
								tool: "write",
								args: { path: join(fixture.cwd, "grandchild.txt"), content: "Written by the mapped target" },
							};
				}
				if (!hasToolResult) return { tool: "omps", args: { action: "run", agent: "writer", task: "Write the task" } };
				return { text: "Delegation recorded", delayMs: 1500 };
			};
			await fixture.send({ type: "prompt", message: "Delegate the writing task" });
			await fixture.waitFor((record) => record.type === "message_end" && record.message?.customType === "omps-result");
			expect(await readFile(join(fixture.cwd, "grandchild.txt"), "utf8")).toBe("Written by the mapped target");
			const root = join(fixture.agentDir, "omps", "runs");
			const configurations = (await readdir(root, { recursive: true })).filter((name) => name.endsWith("config.json"));
			expect(configurations).toHaveLength(1);
			const configuration = JSON.parse(await readFile(join(root, configurations[0]), "utf8"));
			expect(configuration).toMatchObject({
				owner,
				limits: { maxConcurrentRuns: 4, maxDepth: 3 },
				agent: { tools: ["write"], thinking: "off" },
				nesting: { depth: 2, maxDepth: 3, rootSessionId: "fixture-root", parentRunId: "fixture-run" },
			});
			const status = JSON.parse(
				await readFile(join(root, configurations[0].replace("config.json", "status.json")), "utf8"),
			);
			expect(status).toMatchObject({ state: "completed", model: "fake/counter", nesting: configuration.nesting });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
