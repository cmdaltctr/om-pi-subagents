import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_AVAILABLE } from "./test/fixtures/pi-rpc.ts";
import { resolveTodoExtension, startTodoChild } from "./test/fixtures/todo.ts";

const extension = await resolveTodoExtension();

describe.skipIf(!PI_AVAILABLE)("real todo lists during parallel nested settlement", () => {
	it("keeps id one local to siblings and a grandchild while real reminders and nested results finish", async () => {
		const fixture = await startTodoChild({
			tools: ["ompss", "todo"],
			mode: "openspec",
			maxDepth: 3,
			seed: async ({ agentDir }) => {
				await writeFile(join(agentDir, "delegate.md"), "TODO-DELEGATE-PERSONA-MARKER");
				await writeFile(join(agentDir, "leaf.md"), "TODO-LEAF-PERSONA-MARKER");
				await writeFile(
					join(agentDir, "om-pi-subagents.yaml"),
					`version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
agents:
  delegate:
    persona: ./delegate.md
    tools: [ompss, todo]
    thinking: off
    extensions: [${JSON.stringify(extension)}]
  leaf:
    persona: ./leaf.md
    tools: [todo]
    thinking: off
    extensions: [${JSON.stringify(extension)}]
`,
				);
			},
		});
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const results = body.messages.filter((message: { role: string }) => message.role === "tool").length;
				const leaf = messages.includes("TODO-LEAF-PERSONA-MARKER");
				const delegate = messages.includes("TODO-DELEGATE-PERSONA-MARKER");
				const subject = leaf
					? messages.includes("SIBLING-LEAF-TASK")
						? "Sibling-only task"
						: "Grandchild-only task"
					: delegate
						? "Delegator-only task"
						: "Root-only task";
				if (results === 0) return { tool: "todo", args: { action: "create", subject } };
				if (results === 1)
					return {
						tool: "todo",
						args: { action: "update", id: 1, status: "in_progress", activeForm: "tracking owned work" },
					};
				if (delegate && results === 2)
					return { tool: "ompss", args: { action: "run", agent: "leaf", task: "GRANDCHILD-LEAF-TASK" } };
				if (!leaf && !delegate && results === 2)
					return { tool: "ompss", args: { action: "run", agent: "delegate", task: "DELEGATOR-TASK" } };
				if (!leaf && !delegate && results === 3)
					return { tool: "ompss", args: { action: "run", agent: "leaf", task: "SIBLING-LEAF-TASK" } };
				const beforeCompletion = leaf ? 2 : delegate ? 3 : 4;
				if (results === beforeCompletion && messages.includes("Todo check:"))
					return { tool: "todo", args: { action: "update", id: 1, status: "completed" } };
				if (results === beforeCompletion + 1) return { tool: "todo", args: { action: "list" } };
				if (results === beforeCompletion + 2) return { text: `${subject} final with owned results` };
				return { text: `${subject} early answer` };
			};
			await fixture.send({ type: "prompt", message: "Track parallel children and nested work" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect((await fixture.send({ type: "get_last_assistant_text" })).data.text).toBe(
				"Root-only task final with owned results",
			);
			expect(fixture.records.filter((record) => record.type === "agent_settled")).toHaveLength(1);
			const rootList = fixture.records.findLast(
				(record) => record.type === "tool_execution_end" && record.toolName === "todo",
			)!;
			expect(rootList.result.details.tasks).toMatchObject([{ id: 1, subject: "Root-only task", status: "completed" }]);
			const root = join(fixture.agentDir, "ompss", "runs");
			const paths = (await readdir(root, { recursive: true })).filter((path) => path.endsWith("config.json"));
			expect(paths).toHaveLength(3);
			const subjects: string[] = [];
			const owners = new Set<string>();
			const depths: number[] = [];
			for (const path of paths) {
				const config = JSON.parse(await readFile(join(root, path), "utf8"));
				depths.push(config.nesting.depth);
				owners.add(config.owner);
				const status = JSON.parse(await readFile(join(root, path.replace("config.json", "status.json")), "utf8"));
				expect(status.state).toBe("completed");
				const events = (await readFile(join(root, path.replace("config.json", "events.jsonl")), "utf8"))
					.trim()
					.split("\n")
					.map((line) => JSON.parse(line));
				const list = events.findLast((event) => event.type === "tool_execution_end" && event.toolName === "todo")!;
				expect(list.result.details.error).toBeUndefined();
				expect(list.result.details.tasks).toHaveLength(1);
				expect(list.result.details.tasks[0]).toMatchObject({ id: 1, status: "completed" });
				subjects.push(list.result.details.tasks[0].subject);
				expect(events.some((event) => event.entry?.customType === "todo-status-nudge")).toBe(true);
				const output = await readFile(join(root, path.replace("config.json", "output.md")), "utf8");
				expect(output).toContain("final with owned results");
				expect(output).not.toContain("early answer");
			}
			expect(subjects.sort()).toEqual(["Delegator-only task", "Grandchild-only task", "Sibling-only task"]);
			expect(depths.sort()).toEqual([2, 2, 3]);
			expect(owners.size).toBe(2);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
