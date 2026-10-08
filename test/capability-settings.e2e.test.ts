import { writeFixturePersona } from "./fixtures/registry.ts";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
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

function settingsDialogs(parent: PiFixture) {
	const seen = new Set(parent.records.map((record) => record.id).filter(Boolean));
	return {
		async next() {
			const request = await parent.waitFor(
				(record) =>
					record.type === "extension_ui_request" &&
					["select", "input", "confirm"].includes(record.method) &&
					!seen.has(record.id),
			);
			seen.add(request.id);
			return request;
		},
		reply(request: Record<string, any>, response: Record<string, unknown>) {
			parent.child.stdin!.write(`${JSON.stringify({ type: "extension_ui_response", id: request.id, ...response })}\n`);
		},
	};
}

async function fixturePackage(workspace: Workspace, capability: "Memory" | "Todo", folder: string) {
	const root = join(workspace.agentDir, folder);
	const entry = join(root, "entry.ts");
	await mkdir(root, { recursive: true });
	await writeFile(entry, 'throw new Error("Discovery must never load this extension");\n');
	const skill = join(root, "skills/omms-memory/SKILL.md");
	if (capability === "Memory") {
		await mkdir(dirname(skill), { recursive: true });
		await writeFile(skill, "---\nname: omms-memory\ndescription: Fixture memory skill\n---\nFixture only.\n");
	}
	await writeFile(
		join(root, "package.json"),
		JSON.stringify({
			name: capability === "Memory" ? "om-memory-system" : "om-pi-todo",
			pi: { extensions: ["./entry.ts"], ...(capability === "Memory" ? { skills: ["./skills"] } : {}) },
		}),
	);
	return {
		root: await realpath(root),
		entry: await realpath(entry),
		skill: capability === "Memory" ? await realpath(skill) : undefined,
	};
}

async function capabilitySession(workspace: Workspace, capability: "Memory" | "Todo", action = "Enable") {
	const registry = join(workspace.agentDir, "omps/config.yaml");
	await writeFixturePersona(workspace.agentDir, "reader.md", "READER-DETECTION-FIXTURE");
	const original =
		"# Preserve operator comment\nversion: 1\nlimits:\n  maxDepth: 2\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [bash]\n    thinking: off\n  other:\n    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n";
	await writeFile(registry, original);
	const parent = await startPi({ mcp: false, workspace, args: ["-e", index] });
	try {
		const commands = await parent.send({ type: "get_commands" });
		expect(commands.data.commands.some((command: { name: string }) => command.name === "omps-settings")).toBe(true);
		const dialogs = settingsDialogs(parent);
		const pending = parent.send({ type: "prompt", message: "/omps-settings" });
		// A failed assertion can dispose Pi while this command still waits for a dialog response.
		void pending.catch(() => undefined);
		for (const label of ["Agent capabilities", "reader", capability, action]) {
			const request = await dialogs.next();
			expect(request.method).toBe("select");
			const option = request.options.find((item: string) => item.startsWith(label));
			expect(option, `Missing ${label}: ${request.options}`).toBeDefined();
			dialogs.reply(request, { value: option });
		}
		return {
			parent,
			registry: await realpath(registry),
			original,
			...dialogs,
			async finish() {
				const done = await dialogs.next();
				expect(done.method).toBe("select");
				dialogs.reply(done, { value: "Done" });
				expect((await pending).data.disposition).toBe("handled");
				expect(workspace.model.requests).toHaveLength(0);
			},
		};
	} catch (error) {
		await parent.dispose();
		throw error;
	}
}

function checkConfirmation(
	request: Record<string, any>,
	registry: string,
	capability: "Memory" | "Todo",
	entry: string,
) {
	expect(request.method).toBe("confirm");
	expect(request.message).toContain("Agent: reader");
	expect(request.message).toContain(`Save to: ${registry}`);
	expect(request.message).toContain(`tools: + ${capability.toLowerCase()}`);
	expect(request.message).toContain(`extensions: + ${entry}`);
	expect(request.message).toContain("Active children and parent extensions stay unchanged.");
	if (capability === "Memory") expect(request.message).toContain("write and portability modes");
}

async function editCapability(
	parent: PiFixture,
	capability: "Memory" | "Todo",
	entry: string,
	action: "Enable" | "Disable",
) {
	const seen = new Set(parent.records.map((record) => record.id).filter(Boolean));
	const pending = parent.send({ type: "prompt", message: "/omps-settings" });
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
				personaFile: join(agentDir, "omps/personas", "reader.md"),
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
	const registry = join(workspace.agentDir, "omps/config.yaml");
	const parentTasks = join(workspace.cwd, "openspec", "changes", "parent", "tasks.md");
	await mkdir(dirname(parentTasks), { recursive: true });
	await writeFile(parentTasks, "# Parent tasks\n\n- [ ] 1.1 Preserve parent ownership\n");
	await writeFile(join(workspace.cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
	await writeFile(join(dirname(parentTasks), "proposal.md"), "# Parent fixture\n");
	await writeFixturePersona(workspace.agentDir, "reader.md", "READER-CAPABILITY-FIXTURE");
	await writeFile(
		registry,
		"# Keep this operator comment\nversion: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: []\n    thinking: off\n  other:\n    persona: ./personas/reader.md\n    tools: []\n    thinking: off\n",
	);
	const initial = (await loadRegistry(registry)).agents.get("reader")!;
	const parent = await startPi({
		mcp: false,
		workspace,
		args: ["-e", index, "-e", entry],
		env: { OMPS_PI_BIN: PI_BIN },
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

describe.skipIf(!PI_AVAILABLE)("detected capability settings through real Pi dialogs", () => {
	for (const capability of ["Memory", "Todo"] as const) {
		const packageName = capability === "Memory" ? "om-memory-system" : "om-pi-todo";

		it(`${capability}: proposes one listed npm package without a path prompt`, async () => {
			const workspace = await createWorkspace({ mcp: false });
			let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
			try {
				const resource = await fixturePackage(workspace, capability, `npm/node_modules/${packageName}`);
				await writeFile(
					join(workspace.agentDir, "settings.json"),
					JSON.stringify({ packages: [{ source: `npm:${packageName}`, extensions: [], skills: [] }] }),
				);
				session = await capabilitySession(workspace, capability);
				const confirmation = await session.next();
				checkConfirmation(confirmation, session.registry, capability, resource.entry);
				expect(await readFile(session.registry, "utf8")).toBe(session.original);
				session.reply(confirmation, { confirmed: true });
				await session.finish();
				const saved = await loadRegistry(session.registry);
				expect(saved.agents.get("reader")?.tools).toEqual(["bash", capability.toLowerCase()]);
				expect(saved.agents.get("reader")?.extensions).toEqual([resource.entry]);
				expect(saved.agents.get("reader")?.skills).toEqual([]);
				expect(saved.agents.get("other")?.tools).toEqual(["read"]);
				expect(saved.limits.maxDepth).toBe(2);
				expect(await readFile(session.registry, "utf8")).toContain("# Preserve operator comment");
			} finally {
				await session?.parent.dispose();
				await workspace.dispose();
			}
		});

		it(`${capability}: asks which of several listed packages to map`, async () => {
			const workspace = await createWorkspace({ mcp: false });
			let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
			try {
				const first = await fixturePackage(workspace, capability, "first");
				const second = await fixturePackage(workspace, capability, "second");
				await writeFile(
					join(workspace.agentDir, "settings.json"),
					JSON.stringify({ packages: ["./first", "./second"] }),
				);
				session = await capabilitySession(workspace, capability);
				const choice = await session.next();
				expect(choice.method).toBe("select");
				expect(choice.options).toEqual([first.root, second.root]);
				expect(await readFile(session.registry, "utf8")).toBe(session.original);
				session.reply(choice, { value: second.root });
				const confirmation = await session.next();
				checkConfirmation(confirmation, session.registry, capability, second.entry);
				session.reply(confirmation, { confirmed: true });
				await session.finish();
				expect((await loadRegistry(session.registry)).agents.get("reader")?.extensions).toEqual([second.entry]);
			} finally {
				await session?.parent.dispose();
				await workspace.dispose();
			}
		});

		it(`${capability}: cancelling package selection leaves YAML unchanged`, async () => {
			const workspace = await createWorkspace({ mcp: false });
			let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
			try {
				await fixturePackage(workspace, capability, "first");
				await fixturePackage(workspace, capability, "second");
				await writeFile(
					join(workspace.agentDir, "settings.json"),
					JSON.stringify({ packages: ["./first", "./second"] }),
				);
				session = await capabilitySession(workspace, capability);
				const choice = await session.next();
				expect(choice.method).toBe("select");
				session.reply(choice, { cancelled: true });
				await session.finish();
				expect(await readFile(session.registry, "utf8")).toBe(session.original);
				expect(session.parent.records.some((record) => ["input", "confirm"].includes(record.method))).toBe(false);
			} finally {
				await session?.parent.dispose();
				await workspace.dispose();
			}
		});

		it(`${capability}: gives install guidance before accepting an unlisted manual path`, async () => {
			const workspace = await createWorkspace({ mcp: false });
			let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
			try {
				const resource = await fixturePackage(workspace, capability, "unlisted");
				session = await capabilitySession(workspace, capability);
				const input = await session.next();
				expect(input.method).toBe("input");
				const guidance = session.parent.records.find(
					(record) => record.method === "notify" && record.message.includes(`pi install npm:${packageName}`),
				);
				expect(guidance).toBeDefined();
				expect(session.parent.records.indexOf(guidance!)).toBeLessThan(session.parent.records.indexOf(input));
				session.reply(input, { value: resource.root });
				const confirmation = await session.next();
				checkConfirmation(confirmation, session.registry, capability, resource.entry);
				session.reply(confirmation, { confirmed: true });
				await session.finish();
				expect((await loadRegistry(session.registry)).agents.get("reader")?.extensions).toEqual([resource.entry]);
			} finally {
				await session?.parent.dispose();
				await workspace.dispose();
			}
		});

		it(`${capability}: cancelled fallback leaves YAML unchanged`, async () => {
			const workspace = await createWorkspace({ mcp: false });
			let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
			try {
				session = await capabilitySession(workspace, capability);
				const input = await session.next();
				expect(input.method).toBe("input");
				expect(
					session.parent.records.some(
						(record) => record.method === "notify" && record.message.includes(`pi install npm:${packageName}`),
					),
				).toBe(true);
				session.reply(input, { cancelled: true });
				await session.finish();
				expect(await readFile(session.registry, "utf8")).toBe(session.original);
				expect(session.parent.records.some((record) => record.method === "confirm")).toBe(false);
			} finally {
				await session?.parent.dispose();
				await workspace.dispose();
			}
		});

		it.each(["declined", "conflicting"])(`${capability}: %s confirmation saves no partial mapping`, async (mode) => {
			const workspace = await createWorkspace({ mcp: false });
			let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
			try {
				const resource = await fixturePackage(workspace, capability, "installed");
				await writeFile(join(workspace.agentDir, "settings.json"), JSON.stringify({ packages: ["./installed"] }));
				session = await capabilitySession(workspace, capability);
				const confirmation = await session.next();
				checkConfirmation(confirmation, session.registry, capability, resource.entry);
				const unchanged = mode === "conflicting" ? `${session.original}# Concurrent operator edit\n` : session.original;
				if (mode === "conflicting") await writeFile(session.registry, unchanged);
				session.reply(confirmation, { confirmed: mode === "conflicting" });
				await session.finish();
				expect(await readFile(session.registry, "utf8")).toBe(unchanged);
				if (mode === "conflicting")
					expect(
						session.parent.records.some(
							(record) =>
								record.method === "notify" && record.notifyType === "error" && /changed/i.test(record.message),
						),
					).toBe(true);
			} finally {
				await session?.parent.dispose();
				await workspace.dispose();
			}
		});
	}

	it("Memory: detected package keeps the shipped-skill approval in the atomic edit", async () => {
		const workspace = await createWorkspace({ mcp: false });
		let session: Awaited<ReturnType<typeof capabilitySession>> | undefined;
		try {
			const resource = await fixturePackage(workspace, "Memory", "installed");
			await writeFile(join(workspace.agentDir, "settings.json"), JSON.stringify({ packages: ["./installed"] }));
			session = await capabilitySession(workspace, "Memory", "Enable with shipped skill");
			const confirmation = await session.next();
			checkConfirmation(confirmation, session.registry, "Memory", resource.entry);
			expect(confirmation.message).toContain(`skills: + ${resource.skill}`);
			expect(await readFile(session.registry, "utf8")).toBe(session.original);
			session.reply(confirmation, { confirmed: true });
			await session.finish();
			const agent = (await loadRegistry(session.registry)).agents.get("reader")!;
			expect(agent.tools).toEqual(["bash", "memory"]);
			expect(agent.extensions).toEqual([resource.entry]);
			expect(agent.skills).toEqual([resource.skill]);
		} finally {
			await session?.parent.dispose();
			await workspace.dispose();
		}
	});
});

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
