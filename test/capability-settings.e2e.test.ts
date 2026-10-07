import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry, type AgentSnapshot } from "../src/config.ts";
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../src/protocol.ts";
import { buildLaunch } from "../src/runner.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";
import { memoryAvailable, resolveMemoryExtension, seedMemoryConfig } from "./fixtures/memory.ts";
import { createWorkspace, PI_AVAILABLE, PI_BIN, startPi, type PiFixture, type Workspace } from "./fixtures/pi-rpc.ts";
import { resolveTodoExtension, seedTodoPreferences } from "./fixtures/todo.ts";

const index = new URL("../src/index.ts", import.meta.url).pathname;

async function editCapability(
	parent: PiFixture,
	capability: "Memory" | "Todo",
	entry: string,
	action: "Enable" | "Disable",
) {
	const seen = new Set(parent.records.map((record) => record.id).filter(Boolean));
	const pending = parent.send({ type: "prompt", message: "/ompss-settings" });
	const dialog = async (method: string) => {
		const request = await parent.waitFor(
			(record) => record.type === "extension_ui_request" && record.method === method && !seen.has(record.id),
		);
		seen.add(request.id);
		return request;
	};
	const reply = (request: Record<string, any>, response: Record<string, unknown>) => {
		parent.child.stdin!.write(`${JSON.stringify({ type: "extension_ui_response", id: request.id, ...response })}\n`);
	};
	for (const label of ["Agent capabilities", "reader", capability, action]) {
		const request = await dialog("select");
		const option = request.options.find((item: string) => item.startsWith(label));
		expect(option, `Missing ${label}: ${request.options}`).toBeDefined();
		reply(request, { value: option });
	}
	if (action === "Enable") reply(await dialog("input"), { value: entry });
	const confirmation = await dialog("confirm");
	expect(confirmation.message).toContain("reader");
	reply(confirmation, { confirmed: true });
	reply(await dialog("select"), { value: "Done" });
	expect((await pending).data.disposition).toBe("handled");
}

async function startMappedChild(workspace: Workspace, snapshot: AgentSnapshot, registry: string) {
	return startPi({
		mcp: false,
		workspace,
		launch: ({ cwd, agentDir }) =>
			buildLaunch({
				snapshot,
				cwd,
				personaFile: join(agentDir, "reader.md"),
				guardPath: new URL("../src/child-guard.ts", import.meta.url).pathname,
				runToken: "capability-fixture-token",
				piBin: PI_BIN,
				parentModel: "fake/counter",
				lineage: fixtureLineage(registry),
			}),
	});
}

async function ready(child: PiFixture) {
	await child.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
	const result = await child.waitFor((record) => record.entry?.customType === READY_ENTRY);
	expect(result.entry.data.ok, JSON.stringify(result.entry.data)).toBe(true);
}

async function scenario(capability: "Memory" | "Todo", entry: string, workspace: Workspace) {
	const registry = join(workspace.agentDir, "om-pi-subagents.yaml");
	const parentTasks = join(workspace.cwd, "openspec", "changes", "parent", "tasks.md");
	await mkdir(dirname(parentTasks), { recursive: true });
	await writeFile(parentTasks, "# Parent tasks\n\n- [ ] 1.1 Preserve parent ownership\n");
	await writeFile(join(workspace.cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
	await writeFile(join(dirname(parentTasks), "proposal.md"), "# Parent fixture\n");
	await writeFile(join(workspace.agentDir, "reader.md"), "READER-CAPABILITY-FIXTURE");
	await writeFile(
		registry,
		"# Keep this operator comment\nversion: 1\nagents:\n  reader:\n    persona: reader.md\n    tools: []\n    thinking: off\n  other:\n    persona: reader.md\n    tools: []\n    thinking: off\n",
	);
	const initial = (await loadRegistry(registry)).agents.get("reader")!;
	const parent = await startPi({
		mcp: false,
		workspace,
		args: ["-e", index, "-e", entry],
		env: { OMPSS_PI_BIN: PI_BIN },
	});
	let active: PiFixture | undefined;
	let enabled: PiFixture | undefined;
	let disabled: PiFixture | undefined;
	try {
		await editCapability(parent, capability, entry, "Enable");
		const mapped = (await loadRegistry(registry)).agents.get("reader")!;
		const tool = capability === "Memory" ? "memory" : "todo";
		expect(initial.tools).not.toContain(tool);
		expect(mapped.tools).toContain(tool);
		expect(mapped.extensions).toHaveLength(1);
		expect((await loadRegistry(registry)).agents.get("other")?.tools).toEqual([]);
		active = await startMappedChild(workspace, mapped, registry);
		await ready(active);
		await editCapability(parent, capability, entry, "Disable");
		const after = await loadRegistry(registry);
		expect(after.agents.get("reader")?.tools).not.toContain(tool);
		expect(after.agents.get("reader")?.extensions).toEqual([]);
		expect(after.agents.get("reader")?.skills).toEqual([]);
		expect(after.agents.get("other")?.tools).toEqual([]);
		expect(await readFile(registry, "utf8")).toContain("# Keep this operator comment");
		expect(await readFile(parentTasks, "utf8")).toBe("# Parent tasks\n\n- [ ] 1.1 Preserve parent ownership\n");
		enabled = active;
		if (capability === "Todo") {
			workspace.model.script = [
				{ tool: "todo", args: { action: "create", subject: "Active child task" } },
				{ text: "Active todo child retained its tool" },
			];
			await enabled.send({ type: "prompt", message: "Create a child-local task" });
			await enabled.waitFor((record) => record.type === "agent_settled");
			expect(
				enabled.records.some(
					(record) => record.type === "tool_execution_end" && record.toolName === "todo" && !record.isError,
				),
			).toBe(true);
			expect(
				(await enabled.send({ type: "get_entries" })).data.entries.some(
					(item: { customType: string }) => item.customType === "pi-todo-session",
				),
			).toBe(true);
		} else {
			workspace.model.script = [
				{ tool: "memory", args: { mode: "add", content: "Active child memory fixture" } },
				{ text: "Active memory child retained its tool" },
			];
			await enabled.send({ type: "prompt", message: "Add a child-local memory" });
			await enabled.waitFor((record) => record.type === "agent_settled");
			expect(
				enabled.records.some(
					(record) => record.type === "tool_execution_end" && record.toolName === "memory" && !record.isError,
				),
			).toBe(true);
		}
		disabled = await startMappedChild(workspace, after.agents.get("reader")!, registry);
		await ready(disabled);
		expect(
			(await disabled.send({ type: "get_entries" })).data.entries.some(
				(item: { customType: string }) => item.customType === "pi-todo-session",
			),
		).toBe(false);
		const tools = (await disabled.send({ type: "get_state" })).data;
		expect(JSON.stringify(tools)).not.toContain(`"${tool}"`);
		const embeddings = workspace.model.embeddings.length;
		workspace.model.script = [{ text: "No optional child capability" }];
		await disabled.send({ type: "prompt", message: "Answer without optional child tools" });
		await disabled.waitFor((record) => record.type === "agent_settled");
		if (capability === "Memory") expect(workspace.model.embeddings).toHaveLength(embeddings);
		workspace.model.script = (body) =>
			body.messages.some((message: { role: string }) => message.role === "tool")
				? { text: "Parent sibling tool remains available" }
				: { tool, args: capability === "Memory" ? { mode: "list" } : { action: "list" } };
		await parent.send({ type: "prompt", message: "List parent capability state" });
		await parent.waitFor((record) => record.type === "agent_settled");
		expect(
			parent.records.some(
				(record) => record.type === "tool_execution_end" && record.toolName === tool && !record.isError,
			),
		).toBe(true);
		expect(await readFile(parentTasks, "utf8")).toContain("- [ ] 1.1 Preserve parent ownership");
	} finally {
		for (const fixture of [disabled, active, parent]) {
			if (!fixture) continue;
			await fixture.exit();
			await fixture.dispose();
		}
	}
}

describe.skipIf(!PI_AVAILABLE)("per-agent settings with real siblings", () => {
	it("enables then disables the real todo entry for future children", async () => {
		const workspace = await createWorkspace({ mcp: false });
		try {
			await seedTodoPreferences(workspace.agentDir, "openspec");
			await scenario("Todo", await resolveTodoExtension(), workspace);
			const preferences = join(workspace.root, "config", "pi-todo", "config.json");
			expect(JSON.parse(await readFile(preferences, "utf8"))).toEqual({ mode: "openspec" });
		} finally {
			await workspace.dispose();
		}
	});

	it.skipIf(!memoryAvailable())("enables then disables the real OMMS entry and its hooks", async () => {
		const workspace = await createWorkspace({ mcp: false });
		try {
			await seedMemoryConfig(workspace.isolationEnv.HOME, workspace.model);
			await scenario("Memory", resolveMemoryExtension()!, workspace);
		} finally {
			await workspace.dispose();
		}
	});
});
