import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspace, PI_AVAILABLE, startPi } from "./fixtures/pi-rpc.ts";

import { resolveTodoExtension, TODO_VERSION } from "./fixtures/todo.ts";

const extension = await resolveTodoExtension();

describe("real todo package prerequisites", () => {
	it("uses a pinned published development dependency and its declared extension entry", async () => {
		const project = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
		expect(project.devDependencies["om-pi-todo"]).toBe(TODO_VERSION);
		expect(extension).toContain("node_modules/om-pi-todo/");
		expect(await readFile(extension, "utf8")).toContain("registerTodoTool");
	});

	it("isolates home, XDG preferences and Pi settings inside the disposable workspace", async () => {
		const workspace = await createWorkspace({ mcp: false });
		try {
			expect(workspace.isolationEnv.HOME).toBe(join(workspace.root, "home"));
			expect(workspace.isolationEnv.XDG_CONFIG_HOME).toBe(join(workspace.root, "config"));
			expect(workspace.isolationEnv.PI_CODING_AGENT_DIR).toBe(workspace.agentDir);
		} finally {
			await workspace.dispose();
		}
	});
});

describe.skipIf(!PI_AVAILABLE)("real todo package loading", () => {
	it("loads the declared entry and executes a real local todo call", async () => {
		const fixture = await startPi({ mcp: false, args: ["-e", extension] });
		try {
			const commands = await fixture.send({ type: "get_commands" });
			expect(commands.success, fixture.stderr()).toBe(true);
			expect(commands.data.commands).toEqual(expect.arrayContaining([expect.objectContaining({ name: "todos" })]));
			fixture.model.script = [
				{ tool: "todo", args: { action: "create", subject: "Track the disposable task" } },
				{ text: "Task recorded" },
			];
			expect((await fixture.send({ type: "prompt", message: "Record a local task" })).success).toBe(true);
			const result = await fixture.waitFor(
				(record) => record.type === "tool_execution_end" && record.toolName === "todo",
			);
			expect(result.isError, JSON.stringify(result)).toBe(false);
			expect(JSON.stringify(result.result)).toContain("Track the disposable task");
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
