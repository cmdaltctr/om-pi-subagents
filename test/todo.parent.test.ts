import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_AVAILABLE, PI_BIN, startPi } from "./fixtures/pi-rpc.ts";
import { resolveTodoExtension, seedTodoPreferences } from "./fixtures/todo.ts";

const todoExtension = await resolveTodoExtension();
const index = new URL("../src/index.ts", import.meta.url).pathname;
const checklist = "# Tasks\n\n- [ ] 1.1 Preserve parent task\n";

describe.skipIf(!PI_AVAILABLE)("parent todo ownership with the real package", () => {
	it.each([
		["normal", "omps-first"],
		["normal", "todo-first"],
		["openspec", "omps-first"],
		["openspec", "todo-first"],
	] as const)("preserves %s parent tasks with %s load order", async (mode, order) => {
		const args: string[] = [];
		let preferences = "";
		let tasks = "";
		const fixture = await startPi({
			mcp: false,
			args,
			env: { OMPS_PI_BIN: PI_BIN },
			seed: async ({ cwd, agentDir }) => {
				preferences = await seedTodoPreferences(agentDir, mode);
				const change = join(cwd, "openspec", "changes", "preserve-parent");
				await mkdir(change, { recursive: true });
				await writeFile(join(cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
				tasks = join(change, "tasks.md");
				await writeFile(tasks, checklist);
				await writeFile(join(change, "proposal.md"), "# Preserve parent tasks\n");
				await writeFile(join(agentDir, "leaf.md"), "TODO-LEAF-PERSONA-MARKER");
				await writeFile(
					join(agentDir, "om-pi-subagents.yaml"),
					`version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
agents:
  leaf:
    persona: ./leaf.md
    tools: [todo]
    thinking: off
    extensions: [${JSON.stringify(todoExtension)}]
`,
				);
				const seed = join(agentDir, "parent-mode.ts");
				await writeFile(
					seed,
					`export default (pi) => pi.on("session_start", (_event, ctx) => {
					pi.appendEntry("pi-todo-session", ${mode === "normal" ? '{ mode: "normal" }' : '{ mode: "openspec", binding: { root: ctx.cwd, change: "preserve-parent" } }'});
					const original = ctx.ui.setWidget;
					ctx.ui.setWidget = (key, content, options) => {
						pi.appendEntry("fixture-widget-call", { key, kind: typeof content });
						return original(key, content, options);
					};
				});`,
				);
				args.push(
					"-e",
					seed,
					...[order === "omps-first" ? index : todoExtension, order === "omps-first" ? todoExtension : index].flatMap(
						(path) => ["-e", path],
					),
				);
			},
		});
		try {
			const commands = (await fixture.send({ type: "get_commands" })).data.commands;
			for (const name of ["todos", "omps"])
				expect(commands.some((command: { name: string }) => command.name === name)).toBe(true);
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const results = body.messages.filter((message: { role: string }) => message.role === "tool");
				if (messages.includes("TODO-LEAF-PERSONA-MARKER")) {
					if (results.length === 0) return { tool: "todo", args: { action: "create", subject: "Child-only task" } };
					if (results.length === 1)
						return {
							tool: "todo",
							args: { action: "update", id: 1, status: "in_progress", activeForm: "checking child work" },
						};
					if (results.length === 2 && messages.includes("Todo check:"))
						return { tool: "todo", args: { action: "update", id: 1, status: "completed" } };
					return { text: results.length === 2 ? "Early child answer" : "Leaf final after todo correction" };
				}
				if (results.length === 0)
					return {
						tool: "todo",
						args: mode === "normal" ? { action: "create", subject: "Parent-only task" } : { action: "list" },
					};
				if (results.length === 1)
					return { tool: "omps", args: { action: "run", agent: "leaf", task: "Correct child-local task status" } };
				if (messages.includes("OMPS run")) {
					return results.length === 2 ? { tool: "todo", args: { action: "list" } } : { text: "Parent tasks preserved" };
				}
				return { text: "Parent launch recorded" };
			};
			await fixture.send({ type: "prompt", message: "Track parent work and delegate child work" });
			await fixture.waitFor(
				(record) =>
					record.message?.role === "assistant" && record.message.content?.[0]?.text === "Parent tasks preserved",
			);
			const entries = (await fixture.send({ type: "get_entries" })).data.entries;
			const modes = entries.filter((entry: { customType?: string }) => entry.customType === "pi-todo-session");
			expect(modes).toHaveLength(1);
			expect(modes[0].data).toEqual(
				mode === "normal"
					? { mode }
					: { mode, binding: { root: await realpath(fixture.cwd), change: "preserve-parent" } },
			);
			const lists = fixture.records.filter(
				(record) => record.type === "tool_execution_end" && record.toolName === "todo",
			);
			const parentList = lists.at(-1)!.result;
			expect(parentList.details.error, JSON.stringify(parentList)).toBeUndefined();
			expect(JSON.stringify(parentList)).toContain(mode === "normal" ? "Parent-only task" : "Preserve parent task");
			expect(JSON.stringify(parentList)).not.toContain("Child-only task");
			expect(await readFile(tasks, "utf8")).toBe(checklist);
			expect(JSON.parse(await readFile(preferences, "utf8"))).toEqual({ mode });
			const result = fixture.records.find((record) => record.message?.customType === "omps-result");
			expect(result).toBeDefined();
			expect(result!.message.content).toContain("Leaf final after todo correction");
			expect(result!.message.content).not.toContain("Early child answer");
			if (mode === "normal") {
				const keys = entries
					.filter((entry: { customType?: string }) => entry.customType === "fixture-widget-call")
					.map((entry: { data: { key: string } }) => entry.data.key);
				expect(keys).toContain("rpiv-todos");
				expect(keys).toContain("omps");
			}
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
