// Process cleanup against real processes: idempotence, descendants, broken pipes and abrupt parent exit.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { OwnedProcesses } from "../src/processes.ts";
import { groupAlive, stopGroup } from "../src/runner.ts";
import { PI_AVAILABLE, PI_BIN, createWorkspace } from "./fixtures/pi-rpc.ts";
import { supervisedHarness, type Supervised } from "./fixtures/supervised.ts";

const harness = supervisedHarness();
const extra: Array<() => Promise<void> | void> = [];
afterEach(async () => {
	for (const undo of extra.splice(0)) await undo();
	await harness.cleanup();
});

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
};
const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 20_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

describe("stopGroup", () => {
	/** A detached process group holding a shell and a descendant sleep. */
	const startGroup = () => {
		const child = spawn("sh", ["-c", "sleep 300 & sleep 300"], { detached: true, stdio: ["pipe", "ignore", "ignore"] });
		const exited = new Promise((done) => child.on("close", done));
		extra.push(() => void (child.pid && groupAlive(child.pid) && process.kill(-child.pid, "SIGKILL")));
		return { child, exited };
	};

	it("stops the direct child and its descendants, and confirms they are gone", async () => {
		const { child, exited } = startGroup();
		await new Promise((done) => setTimeout(done, 200));
		expect(groupAlive(child.pid!)).toBe(true);
		expect(await stopGroup(child, exited, 500)).toBeUndefined();
		expect(groupAlive(child.pid!)).toBe(false);
	});

	it("is idempotent: repeated and concurrent calls agree and cause no error", async () => {
		const { child, exited } = startGroup();
		await new Promise((done) => setTimeout(done, 200));
		const results = await Promise.all([
			stopGroup(child, exited, 500),
			stopGroup(child, exited, 500),
			stopGroup(child, exited, 500),
		]);
		expect(results).toEqual([undefined, undefined, undefined]);
		expect(await stopGroup(child, exited, 500)).toBeUndefined();
	});

	it("also stops a descendant that sits in another process group", async () => {
		// The parent leads its own group and starts a grandchild in a second group, as Pi does for MCP servers.
		const script = `const { spawn } = require("node:child_process");
      const child = spawn("sleep", ["300"], { detached: true, stdio: "ignore" }); console.log(child.pid); setInterval(() => {}, 1000);`;
		const parent = spawn(process.execPath, ["-e", script], { detached: true, stdio: ["pipe", "pipe", "ignore"] });
		const exited = new Promise((done) => parent.on("close", done));
		const grandchild = await new Promise<number>((resolve) =>
			parent.stdout!.once("data", (data) => resolve(Number(data.toString().trim()))),
		);
		extra.push(
			() => void (alive(grandchild) && process.kill(grandchild, "SIGKILL")),
			() => void (groupAlive(parent.pid!) && process.kill(-parent.pid!, "SIGKILL")),
		);

		// The parent dies without taking its grandchild along. Only the tracker can find and stop it.
		expect(alive(grandchild)).toBe(true);
		expect(await stopGroup(parent, exited, 500, new OwnedProcesses(parent.pid!))).toBeUndefined();
		expect(alive(grandchild)).toBe(false);
	});

	it("sends SIGTERM to the group first, so the child can run its own clean-up", async () => {
		const marker = join(tmpdir(), `omps-group-term-${process.pid}-${Date.now()}`);
		const child = spawn("sh", ["-c", `trap 'touch ${marker}; exit 0' TERM; sleep 300 & wait`], {
			detached: true,
			stdio: ["pipe", "ignore", "ignore"],
		});
		const exited = new Promise((done) => child.on("close", done));
		extra.push(
			() => void (groupAlive(child.pid!) && process.kill(-child.pid!, "SIGKILL")),
			() => void rm(marker, { force: true }),
		);
		await new Promise((done) => setTimeout(done, 300));
		expect(await stopGroup(child, exited, 1500)).toBeUndefined();
		expect(existsSync(marker)).toBe(true);
	});

	it("escalates to SIGKILL for a group that ignores SIGTERM", async () => {
		const child = spawn("sh", ["-c", "trap '' TERM; sleep 300 & while true; do sleep 1; done"], {
			detached: true,
			stdio: ["pipe", "ignore", "ignore"],
		});
		const exited = new Promise((done) => child.on("close", done));
		extra.push(() => void (groupAlive(child.pid!) && process.kill(-child.pid!, "SIGKILL")));
		await new Promise((done) => setTimeout(done, 300));
		expect(await stopGroup(child, exited, 300)).toBeUndefined();
		expect(groupAlive(child.pid!)).toBe(false);
	});
});

describe.skipIf(!PI_AVAILABLE)("descendants of a real Pi child", () => {
	const TOOLS = ["read", "mcp__fixture__lookup"];

	/** Start a run whose child has a live MCP server, and wait until that server runs. */
	async function runWithMcp(
		options: Parameters<typeof harness.setup>[0] = {},
	): Promise<{ run: Supervised; runId: string; mcpPid: number }> {
		const run = await harness.setup({ tools: TOOLS, script: () => [{ hang: true }], ...options });
		const started = run.start();
		await waitFor(async () => (await run.mcpPid()) !== undefined);
		const mcpPid = (await run.mcpPid())!;
		expect(alive(mcpPid)).toBe(true);
		return { run, runId: started.id, mcpPid };
	}

	const expectAllGone = (run: Supervised, mcpPid: number) => {
		expect(groupAlive(run.pids[0])).toBe(false);
		expect(alive(run.pids[0])).toBe(false);
		expect(alive(mcpPid)).toBe(false);
	};

	it("are gone after a normal completion", async () => {
		const run = await harness.setup({ tools: TOOLS, script: () => [{ text: "done" }] });
		const started = run.start();
		await waitFor(async () => (await run.mcpPid()) !== undefined);
		const mcpPid = (await run.mcpPid())!;
		expect((await run.done(started.id)).state).toBe("completed");
		expectAllGone(run, mcpPid);
	});

	it("are gone after a cancellation", async () => {
		const { run, runId, mcpPid } = await runWithMcp();
		run.manager.cancel(run.owner, runId);
		expect((await run.done(runId)).state).toBe("cancelled");
		expectAllGone(run, mcpPid);
	});

	it("are gone after the total deadline", async () => {
		const { run, runId, mcpPid } = await runWithMcp({ deps: { totalDeadlineMs: 5000 } });
		expect((await run.done(runId)).state).toBe("failed");
		expectAllGone(run, mcpPid);
	});

	it("are gone after the manager shuts the session down (reload, replacement or exit)", async () => {
		const { run, runId, mcpPid } = await runWithMcp();
		await run.manager.cancelAll(run.owner);
		expect(run.manager.status(run.owner, runId).state).toBe("cancelled");
		expectAllGone(run, mcpPid);
	});
});

describe.skipIf(!PI_AVAILABLE)("cleanup that cannot be confirmed", () => {
	it("fails the run, still stops the child, and blocks the next launch with an actionable error", async () => {
		const run = await harness.setup({
			script: () => [{ text: "done" }],
			deps: { listProcesses: async () => Promise.reject(new Error("cannot inspect the process tree: ps failed")) },
		});
		const started = run.start();
		const final = await run.done(started.id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/cleanup failed: cannot inspect the process tree/);
		expect(groupAlive(run.pids[0])).toBe(false); // the child was still stopped, as far as it could be
		expect(() => run.start()).toThrow(
			/cannot inspect the process tree.*reload|reload.*cannot inspect the process tree/is,
		);
		expect(run.workspace.model.requests).toHaveLength(1);
	});

	it("does the same after a cancellation", async () => {
		const run = await harness.setup({
			script: () => [{ hang: true }],
			deps: { listProcesses: async () => Promise.reject(new Error("cannot inspect the process tree: ps failed")) },
		});
		const started = run.start();
		await waitFor(() => run.manager.status(run.owner, started.id).state === "running");
		run.manager.cancel(run.owner, started.id);
		const final = await run.done(started.id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/cleanup failed/);
		expect(() => run.start()).toThrow(/reload/i);
	});
});

describe.skipIf(!PI_AVAILABLE)("broken pipes", () => {
	it("fails the run and stops the child when its output pipe is lost", async () => {
		const run = await harness.setup({ script: () => [{ hang: true }] });
		const started = run.start();
		await waitFor(() => run.manager.status(run.owner, started.id).state === "running");
		run.children[0].stdout!.destroy();

		const final = await run.done(started.id);
		expect(final.state).toBe("failed");
		// macOS keeps the child alive, so the lost pipe is reported. On Linux the child dies on the broken
		// pipe within the grace period, so the run reports the early exit instead. Both fail the run.
		expect(final.error).toMatch(/child output closed|child exited without a settled result/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("fails the run and stops the child when its input pipe breaks", async () => {
		const run = await harness.setup({ script: () => [{ hang: true }] });
		const started = run.start();
		await waitFor(() => run.manager.status(run.owner, started.id).state === "running");
		run.children[0].stdin!.destroy(new Error("broken pipe"));

		const final = await run.done(started.id);
		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/child input closed/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});
});

describe.skipIf(!PI_AVAILABLE)("abrupt parent exit", () => {
	const PARENT = new URL("./fixtures/parent-process.ts", import.meta.url).pathname;

	/** Run a parent that launches a child, kill it without warning, and expect the child tree to vanish. */
	async function killParent(busy: boolean): Promise<void> {
		const workspace = await createWorkspace();
		const scratch = await mkdtemp(join(tmpdir(), "omps-parent-"));
		extra.push(
			() => rm(scratch, { recursive: true, force: true }),
			() => workspace.dispose(),
		);
		await writeFile(join(scratch, "persona.md"), "Persona.");
		if (busy) workspace.model.script = [{ hang: true }];

		const config = JSON.stringify({
			piBin: PI_BIN,
			guardPath: new URL("../src/child-guard.ts", import.meta.url).pathname,
			cwd: workspace.cwd,
			personaFile: join(scratch, "persona.md"),
			tools: ["read", "mcp__fixture__lookup"],
			env: { ...process.env, ...workspace.isolationEnv },
			busy,
		});
		const parent = spawn("bun", ["run", PARENT, config], { stdio: ["ignore", "pipe", "inherit"] });
		extra.push(() => void (parent.exitCode === null && parent.kill("SIGKILL")));
		const childPid = await new Promise<number>((resolve, reject) => {
			parent.stdout.once("data", (data: Buffer) => resolve(Number(/READY (\d+)/.exec(data.toString())![1])));
			parent.once("close", () => reject(new Error("parent exited early")));
		});
		await waitFor(
			async () =>
				(await import("node:fs/promises").then((fs) => fs.readFile(workspace.mcpPidFile, "utf8").catch(() => ""))) !==
				"",
		);
		const mcpPid = Number(await import("node:fs/promises").then((fs) => fs.readFile(workspace.mcpPidFile, "utf8")));
		if (busy) await waitFor(() => workspace.model.requests.length === 1);
		expect(alive(childPid) && alive(mcpPid)).toBe(true);
		extra.push(() => void (groupAlive(childPid) && process.kill(-childPid, "SIGKILL")));

		parent.kill("SIGKILL");
		await waitFor(() => !alive(childPid) && !alive(mcpPid), 20_000);
	}

	it("takes an idle child and its MCP server with it", () => killParent(false));
	it("takes a child with a model request in flight, and its MCP server, with it", () => killParent(true));
});
