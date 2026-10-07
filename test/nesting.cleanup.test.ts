import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listDescendants, OwnedProcesses, type Proc } from "../src/processes.ts";
import { groupAlive, stopGroup } from "../src/runner.ts";
import { PI_AVAILABLE, PI_BIN } from "./fixtures/pi-rpc.ts";
import { supervisedHarness, type Supervised } from "./fixtures/supervised.ts";

const harness = supervisedHarness();
const survivors = new Set<number>();
afterEach(async () => {
	await harness.cleanup();
	for (const pid of survivors) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Already gone.
		}
	}
	survivors.clear();
});
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
const waitFor = async (test: () => boolean | Promise<boolean>) => {
	for (let waited = 0; !(await test()); waited += 50) {
		if (waited > 20_000) throw new Error("nested cleanup checkpoint timed out");
		await new Promise((done) => setTimeout(done, 50));
	}
};

async function nested(faultyPs = false, holdLeaf = false): Promise<Supervised> {
	const env: NodeJS.ProcessEnv = { ...process.env };
	const run = await harness.setup({
		deps: { env },
		tools: ["omps"],
		limits: { maxConcurrentRuns: 4, maxDepth: 3 },
		seed: async ({ agentDir }) => {
			await writeFile(join(agentDir, "middle.md"), "MIDDLE-PERSONA-MARKER");
			await writeFile(join(agentDir, "leaf.md"), "LEAF-PERSONA-MARKER");
			await writeFile(
				join(agentDir, "om-pi-subagents.yaml"),
				`version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
agents:
  middle:
    persona: ./middle.md
    tools: [omps]
    thinking: off
  leaf:
    persona: ./leaf.md
    tools: [mcp__fixture__lookup]
    thinking: off
`,
			);
		},
	});
	Object.assign(env, run.workspace.isolationEnv, {
		OMPS_REGISTRY: join(run.workspace.agentDir, "om-pi-subagents.yaml"),
	});
	if (faultyPs) {
		const bin = join(run.workspace.root, "bin");
		await mkdir(bin);
		// Only the depth-two runtime loses process inspection. The outer supervisor uses real ps.
		const ps = execFileSync("which", ["ps"], { encoding: "utf8" }).trim();
		const script = join(bin, "ps");
		await writeFile(
			script,
			`#!/bin/sh\ncase "$OMPS_POLICY" in *'"depth":2'*) echo 'synthetic ps failure' >&2; exit 2;; esac\nexec ${JSON.stringify(ps)} "$@"\n`,
		);
		await chmod(script, 0o755);
		// A fixture wrapper supplies PATH to the managed child without changing the test process's PATH.
		const launcher = join(bin, "pi");
		await writeFile(
			launcher,
			`#!/bin/sh\nexport PATH=${JSON.stringify(bin)}:"$PATH"\nexec ${JSON.stringify(PI_BIN)} "$@"\n`,
		);
		await chmod(launcher, 0o755);
		// Select the fixture explicitly, so an inherited CI override cannot bypass fault injection.
		env.OMPS_PI_BIN = launcher;
	}
	run.workspace.model.script = (body) => {
		const messages = JSON.stringify(body.messages);
		if (messages.includes("SIBLING-TASK")) return { hang: true };
		if (messages.includes("LEAF-PERSONA-MARKER")) return faultyPs && !holdLeaf ? { text: "Leaf done" } : { hang: true };
		if (messages.includes("MIDDLE-PERSONA-MARKER")) {
			return body.messages.some((message: { role: string }) => message.role === "tool")
				? { text: "Middle awaiting results" }
				: { tool: "omps", args: { action: "run", agent: "leaf", task: "LEAF-TASK" } };
		}
		return body.messages.some((message: { role: string }) => message.role === "tool")
			? { text: "Root awaiting results" }
			: { tool: "omps", args: { action: "run", agent: "middle", task: "MIDDLE-TASK" } };
	};
	return run;
}

async function rememberTree(run: Supervised, runId: string): Promise<Proc[]> {
	await waitFor(async () => (await run.mcpPid()) !== undefined);
	const found = await listDescendants(run.childFor(runId)!.pid!);
	expect(found.length).toBeGreaterThanOrEqual(3);
	for (const proc of found) survivors.add(proc.pid);
	return found;
}

describe("cleanup when process inspection fails", () => {
	it("still reaps recorded descendants after the last tree sample fails", async () => {
		const parent = spawn(
			process.execPath,
			[
				"-e",
				`
			const { spawn } = require("node:child_process");
			const child = spawn("sleep", ["300"], { detached: true, stdio: "ignore" });
			console.log(child.pid); setInterval(() => {}, 1000);
		`,
			],
			{ detached: true, stdio: ["pipe", "pipe", "ignore"] },
		);
		const exited = new Promise((done) => parent.on("close", done));
		const descendant = await new Promise<number>((done) =>
			parent.stdout!.once("data", (data) => done(Number(data.toString().trim()))),
		);
		survivors.add(parent.pid!);
		survivors.add(descendant);
		let samples = 0;
		const owned = new OwnedProcesses(parent.pid!, async (pid) => {
			if (++samples > 1) throw new Error("synthetic ps failure");
			return listDescendants(pid);
		});
		await owned.sample();
		expect(await stopGroup(parent, exited, 500, owned)).toContain("synthetic ps failure");
		expect(alive(descendant)).toBe(false);
	});
});

describe.skipIf(!PI_AVAILABLE)("owned nested subtree cleanup", () => {
	it("cancels a child, grandchild, great-grandchild and separate MCP group while its sibling stays active", async () => {
		const run = await nested();
		const tree = run.start("TREE-TASK");
		const sibling = run.start("SIBLING-TASK");
		const owned = await rememberTree(run, tree.id);
		expect(owned.map((proc) => proc.pid)).toContain(await run.mcpPid());
		await waitFor(() => run.manager.status(run.owner, sibling.id).state === "running");
		run.manager.cancel(run.owner, tree.id);
		expect((await run.done(tree.id)).state).toBe("cancelled");
		expect(groupAlive(run.childFor(tree.id)!.pid!)).toBe(false);
		expect(owned.filter((proc) => alive(proc.pid))).toEqual([]);
		expect(run.manager.status(run.owner, sibling.id).state).toBe("running");
		expect(alive(run.childFor(sibling.id)!.pid!)).toBe(true);
		run.manager.cancel(run.owner, sibling.id);
		await run.done(sibling.id);
	});

	it("reaps the recorded nested tree after the direct child exits abruptly", async () => {
		const run = await nested();
		const tree = run.start();
		const owned = await rememberTree(run, tree.id);
		// Let the outer supervisor's watcher record the live tree before its root disappears.
		await new Promise((done) => setTimeout(done, 1200));
		run.childFor(tree.id)!.kill("SIGKILL");
		expect((await run.done(tree.id)).state).toBe("failed");
		expect(owned.filter((proc) => alive(proc.pid))).toEqual([]);
	});

	it("propagates a depth-two cleanup failure to the root despite successful outer process cleanup", async () => {
		const run = await nested(true);
		const tree = run.start();
		const final = await run.done(tree.id);
		expect(final).toMatchObject({ state: "failed", cleanupFailed: true });
		expect(final.error).toMatch(/cleanup|process tree/);
		expect(() => run.start()).toThrow(/reload/i);
	});

	it("propagates descendant cleanup uncertainty during cancellation", async () => {
		const run = await nested(true, true);
		const tree = run.start();
		await rememberTree(run, tree.id);
		run.manager.cancel(run.owner, tree.id);
		expect(await run.done(tree.id)).toMatchObject({ state: "failed", cleanupFailed: true });
		expect(() => run.start()).toThrow(/reload/i);
	});

	it.each(["startup", "provider", "cancellation", "task acceptance"])(
		"keeps cleanup uncertainty after %s",
		async (phase) => {
			const extensions: string[] = [];
			const run = await harness.setup({
				script: () => (phase === "cancellation" ? [{ hang: true }] : [{ status: 400 }]),
				extensions,
				seed: async ({ agentDir }) => {
					if (phase !== "task acceptance") return;
					const extension = join(agentDir, "reject-task.ts");
					await writeFile(extension, `export default (pi) => pi.on("input", () => ({ action: "handled" }));`);
					extensions.push(extension);
				},
				deps: {
					...(phase === "startup" ? { guardPath: "/nonexistent/child-guard.ts" } : {}),
					listProcesses: async () => {
						throw new Error("synthetic ps failure");
					},
				},
			});
			const tree = run.start();
			if (phase === "cancellation") {
				await waitFor(() => run.manager.status(run.owner, tree.id).state === "running");
				run.manager.cancel(run.owner, tree.id);
			}
			expect(await run.done(tree.id)).toMatchObject({ state: "failed", cleanupFailed: true });
			expect(() => run.start()).toThrow(/reload/i);
			expect(groupAlive(run.pids[0])).toBe(false);
		},
	);
});
