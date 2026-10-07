import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PI_BIN, startPi } from "./pi-rpc.ts";
import { editRpcSettings } from "./settings.ts";
import { resolveTodoExtension, seedTodoPreferences } from "./todo.ts";

/** Verify actual child-local todo ids while operator inspection and settings leave work running. */
export async function verifyTodoViewerChild(mode: "normal" | "openspec", order: "omps-first" | "todo-first") {
	const extension = await resolveTodoExtension();
	const index = new URL("../../src/index.ts", import.meta.url).pathname;
	const args: string[] = [];
	let preferences = "";
	let tasks = "";
	const fixture = await startPi({
		mcp: false,
		args,
		env: { OMPS_PI_BIN: PI_BIN, OMPS_CHILD: "" },
		seed: async ({ cwd, agentDir }) => {
			preferences = await seedTodoPreferences(agentDir, mode);
			const change = join(cwd, "openspec", "changes", "preserve-parent");
			await mkdir(change, { recursive: true });
			await writeFile(join(cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
			tasks = join(change, "tasks.md");
			await writeFile(tasks, "# Tasks\n\n- [ ] 1.1 Preserve parent task\n");
			await writeFile(join(change, "proposal.md"), "# Preserve parent tasks\n");
			await writeFile(join(agentDir, "leaf.md"), "TODO-VIEWER-LEAF-MARKER");
			await writeFile(
				join(agentDir, "om-pi-subagents.yaml"),
				`version: 1
limits: { maxDepth: 3, maxConcurrentRuns: 4 }
agents:
  leaf:
    persona: ./leaf.md
    tools: [todo]
    thinking: off
    extensions: [${JSON.stringify(extension)}]
`,
			);
			const seed = join(agentDir, "parent-mode.ts");
			await writeFile(
				seed,
				`export default (pi) => pi.on("session_start", (_event, ctx) => {
				pi.appendEntry("pi-todo-session", ${JSON.stringify(mode === "normal" ? { mode } : { mode, binding: { root: await realpath(cwd), change: "preserve-parent" } })});
			});`,
			);
			args.push(
				"-e",
				seed,
				...[order === "omps-first" ? index : extension, order === "omps-first" ? extension : index].flatMap((path) => [
					"-e",
					path,
				]),
			);
		},
	});
	let runId: string | undefined;
	try {
		fixture.model.script = (body) => {
			const child = JSON.stringify(body.messages).includes("TODO-VIEWER-LEAF-MARKER");
			const count = body.messages.filter((message: { role: string }) => message.role === "tool").length;
			if (child) {
				if (count === 0) return { tool: "todo", args: { action: "create", subject: "Child-only task" } };
				if (count === 1) return { tool: "todo", args: { action: "list" } };
				return { hang: true };
			}
			if (count === 0)
				return {
					tool: "todo",
					args: mode === "normal" ? { action: "create", subject: "Parent-only task" } : { action: "list" },
				};
			if (count === 1) return { tool: "omps", args: { action: "run", agent: "leaf", task: "Track child-local work" } };
			return { text: "Parent launch recorded" };
		};
		await fixture.send({ type: "prompt", message: "Track parent work and delegate" });
		const launch = await fixture.waitFor(
			(record) => record.type === "tool_execution_end" && record.toolName === "omps",
		);
		assert.equal(launch.isError, false, JSON.stringify(launch.result));
		runId = launch.result.details.runId;
		await fixture.waitFor((record) => record.type === "agent_settled");
		const childRequests = () =>
			fixture.model.requests.filter((body) => JSON.stringify(body).includes("TODO-VIEWER-LEAF-MARKER"));
		const deadline = Date.now() + 15_000;
		while (childRequests().length < 3 && Date.now() < deadline) await new Promise((done) => setTimeout(done, 20));
		assert.equal(childRequests().length, 3);
		const state = (await fixture.send({ type: "get_state" })).data;
		const directory = join(fixture.agentDir, "omps", "runs", state.sessionId, runId!);
		const configPath = join(directory, "config.json");
		const configBefore = await readFile(configPath);
		const eventsPath = join(directory, "events.jsonl");
		const events = async () =>
			(await readFile(eventsPath, "utf8"))
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line));
		let childList;
		while (Date.now() < deadline) {
			childList = (await events()).findLast(
				(record) => record.type === "tool_execution_end" && record.toolName === "todo",
			);
			if (childList?.result.details.action === "list") break;
			await new Promise((done) => setTimeout(done, 20));
		}
		assert.equal(childList.result.details.action, "list");
		assert.deepEqual(
			childList.result.details.tasks.map((task: { id: number; subject: string }) => [task.id, task.subject]),
			[[1, "Child-only task"]],
		);
		// Normal-mode creation succeeds even when the saved default is OpenSpec; linked state stays absent.
		assert.equal(childList.result.details.linked, undefined);
		const entriesBefore = (await fixture.send({ type: "get_entries" })).data.entries;
		const bindingsBefore = entriesBefore.filter(
			(entry: { customType?: string }) => entry.customType === "pi-todo-session",
		);
		assert.equal(bindingsBefore.length, 1);
		const bytesBefore = await Promise.all([preferences, tasks].map((path) => readFile(path)));
		const requestsBefore = fixture.model.requests.length;
		const toolsBefore = fixture.records.filter((record) => record.type === "tool_execution_start").length;
		const inspectionStart = fixture.records.length;
		assert.equal(
			(await fixture.send({ type: "prompt", message: `/omps inspect ${runId}` })).data.disposition,
			"handled",
		);
		assert(
			fixture.records
				.slice(inspectionStart)
				.some((record) => record.method === "notify" && record.message?.includes("Track child-local work")),
		);
		await editRpcSettings(fixture, 0, "2");
		await editRpcSettings(fixture, 1, "2");
		await editRpcSettings(fixture, 2, "1");
		assert.equal(fixture.model.requests.length, requestsBefore);
		assert.equal(fixture.records.filter((record) => record.type === "tool_execution_start").length, toolsBefore);
		assert.deepEqual((await fixture.send({ type: "get_state" })).data.model, state.model);
		assert.deepEqual(await readFile(configPath), configBefore);
		const config = JSON.parse(configBefore.toString());
		assert.deepEqual(config.agent.tools, ["todo"]);
		assert(!config.agent.tools.includes("omps"));
		const after = (await events()).findLast(
			(record) => record.type === "tool_execution_end" && record.toolName === "todo",
		);
		assert.deepEqual(after.result.details, childList.result.details);
		const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
		assert.equal(status.state, "running");
		for (const [position, path] of [preferences, tasks].entries())
			assert.deepEqual(await readFile(path), bytesBefore[position]);
		const entriesAfter = (await fixture.send({ type: "get_entries" })).data.entries;
		assert.deepEqual(
			entriesAfter.filter((entry: { customType?: string }) => entry.customType === "pi-todo-session"),
			bindingsBefore,
		);
		assert.deepEqual(
			entriesAfter.filter(
				(entry: { type?: string; message?: { toolName?: string } }) =>
					entry.type === "message" && entry.message?.toolName === "todo",
			),
			entriesBefore.filter(
				(entry: { type?: string; message?: { toolName?: string } }) =>
					entry.type === "message" && entry.message?.toolName === "todo",
			),
		);
		assert.equal(
			fixture.records.some((record) => record.message?.customType === "omps-result"),
			false,
		);
	} finally {
		if (runId) await fixture.send({ type: "prompt", message: `/omps cancel ${runId}` });
		await fixture.exit();
		await fixture.dispose();
	}
}
