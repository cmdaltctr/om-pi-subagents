// Real OMMS sibling coverage (task 5.2): the published Pi entry, a disposable configuration and
// store, and fake local providers only. No real credentials, production stores or provider
// requests. When the inspected sibling is absent, these suites skip as a recorded gap.
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createWorkspace, startPi, type Workspace } from "./fixtures/pi-rpc.ts";
import {
	capturedText,
	memoryAvailable,
	memoryStorePath,
	MEMORY_VERSION,
	resolveMemoryExtension,
	seedMemoryConfig,
} from "./fixtures/memory.ts";

const describeMemory = describe.skipIf(!memoryAvailable());
const ADDED_FACT = "Fixture fact: OMPS tests keep every memory store disposable";

/** One real Pi with only the OMMS entry loaded, sharing a caller-owned workspace. */
async function startMemorySession(workspace: Workspace, autoCapture = false) {
	await seedMemoryConfig(workspace.isolationEnv.HOME, workspace.model, { autoCapture });
	return startPi({
		mcp: false,
		workspace,
		args: ["-e", resolveMemoryExtension()!],
	});
}

const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 30_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

describeMemory("real OMMS sibling on Pi", () => {
	it("adds and searches memories through the published entry with fake providers", async () => {
		const workspace = await createWorkspace({ mcp: false });
		try {
			const fixture = await startMemorySession(workspace);
			fixture.model.script = (body) => {
				const tools = body.messages.filter((message: { role: string }) => message.role === "tool").length;
				if (tools === 0) return { tool: "memory", args: { mode: "add", content: ADDED_FACT } };
				if (tools === 1) return { tool: "memory", args: { mode: "search", query: "disposable store" } };
				return { text: "memory exercised" };
			};
			await fixture.send({ type: "prompt", message: "record a fixture fact and find it" });
			const calls = await Promise.all([
				fixture.waitFor((record) => record.type === "tool_execution_end" && record.toolName === "memory"),
				fixture.waitFor(
					(record) =>
						record.type === "tool_execution_end" &&
						record.toolName === "memory" &&
						JSON.stringify(record.result?.content ?? "").includes(ADDED_FACT),
				),
				fixture.waitFor((record) => record.type === "agent_settled"),
			]);
			expect(calls.every((record) => record.isError !== true)).toBe(true);
			// Embeddings came from the fake local provider, never a real one.
			expect(fixture.model.embeddings.length).toBeGreaterThan(0);
			expect(JSON.stringify(fixture.model.embeddings)).not.toMatch(/sk-|api\.openai|apikey/i);
			await fixture.dispose();
		} finally {
			await workspace.dispose();
		}
	});

	it("recalls a previous session's memory in a fresh same-project process", async () => {
		const workspace = await createWorkspace({ mcp: false });
		try {
			const first = await startMemorySession(workspace);
			first.model.script = [{ tool: "memory", args: { mode: "add", content: ADDED_FACT } }, { text: "recorded" }];
			await first.send({ type: "prompt", message: "record the fact" });
			await first.waitFor((record) => record.type === "agent_settled");
			await first.dispose();

			const second = await startMemorySession(workspace);
			// The fake model server is shared: only requests after this point belong to session two.
			const firstOwnRequest = workspace.model.requests.length;
			second.model.script = [{ text: "recalled" }];
			await second.send({ type: "prompt", message: "what do the tests keep disposable" });
			await second.waitFor((record) => record.type === "agent_settled");
			// The recall section reaches the model as system-prompt context, never a user message.
			const own = workspace.model.requests.slice(firstOwnRequest) as Array<{
				messages?: Array<{ role?: string; content?: unknown }>;
			}>;
			expect(own.length).toBeGreaterThan(0);
			const system = own.at(-1)?.messages?.find((message) => message.role === "system");
			expect(JSON.stringify(system?.content ?? "")).toContain(ADDED_FACT);
			const user = own.at(-1)?.messages?.find((message) => message.role === "user");
			expect(JSON.stringify(user?.content ?? "")).not.toContain(ADDED_FACT);
			await second.dispose();
		} finally {
			await workspace.dispose();
		}
	});

	it("captures settled work when auto-capture is configured", async () => {
		const workspace = await createWorkspace({ mcp: false });
		try {
			const configPath = await seedMemoryConfig(workspace.isolationEnv.HOME, workspace.model, {
				autoCapture: true,
			});
			const fixture = await startPi({ mcp: false, workspace, args: ["-e", resolveMemoryExtension()!] });
			fixture.model.script = (body) => {
				// The capture bridge calls the host model with its recorder system prompt.
				const system = body.messages?.find((message: { role?: string }) => message.role === "system");
				if (JSON.stringify(system?.content ?? "").includes("memory recorder"))
					return {
						text: '{"summary":"## Request\\nDisposable capture\\n## Outcome\\nCAPTURE-SUMMARY-MARKER","type":"feature","tags":["testing","capture"]}',
					};
				const user = body.messages?.findLast((message: { role?: string }) => message.role === "user");
				if (JSON.stringify(user?.content ?? "").includes("list captured memories"))
					return { tool: "memory", args: { mode: "list" } };
				return { text: "Important result: capture me" };
			};
			await fixture.send({ type: "prompt", message: "settle memorable work" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			// Auto-capture runs after settle: wait until the disposable store actually holds the summary.
			const store = memoryStorePath(workspace.isolationEnv.HOME);
			try {
				await waitFor(async () => (await capturedText(store)).includes("CAPTURE-SUMMARY-MARKER"));
			} catch (error) {
				const notes = fixture.records
					.filter((record) => record.type === "extension_ui_request")
					.map((record) => record.message ?? record.statusText);
				throw new Error(`${(error as Error).message}; omms events: ${JSON.stringify(notes).slice(0, 600)}`, {
					cause: error,
				});
			}
			await fixture.send({ type: "prompt", message: "list captured memories" });
			const listed = await fixture.waitFor(
				(record) => record.type === "tool_execution_end" && record.toolName === "memory",
			);
			const text = JSON.stringify(listed.result?.content ?? "");
			expect(text).toContain("CAPTURE-SUMMARY-MARKER");
			// The capture path used the configured fake provider and the disposable store.
			expect(fixture.model.embeddings.length).toBeGreaterThan(0);
			// The capture path used the configured fake provider and the disposable store.
			expect(await readFile(configPath, "utf8")).toContain(workspace.model.baseUrl);
			await fixture.dispose();
		} finally {
			await workspace.dispose();
		}
	});

	it(`records the inspected sibling version ${MEMORY_VERSION} for compatibility evidence`, () => {
		// The resolver validated the exact published version before returning the entry.
		expect(resolveMemoryExtension()).toMatch(/om-memory-system|OMPS_OMMS_ENTRY/);
	});
});
