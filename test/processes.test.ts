// The descendant tracker against real processes, including one in its own process group.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { listDescendants, OwnedProcesses } from "../processes.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const undo of cleanups.splice(0)) undo();
});

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A parent process that starts a detached grandchild: a new process group, like Pi's MCP servers. */
async function startTree(
	options: { ignoreTerm?: boolean } = {},
): Promise<{ parent: ChildProcess; grandchild: number }> {
	// Start `sleep` without a shell. Linux `sh` keeps itself as a second process; macOS `sh` replaces itself.
	const [command, args] = options.ignoreTerm
		? ["sh", ["-c", "trap '' TERM; while true; do sleep 1; done"]]
		: ["sleep", ["300"]];
	const script = `const { spawn } = require("node:child_process");
    const child = spawn(${JSON.stringify(command)}, ${JSON.stringify(args)}, { detached: true, stdio: "ignore" });
    console.log(child.pid); setInterval(() => {}, 1000);`;
	const parent = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"] });
	const grandchild = await new Promise<number>((resolve) =>
		parent.stdout!.once("data", (data) => resolve(Number(data.toString().trim()))),
	);
	cleanups.push(
		() => void (alive(grandchild) && process.kill(grandchild, "SIGKILL")),
		() => void (parent.exitCode === null && parent.kill("SIGKILL")),
	);
	await sleep(150); // let the grandchild start
	return { parent, grandchild };
}

describe("listDescendants", () => {
	it("follows the tree to grandchildren", async () => {
		const script = `const { spawn } = require("node:child_process");
      spawn("sh", ["-c", "sleep 300 & wait"], { stdio: "ignore" }); console.log("started"); setInterval(() => {}, 1000);`;
		const parent = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"] });
		cleanups.push(() => void (parent.exitCode === null && parent.kill("SIGKILL")));
		await new Promise((resolve) => parent.stdout!.once("data", resolve));
		await sleep(200);

		const found = await listDescendants(parent.pid!);
		expect(found.length).toBeGreaterThanOrEqual(2); // the shell and its sleep
		cleanups.push(() => found.forEach((proc) => alive(proc.pid) && process.kill(proc.pid, "SIGKILL")));
	});

	it("finds a descendant that sits in another process group", async () => {
		const { parent, grandchild } = await startTree();
		const pids = (await listDescendants(parent.pid!)).map((proc) => proc.pid);
		expect(pids).toContain(grandchild);
	});

	it("finds nothing once the parent is dead, which is why descendants are recorded beforehand", async () => {
		const { parent, grandchild } = await startTree();
		const tracker = new OwnedProcesses(parent.pid!);
		await tracker.sample();
		parent.kill("SIGKILL");
		await new Promise((done) => parent.once("close", done));

		expect(await listDescendants(parent.pid!)).toEqual([]);
		expect((await tracker.survivors()).map((proc) => proc.pid)).toEqual([grandchild]);
	});
});

describe("OwnedProcesses", () => {
	it("stops a recorded survivor and confirms it is gone", async () => {
		const { parent, grandchild } = await startTree();
		const tracker = new OwnedProcesses(parent.pid!);
		await tracker.sample();
		parent.kill("SIGKILL");

		expect(await tracker.reap(500)).toBeUndefined();
		expect(alive(grandchild)).toBe(false);
		expect(await tracker.survivors()).toEqual([]);
	});

	it("sends SIGTERM first, so a survivor can run its own clean-up", async () => {
		const marker = join(tmpdir(), `ompss-term-${process.pid}-${Date.now()}`);
		const script = `const { spawn } = require("node:child_process");
      const c = spawn("sh", ["-c", "trap 'touch ${marker}; exit 0' TERM; sleep 300 & wait"], { detached: true, stdio: "ignore" });
      console.log(c.pid); setInterval(() => {}, 1000);`;
		const parent = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "pipe", "ignore"] });
		const grandchild = await new Promise<number>((resolve) =>
			parent.stdout!.once("data", (data) => resolve(Number(data.toString().trim()))),
		);
		cleanups.push(
			() => void (parent.exitCode === null && parent.kill("SIGKILL")),
			() => void (alive(grandchild) && process.kill(grandchild, "SIGKILL")),
		);
		await sleep(300);
		const tracker = new OwnedProcesses(parent.pid!);
		await tracker.sample();
		parent.kill("SIGKILL");

		expect(await tracker.reap(1000)).toBeUndefined();
		expect(existsSync(marker)).toBe(true);
		await sleep(0);
	});

	it("escalates to SIGKILL for a survivor that ignores SIGTERM", async () => {
		const { parent, grandchild } = await startTree({ ignoreTerm: true });
		const tracker = new OwnedProcesses(parent.pid!);
		await tracker.sample();
		parent.kill("SIGKILL");

		expect(await tracker.reap(300)).toBeUndefined();
		expect(alive(grandchild)).toBe(false);
	});

	it("never touches a process that has reused a recorded pid", async () => {
		const unrelated = spawn("sleep", ["300"], { stdio: "ignore" });
		cleanups.push(() => void unrelated.kill("SIGKILL"));
		// The record claims an old start time for this pid, as if it belonged to a long-dead descendant.
		const tracker = new OwnedProcesses(1, async () => [{ pid: unrelated.pid!, started: "Mon Jan  1 00:00:00 2001" }]);
		await tracker.sample();

		expect(await tracker.survivors()).toEqual([]);
		expect(await tracker.reap(200)).toBeUndefined();
		expect(alive(unrelated.pid!)).toBe(true);
	});

	it("reports the survivors when they cannot be stopped", async () => {
		const { parent, grandchild } = await startTree();
		const tracker = new OwnedProcesses(parent.pid!);
		await tracker.sample();
		parent.kill("SIGKILL");
		const realKill = process.kill.bind(process);
		// Signal 0 still probes; every real signal is swallowed, so the survivor cannot be stopped.
		const spy = vi
			.spyOn(process, "kill")
			.mockImplementation(((pid: number, signal?: string | number) =>
				signal === 0 ? realKill(pid, 0) : true) as typeof process.kill);
		try {
			expect(await tracker.reap(100)).toBe(`process ${grandchild} of the child still runs`);
		} finally {
			spy.mockRestore();
		}
	});

	it("reports an error when the process tree cannot be inspected", async () => {
		const tracker = new OwnedProcesses(1, async () =>
			Promise.reject(new Error("cannot inspect the process tree: ps failed")),
		);
		await expect(tracker.sample()).rejects.toThrow(/cannot inspect the process tree/);
	});

	it("samples on a timer until told to stop", async () => {
		const { parent, grandchild } = await startTree();
		const tracker = new OwnedProcesses(parent.pid!);
		tracker.watch(50);
		await sleep(300);
		tracker.unwatch();
		parent.kill("SIGKILL");
		expect((await tracker.survivors()).map((proc) => proc.pid)).toEqual([grandchild]);
	});
});
