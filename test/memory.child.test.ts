// Real OMMS child capability (task 5.3): a memory-mapped managed child keeps ordinary memory
// operations while web autostart and history backfill stay opted out, and the exact `memory`
// tool name remains enforced by the child guard.
import { describe, expect, it } from "vitest";
import { PREFLIGHT_COMMAND, READY_ENTRY, VIOLATION_ENTRY } from "../src/protocol.ts";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
import { capturedText, memoryAvailable, memoryStorePath, startMemoryChild } from "./fixtures/memory.ts";

const describeMemory = describe.skipIf(!PI_AVAILABLE || !memoryAvailable());

describeMemory("explicit real memory child capability", () => {
	it("runs manual memory operations with maintenance opted out", async () => {
		const fixture = await startMemoryChild();
		try {
			const before = fixture.model.requests.length;
			fixture.model.script = [
				{ tool: "memory", args: { mode: "add", content: "Child-local fact for the memory suite" } },
				{ tool: "memory", args: { mode: "search", query: "memory suite" } },
				{ text: "Child memory exercised" },
			];
			await fixture.send({ type: "prompt", message: "Record and find a child-local fact" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			const results = fixture.records.filter(
				(record) => record.type === "tool_execution_end" && record.toolName === "memory",
			);
			expect(results).toHaveLength(2);
			for (const result of results) expect(result.isError, JSON.stringify(result)).toBe(false);
			expect(JSON.stringify(results.at(-1)?.result)).toContain("Child-local fact");
			// Embeddings served by the fake provider; ordinary recall stays available.
			expect(fixture.model.embeddings.length).toBeGreaterThan(0);
			// Web autostart and history backfill stay off: no importer turns beyond the script.
			expect(fixture.model.requests.length).toBe(before + 3);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("blocks a real memory call when the extension is mapped without exact tool approval", async () => {
		const fixture = await startMemoryChild({ tools: ["read"] });
		try {
			fixture.model.script = [
				{ tool: "memory", args: { mode: "add", content: "Must not be stored" } },
				{ text: "Memory call refused" },
			];
			await fixture.send({ type: "prompt", message: "Try an unapproved memory call" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(
				fixture.records.some(
					(record) => record.entry?.customType === VIOLATION_ENTRY && record.entry.data.tool === "memory",
				),
			).toBe(true);
			// The guard refused before execution: nothing reached the disposable store.
			// Ordinary recall may still embed the prompt; that path stays available by design.
			const store = memoryStorePath(fixture.isolationEnv.HOME);
			expect((await capturedText(store)).includes("Must not be stored")).toBe(false);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("fails readiness when memory is approved but its real extension is missing", async () => {
		const fixture = await startMemoryChild({ extensions: [] });
		try {
			await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
			const ready = await fixture.waitFor((record) => record.entry?.customType === READY_ENTRY);
			expect(ready.entry.data).toMatchObject({
				ok: false,
				problems: expect.arrayContaining(['tool "memory" is not registered']),
			});
			expect(fixture.model.requests).toHaveLength(0);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});
});
