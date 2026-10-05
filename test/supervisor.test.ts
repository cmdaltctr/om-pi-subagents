// The supervisor against the real Pi 0.99.1 CLI: lifecycle, deadlines, cancellation and cleanup.
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { groupAlive } from "../runner.ts";
import { supervisedHarness } from "./fixtures/supervised.ts";

const THROWING = new URL("./fixtures/throwing-handler-extension.ts", import.meta.url).pathname;
const EXIT_ON_START = new URL("./fixtures/exit-on-start-extension.ts", import.meta.url).pathname;

const harness = supervisedHarness();
afterEach(() => harness.cleanup());

const waitFor = async (condition: () => boolean, ms = 20_000) => {
	for (let waited = 0; !condition(); waited += 25) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 25));
	}
};

describe("a normal run", () => {
	it("completes, saves the final answer, and leaves no process behind", async () => {
		const run = await harness.setup({ script: () => [{ text: "the final answer" }] });
		const started = run.start();
		const final = await run.done(started.id);

		expect(final).toMatchObject({ state: "completed" });
		expect(run.persisted).toEqual([{ kind: "final", text: "the final answer" }]);
		expect(run.states[0]).toBe("starting");
		expect(run.states).toContain("running");
		expect(run.states.at(-1)).toBe("completed");
		expect(groupAlive(run.pids[0])).toBe(false);
		expect(run.workspace.model.requests).toHaveLength(1);
	});
});

describe("cancellation", () => {
	it("stops a running child, ends cancelled, and ignores repeated cancels", async () => {
		const run = await harness.setup({ script: () => [{ hang: true }] });
		const started = run.start();
		await waitFor(
			() => run.manager.status(run.owner, started.id).state === "running" && run.workspace.model.requests.length === 1,
		);

		run.manager.cancel(run.owner, started.id);
		run.manager.cancel(run.owner, started.id);
		expect(run.manager.status(run.owner, started.id).state).toBe("stopping");
		const final = await run.done(started.id);
		run.manager.cancel(run.owner, started.id);

		expect(final.state).toBe("cancelled");
		expect(run.manager.status(run.owner, started.id).state).toBe("cancelled");
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("stops a child that is still starting, before any model request", async () => {
		const run = await harness.setup();
		const started = run.start();
		await waitFor(() => run.pids.length === 1);
		run.manager.cancel(run.owner, started.id);
		const final = await run.done(started.id);

		expect(final.state).toBe("cancelled");
		expect(run.workspace.model.requests).toHaveLength(0);
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("keeps a completed result when cancel arrives while the output is being saved", async () => {
		let release!: () => void;
		const gate = new Promise<void>((done) => (release = done));
		const run = await harness.setup({
			script: () => [{ text: "answer" }],
			deps: { persist: async (_run, result) => (await gate, void run.persisted.push(result)) },
		});
		const started = run.start();
		await waitFor(() => run.manager.status(run.owner, started.id).state === "stopping");

		run.manager.cancel(run.owner, started.id);
		release();
		const final = await run.done(started.id);

		expect(final.state).toBe("completed");
		expect(groupAlive(run.pids[0])).toBe(false);
	});
});

describe("saving the result", () => {
	it("fails the run when the output cannot be saved, and still cleans up", async () => {
		const run = await harness.setup({
			script: () => [{ text: "answer" }],
			deps: { persist: async () => Promise.reject(new Error("disk full")) },
		});
		const final = await run.done(run.start().id);

		expect(final.state).toBe("failed");
		expect(final.error).toBe("could not save output: disk full");
		expect(groupAlive(run.pids[0])).toBe(false);
	});
});

describe("storage errors", () => {
	/** Logs that report a disk failure after `afterMs`. */
	const failingLogs = (afterMs: number) => ({
		event: () => undefined,
		stderr: () => undefined,
		failure: new Promise<string>((resolve) =>
			setTimeout(() => resolve("could not write events.jsonl: disk full"), afterMs),
		),
		close: async () => undefined,
	});

	it("fails before any process starts when the run files cannot be created", async () => {
		const run = await harness.setup({
			deps: { prepare: async () => Promise.reject(new Error("could not create the run directory")) },
		});
		const final = await run.done(run.start().id);
		expect(final).toMatchObject({ state: "failed", error: "could not create the run directory" });
		expect(run.pids).toEqual([]);
		expect(run.workspace.model.requests).toHaveLength(0);
	});

	it("fails a running child when the logs can no longer be written, and stops it", async () => {
		const run = await harness.setup({
			script: () => [{ hang: true }],
			deps: { prepare: async () => ({ personaFile: `${process.cwd()}/package.json`, logs: failingLogs(2500) }) },
		});
		const final = await run.done(run.start().id);
		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/could not save run files: could not write events\.jsonl: disk full/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("does not report completed when the logs failed before the answer arrived", async () => {
		const run = await harness.setup({
			script: () => [{ text: "answer" }],
			deps: { prepare: async () => ({ personaFile: `${process.cwd()}/package.json`, logs: failingLogs(1) }) },
		});
		const final = await run.done(run.start().id);
		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/could not save run files/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});
});

describe("storage errors after the answer", () => {
	it("does not report completed when the logs fail while the answer is being saved", async () => {
		let failLogs!: (reason: string) => void;
		let release!: () => void;
		const gate = new Promise<void>((done) => (release = done));
		const logs = {
			event: () => undefined,
			stderr: () => undefined,
			failure: new Promise<string>((resolve) => (failLogs = resolve)),
			close: async () => undefined,
		};
		const run = await harness.setup({
			script: () => [{ text: "answer" }],
			deps: {
				prepare: async () => ({ personaFile: `${process.cwd()}/package.json`, logs }),
				persist: async () => gate,
			},
		});
		const started = run.start();
		await waitFor(() => run.manager.status(run.owner, started.id).state === "stopping");
		failLogs("could not write events.jsonl: disk full");
		release();
		const final = await run.done(started.id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/could not save run files: could not write events\.jsonl: disk full/);
	});
});

describe("deadlines and start failures", () => {
	it("fails at the total deadline and stops the child", async () => {
		const run = await harness.setup({ script: () => [{ hang: true }], deps: { totalDeadlineMs: 4000 } });
		const started = run.start();
		const final = await run.done(started.id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/total deadline of 4000 ms/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("fails at the startup deadline when the child never becomes ready", async () => {
		const run = await harness.setup({
			deps: {
				startupDeadlineMs: 1000,
				guardPath: new URL("./fixtures/hanging-guard.ts", import.meta.url).pathname,
			},
		});
		const started = run.start();
		const final = await run.done(started.id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/not ready within 3000 ms/);
		expect(run.workspace.model.requests).toHaveLength(0);
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("goes from starting straight to failed when the executable cannot start, and frees the slot", async () => {
		const run = await harness.setup({ deps: { piBin: "/nonexistent/pi" } });
		const started = run.start();
		const final = await run.done(started.id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/cannot start \/nonexistent\/pi|exited before it was ready/);
		expect(run.states).toEqual(["starting", "failed"]);
		expect(() => run.start()).not.toThrow();
	});
});

describe("terminal-result rules on a real child", () => {
	it("keeps a run failed when an extension handler throws, although the answer arrived", async () => {
		const run = await harness.setup({ script: () => [{ text: "a fine answer" }], extensions: [THROWING] });
		const final = await run.done(run.start().id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/extension error in turn_end: handler exploded/);
		expect(run.persisted).toEqual([
			{ kind: "partial", text: "a fine answer", reason: expect.stringMatching(/extension error in turn_end/) },
		]);
	});

	it("fails when the child exits with code zero without settling", async () => {
		const run = await harness.setup({ script: () => [{ text: "never seen" }], extensions: [EXIT_ON_START] });
		const final = await run.done(run.start().id);

		expect(final.state).toBe("failed");
		expect(final.error).toBe("child exited without a settled result");
	});

	it("fails on a permission violation and stops the child", async () => {
		const run = await harness.setup({
			tools: ["read"],
			script: (cwd) => [{ tool: "write", args: { path: `${cwd}/x.txt`, content: "x" } }, { hang: true }],
		});
		const final = await run.done(run.start().id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/permission violation: write is not approved/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});

	it("completes after a transient provider error that Pi retries", async () => {
		const run = await harness.setup({
			script: () => [{ status: 529 }, { text: "recovered" }],
			seed: async ({ agentDir }) => {
				const { writeFile } = await import("node:fs/promises");
				await writeFile(`${agentDir}/settings.json`, JSON.stringify({ retry: { maxRetries: 2, baseDelayMs: 100 } }));
			},
		});
		const final = await run.done(run.start().id);

		expect(final.state).toBe("completed");
		expect(run.persisted).toEqual([{ kind: "final", text: "recovered" }]);
		expect(run.workspace.model.requests).toHaveLength(2);
	});

	it("fails when the provider keeps failing after the retries", async () => {
		const run = await harness.setup({
			script: () => [{ status: 529 }],
			seed: async ({ agentDir }) => {
				const { writeFile } = await import("node:fs/promises");
				await writeFile(`${agentDir}/settings.json`, JSON.stringify({ retry: { maxRetries: 1, baseDelayMs: 100 } }));
			},
		});
		const final = await run.done(run.start().id);

		expect(final.state).toBe("failed");
		expect(final.error).toMatch(/provider (failed after retries|error)/);
		expect(groupAlive(run.pids[0])).toBe(false);
	});
});
