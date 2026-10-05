import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { PREFLIGHT_COMMAND, READY_ENTRY, VIOLATION_ENTRY } from "./protocol.ts";
import { PI_AVAILABLE } from "./test/fixtures/pi-rpc.ts";
import { startTodoChild } from "./test/fixtures/todo.ts";

describe.skipIf(!PI_AVAILABLE)("explicit real todo child capability", () => {
	it.each(["normal", "openspec"] as const)(
		"starts a leaf's local tasks when the global default is %s",
		async (mode) => {
			const fixture = await startTodoChild({ mode });
			try {
				await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
				const ready = await fixture.waitFor((record) => record.entry?.customType === READY_ENTRY);
				expect(ready.entry.data.ok).toBe(true);
				fixture.model.script = [
					{ tool: "todo", args: { action: "create", subject: "Child-local task" } },
					{ tool: "todo", args: { action: "update", id: 1, status: "in_progress", activeForm: "checking the task" } },
					{ tool: "todo", args: { action: "update", id: 1, status: "completed" } },
					{ tool: "todo", args: { action: "list" } },
					{ text: "Child-local task completed" },
				];
				await fixture.send({ type: "prompt", message: "Complete a child-local task" });
				await fixture.waitFor((record) => record.type === "agent_settled");
				const results = fixture.records.filter(
					(record) => record.type === "tool_execution_end" && record.toolName === "todo",
				);
				expect(results).toHaveLength(4);
				for (const result of results) {
					expect(result.isError).toBe(false);
					expect(result.result.details.error, JSON.stringify(result.result)).toBeUndefined();
				}
				expect(JSON.stringify(results.at(-1)?.result)).toContain("Child-local task");
				expect(JSON.stringify(results.at(-1)?.result)).toContain("completed");
				const entries = (await fixture.send({ type: "get_entries" })).data.entries;
				expect(entries).toEqual(
					expect.arrayContaining([
						expect.objectContaining({
							customType: "pi-todo-session",
							data: { mode: "normal" },
						}),
					]),
				);
				const preference = join(dirname(fixture.agentDir), "config", "pi-todo", "config.json");
				expect(JSON.parse(await readFile(preference, "utf8"))).toEqual({ mode });
				expect(
					fixture.records.some((record) => record.type === "extension_ui_request" && record.method === "select"),
				).toBe(false);
				expect(await fixture.exit()).toBe(0);
			} finally {
				await fixture.dispose();
			}
		},
	);

	it("blocks a real todo call when its extension is mapped without exact tool approval", async () => {
		const fixture = await startTodoChild({ tools: ["read"] });
		try {
			fixture.model.script = [
				{ tool: "todo", args: { action: "create", subject: "Must not be created" } },
				{ text: "Todo call refused" },
			];
			await fixture.send({ type: "prompt", message: "Try an unapproved task call" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(
				fixture.records.some(
					(record) => record.entry?.customType === VIOLATION_ENTRY && record.entry.data.tool === "todo",
				),
			).toBe(true);
			expect(
				(await fixture.send({ type: "get_entries" })).data.entries.some(
					(entry: { customType: string }) => entry.customType === "pi-todo-session",
				),
			).toBe(false);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("fails readiness when todo is approved but its real extension is missing", async () => {
		const fixture = await startTodoChild({ extensions: [] });
		try {
			await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
			const ready = await fixture.waitFor((record) => record.entry?.customType === READY_ENTRY);
			expect(ready.entry.data).toMatchObject({
				ok: false,
				problems: expect.arrayContaining(['tool "todo" is not registered']),
			});
			expect(fixture.model.requests).toHaveLength(0);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});
});
