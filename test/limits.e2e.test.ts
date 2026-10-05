import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_AVAILABLE, PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";

const index = new URL("../index.ts", import.meta.url).pathname;
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
const waitFor = async (check: () => boolean | Promise<boolean>) => {
	for (let waited = 0; !(await check()); waited += 50) {
		if (waited > 20_000) throw new Error("real limit checkpoint timed out");
		await new Promise((done) => setTimeout(done, 50));
	}
};
async function saved(fixture: PiFixture, file: string) {
	const root = join(fixture.agentDir, "ompss", "runs");
	const paths = (await readdir(root, { recursive: true }).catch(() => [])).filter((path) => path.endsWith(`/${file}`));
	return Promise.all(
		paths.map(async (path) => ({ path, value: JSON.parse(await readFile(join(root, path), "utf8")) })),
	);
}

describe.skipIf(!PI_AVAILABLE)("real configured limit scenarios", () => {
	it.each([1, 4])("admits %i direct children and shuts them down with confirmed cleanup", async (capacity) => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", index],
			env: { OMPSS_PI_BIN: PI_BIN },
			seed: async ({ agentDir }) => {
				await writeFile(join(agentDir, "worker.md"), "CAPACITY-WORKER-MARKER");
				await writeFile(
					join(agentDir, "om-pi-subagents.yaml"),
					`version: 1\n${capacity === 1 ? "" : `limits:\n  maxConcurrentRuns: ${capacity}\n  maxDepth: 3\n`}agents:\n  worker:\n    persona: ./worker.md\n    tools: [read]\n    thinking: off\n`,
				);
			},
		});
		try {
			fixture.model.script = (body) => {
				if (JSON.stringify(body.messages).includes("CAPACITY-WORKER-MARKER")) return { hang: true };
				const launches = body.messages.filter((message: { role: string }) => message.role === "tool").length;
				return launches < 5
					? { tool: "ompss", args: { action: "run", agent: "worker", task: `Independent task ${launches}` } }
					: { text: "Capacity checked" };
			};
			await fixture.send({ type: "prompt", message: "Try five launches" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			const results = fixture.records.filter(
				(record) => record.type === "tool_execution_end" && record.toolName === "ompss",
			);
			expect(results).toHaveLength(5);
			expect(results.filter((record) => !record.isError)).toHaveLength(capacity);
			for (const rejected of results.filter((record) => record.isError))
				expect(JSON.stringify(rejected.result)).toContain(`limits.maxConcurrentRuns: ${capacity}`);
			await waitFor(
				async () =>
					(await saved(fixture, "status.json")).filter((entry) => entry.value.state === "running").length === capacity,
			);
			const before = await saved(fixture, "status.json");
			expect(before).toHaveLength(capacity);
			expect(before.every((entry) => alive(entry.value.pid))).toBe(true);
			expect(await fixture.exit()).toBe(0);
			const after = await saved(fixture, "status.json");
			expect(after.every((entry) => entry.value.state === "cancelled")).toBe(true);
			expect(before.some((entry) => alive(entry.value.pid))).toBe(false);
		} finally {
			await fixture.dispose();
		}
	});

	it("runs through depth five and rejects a sixth generation before spawning", async () => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", index],
			env: { OMPSS_PI_BIN: PI_BIN },
			seed: async ({ agentDir }) => {
				await writeFile(join(agentDir, "worker.md"), "DEEP-WORKER-MARKER");
				await writeFile(
					join(agentDir, "om-pi-subagents.yaml"),
					"version: 1\nlimits:\n  maxConcurrentRuns: 4\n  maxDepth: 5\nagents:\n  worker:\n    persona: ./worker.md\n    tools: [ompss]\n    thinking: off\n",
				);
			},
		});
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const level = Number(/LEVEL:(\d+)/.exec(messages)?.[1] ?? 0);
				const hasTool = body.messages.some((message: { role: string }) => message.role === "tool");
				if (!hasTool) return { tool: "ompss", args: { action: "run", agent: "worker", task: `LEVEL:${level + 1}` } };
				if (level === 5) return { text: "Depth five refused the sixth generation" };
				return {
					text: messages.includes("OMPSS run")
						? `Level ${level} used descendant results`
						: `Level ${level} early answer`,
				};
			};
			await fixture.send({ type: "prompt", message: "LEVEL:0" });
			await fixture.waitFor(
				(record) =>
					record.message?.role === "assistant" &&
					record.message.content?.[0]?.text === "Level 0 used descendant results",
			);
			const configurations = await saved(fixture, "config.json");
			expect(configurations).toHaveLength(5);
			expect(configurations.map((entry) => entry.value.nesting.depth).sort()).toEqual([1, 2, 3, 4, 5]);
			const statuses = await saved(fixture, "status.json");
			expect(statuses.every((entry) => entry.value.state === "completed")).toBe(true);
			expect(statuses.some((entry) => alive(entry.value.pid))).toBe(false);
			const deepest = configurations.find((entry) => entry.value.nesting.depth === 5)!;
			const log = await readFile(
				join(fixture.agentDir, "ompss", "runs", deepest.path.replace("config.json", "events.jsonl")),
				"utf8",
			);
			expect(log).toMatch(/current depth 5, attempted depth 6, limits.maxDepth 5/);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
