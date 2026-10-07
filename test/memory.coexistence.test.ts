// Task 5.4: concurrent same-project memory children, another-project cwd, parent load order,
// memory failures and sibling absence. True lifecycle outcomes stay independent, and every
// store stays disposable with fake providers only.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_AVAILABLE, createWorkspace, PI_BIN, startPi } from "./fixtures/pi-rpc.ts";
import {
	capturedText,
	memoryAvailable,
	memoryStorePath,
	resolveMemoryExtension,
	seedMemoryConfig,
	startMemoryChild,
} from "./fixtures/memory.ts";

const describeMemory = describe.skipIf(!PI_AVAILABLE || !memoryAvailable());

describeMemory("memory coexistence", () => {
	it("keeps two concurrent same-project children on one store independent", async () => {
		const workspace = await createWorkspace({ mcp: false });
		await seedMemoryConfig(workspace.isolationEnv.HOME, workspace.model);
		const first = await startMemoryChild({ workspace });
		const second = await startMemoryChild({ workspace });
		try {
			// The model server is shared: branch on each request's own body, never its position.
			const concurrentScript = (body: { messages?: Array<{ role?: string }> }) => {
				const tools = (body.messages ?? []).filter((message) => message.role === "tool").length;
				if (tools === 0)
					return { tool: "memory", args: { mode: "add", content: "Concurrent child fact for the shared store" } };
				if (tools === 1) return { tool: "memory", args: { mode: "search", query: "shared store" } };
				return { text: "concurrent child done" };
			};
			first.model.script = concurrentScript;
			second.model.script = concurrentScript;
			await first.send({ type: "prompt", message: "Record and search a concurrent fact" });
			await second.send({ type: "prompt", message: "Record and search a concurrent fact" });
			await first.waitFor((record) => record.type === "agent_settled");
			await second.waitFor((record) => record.type === "agent_settled");
			for (const fixture of [first, second])
				expect(
					fixture.records.filter((record) => record.type === "tool_execution_end" && record.toolName === "memory")
						.length,
				).toBe(2);
			expect(await capturedText(memoryStorePath(workspace.isolationEnv.HOME))).toContain("Concurrent child fact");
			expect(await first.exit()).toBe(0);
			expect(await second.exit()).toBe(0);
		} finally {
			await first.dispose();
			await second.dispose();
		}
	});

	it("scopes a memory child to its own project cwd", async () => {
		const workspace = await createWorkspace({ mcp: false });
		await seedMemoryConfig(workspace.isolationEnv.HOME, workspace.model);
		const otherProject = join(workspace.root, "other-project");
		await mkdir(otherProject, { recursive: true });
		const home = await startMemoryChild({ workspace });
		const away = await startMemoryChild({ workspace, cwd: otherProject });
		try {
			home.model.script = (body: { messages?: Array<{ role?: string }> }) =>
				(body.messages ?? []).some((message) => message.role === "tool")
					? { text: "home done" }
					: { tool: "memory", args: { mode: "add", content: "Home-project-only fact for scoping" } };
			away.model.script = (body: { messages?: Array<{ role?: string }> }) =>
				(body.messages ?? []).some((message) => message.role === "tool")
					? { text: "away done" }
					: { tool: "memory", args: { mode: "search", query: "Home-project-only fact" } };
			await home.send({ type: "prompt", message: "Record a home-project fact" });
			await home.waitFor((record) => record.type === "agent_settled");
			await away.send({ type: "prompt", message: "Search for the home-project fact" });
			await away.waitFor((record) => record.type === "agent_settled");
			const search = away.records.find(
				(record) => record.type === "tool_execution_end" && record.toolName === "memory",
			);
			// The other project sees no recall of the home project's memory.
			const reply = JSON.parse((search?.result?.content as Array<{ text?: string }> | undefined)?.[0]?.text ?? "{}");
			expect(reply.count).toBe(0);
			expect(await home.exit()).toBe(0);
			expect(await away.exit()).toBe(0);
		} finally {
			await home.dispose();
			await away.dispose();
		}
	});

	it("keeps a memory failure a memory error while the run completes", async () => {
		const fixture = await startMemoryChild({ deadEmbeddings: true });
		try {
			fixture.model.script = [
				{ tool: "memory", args: { mode: "add", content: "Must fail its embedding, not the run" } },
				{ text: "child finished despite the memory error" },
			];
			await fixture.send({ type: "prompt", message: "Try a memory add against a dead provider" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			const add = fixture.records.find(
				(record) => record.type === "tool_execution_end" && record.toolName === "memory",
			);
			expect(add?.isError).toBe(false); // the tool reports its own failure text
			expect(JSON.stringify(add?.result ?? "")).toMatch(/error|failed/i);
			expect(fixture.model.embeddings).toHaveLength(0); // nothing reached any provider
			expect(await fixture.exit()).toBe(0); // the run itself completed
		} finally {
			await fixture.dispose();
		}
	});

	it.each(["omps-first", "memory-first"] as const)(
		"launches a memory child with %s parent load order",
		async (order) => {
			const extension = resolveMemoryExtension()!;
			const workspace = await createWorkspace({ mcp: false });
			await seedMemoryConfig(workspace.isolationEnv.HOME, workspace.model);
			const registry = join(workspace.agentDir, "om-pi-subagents.yaml");
			await writeFile(join(workspace.agentDir, "leaf.md"), "MEMORY-CHILD-PERSONA-MARKER");
			await writeFile(
				registry,
				`version: 1\nlimits: { maxDepth: 1, maxConcurrentRuns: 1 }\nagents:\n  leaf:\n    persona: ./leaf.md\n    tools: [memory]\n    thinking: off\n    extensions: [${JSON.stringify(extension)}]\n`,
			);
			const index = new URL("../src/index.ts", import.meta.url).pathname;
			const parent = await startPi({
				mcp: false,
				workspace,
				args: order === "omps-first" ? ["-e", index, "-e", extension] : ["-e", extension, "-e", index],
				env: { OMPS_REGISTRY: registry, OMPS_PI_BIN: PI_BIN },
			});
			try {
				parent.model.script = (body: { messages?: Array<{ role?: string; content?: unknown }> }) => {
					if (JSON.stringify(body.messages).includes("MEMORY-CHILD-PERSONA-MARKER")) {
						const tools = (body.messages ?? []).filter((message) => message.role === "tool").length;
						if (tools === 0) return { tool: "memory", args: { mode: "add", content: "Load-order child fact" } };
						return { text: "Load-order child finished" };
					}
					const launched = (body.messages ?? []).some(
						(message: { role?: string; content?: unknown }) =>
							message.role === "tool" && JSON.stringify(message.content ?? "").includes("Started run"),
					);
					return launched
						? { text: "Load-order delegation recorded" }
						: { tool: "omps", args: { action: "run", agent: "leaf", task: "Record a load-order fact" } };
				};
				await parent.send({ type: "prompt", message: "Delegate to the memory child" });
				// The result returns to the parent; the child's own work is in its run directory.
				const delivered = await parent.waitFor((record) =>
					(record.messages ?? []).find(
						(message: { customType?: string; content?: string }) =>
							message.customType === "omps-result" && /completed/.test(String(message.content ?? "")),
					),
				);
				const result = (delivered.messages ?? []).find(
					(message: { customType?: string }) => message.customType === "omps-result",
				) as { content?: string; details?: { directory?: string } };
				expect(result.content).toContain("Load-order child finished");
				const events = await readFile(join(result.details!.directory!, "events.jsonl"), "utf8");
				expect(events).toContain('"toolName":"memory"');
				expect(await capturedText(memoryStorePath(workspace.isolationEnv.HOME))).toContain("Load-order child fact");
			} finally {
				await parent.dispose();
			}
		},
	);
});
