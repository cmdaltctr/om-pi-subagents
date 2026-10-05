import { describe, expect, it, vi } from "vitest";
import type { AgentSnapshot } from "../src/config.ts";
import {
	CleanupBlockedError,
	OccupiedError,
	RunManager,
	UnknownRunError,
	type RunOutcome,
	type Supervisor,
	type SupervisorHooks,
} from "../src/runs.ts";

const agent: AgentSnapshot = {
	name: "reader",
	personaPath: "p",
	persona: "x",
	tools: ["read"],
	thinking: "off",
	skills: [],
	extensions: [],
};
const request = { agent, task: "look around", cwd: "/work" };

/** A supervisor the test controls: each call waits until the test settles it. */
function controlled() {
	const calls: Array<{ hooks: SupervisorHooks; settle: (outcome: RunOutcome) => void }> = [];
	const supervisor: Supervisor = (_run, _request, hooks) =>
		new Promise<RunOutcome>((settle) => {
			calls.push({ hooks, settle });
		});
	return { supervisor: vi.fn(supervisor), calls };
}

const tick = () => new Promise((done) => setImmediate(done));

describe("slot reservation", () => {
	it("starts one process when two launches arrive together", () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const first = manager.start("session-1", request);
		let second: unknown;
		try {
			manager.start("session-1", request);
		} catch (error) {
			second = error;
		}
		expect(second).toBeInstanceOf(OccupiedError);
		expect((second as OccupiedError).activeRunId).toBe(first.id);
		expect(supervisor).toHaveBeenCalledTimes(1);
		expect(calls).toHaveLength(1);
	});

	it("keeps the slot through starting, running and stopping, and frees it at the terminal state", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);
		expect(run.state).toBe("starting");
		expect(() => manager.start("session-1", request)).toThrow(OccupiedError);

		calls[0].hooks.markRunning();
		expect(manager.status("session-1", run.id).state).toBe("running");
		expect(() => manager.start("session-1", request)).toThrow(OccupiedError);

		calls[0].hooks.markStopping();
		expect(manager.status("session-1", run.id).state).toBe("stopping");
		expect(() => manager.start("session-1", request)).toThrow(OccupiedError);

		calls[0].settle({ state: "completed" });
		await tick();
		expect(manager.status("session-1", run.id).state).toBe("completed");
		expect(() => manager.start("session-1", request)).not.toThrow();
	});

	it("lets a different session run its own child at the same time", () => {
		const { supervisor } = controlled();
		const manager = new RunManager(supervisor);
		manager.start("session-1", request);
		expect(() => manager.start("session-2", request)).not.toThrow();
	});

	it("fails the run and frees the slot when the supervisor's promise rejects", async () => {
		const manager = new RunManager(async () => {
			throw new Error("child vanished");
		});
		const run = manager.start("session-1", request);
		await tick();
		expect(manager.status("session-1", run.id)).toMatchObject({ state: "failed", error: "child vanished" });
		expect(() => manager.start("session-1", request)).not.toThrow();
	});

	it("frees the slot when the supervisor throws", async () => {
		const manager = new RunManager(() => {
			throw new Error("spawn exploded");
		});
		const run = manager.start("session-1", request);
		await tick();
		expect(manager.status("session-1", run.id)).toMatchObject({ state: "failed", error: "spawn exploded" });
		expect(() => manager.start("session-1", request)).not.toThrow();
	});
});

describe("states", () => {
	it("can fail straight from starting, for example when the spawn fails", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);
		calls[0].settle({ state: "failed", error: "cannot start pi" });
		await tick();
		expect(manager.status("session-1", run.id)).toMatchObject({ state: "failed", error: "cannot start pi" });
	});

	it("keeps a terminal state immutable against late hook calls", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);
		calls[0].settle({ state: "completed" });
		await tick();
		calls[0].hooks.markRunning();
		calls[0].hooks.markStopping();
		expect(manager.status("session-1", run.id)).toMatchObject({ state: "completed" });
	});

	it("gives each run a unique, path-safe id", () => {
		const { supervisor } = controlled();
		const manager = new RunManager(supervisor);
		const first = manager.start("session-1", request);
		const second = manager.start("session-2", request);
		expect(first.id).not.toBe(second.id);
		expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
	});
});

describe("ownership", () => {
	it("refuses status and cancel for another session and sends no signal", () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);

		expect(() => manager.status("session-2", run.id)).toThrow(UnknownRunError);
		expect(() => manager.cancel("session-2", run.id)).toThrow(UnknownRunError);
		expect(calls[0].hooks.signal.aborted).toBe(false);
		expect(manager.status("session-1", run.id).state).toBe("starting");
	});

	it("lists only the calling session's runs", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const mine = manager.start("session-1", request);
		manager.start("session-2", request);
		expect(manager.list("session-1").map((run) => run.id)).toEqual([mine.id]);
		calls[0].settle({ state: "completed" });
		await tick();
		expect(manager.list("session-1")).toHaveLength(1);
	});

	it("reports an unknown run id the same way as a foreign one", () => {
		const manager = new RunManager(controlled().supervisor);
		expect(() => manager.status("session-1", "no-such-run")).toThrow(UnknownRunError);
	});
});

describe("cancel", () => {
	it("moves to stopping, aborts the supervisor's signal and keeps the slot until it settles", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);
		calls[0].hooks.markRunning();

		expect(manager.cancel("session-1", run.id).state).toBe("stopping");
		expect(calls[0].hooks.signal.aborted).toBe(true);
		expect(() => manager.start("session-1", request)).toThrow(OccupiedError);

		calls[0].settle({ state: "cancelled" });
		await tick();
		expect(manager.status("session-1", run.id).state).toBe("cancelled");
		expect(() => manager.start("session-1", request)).not.toThrow();
	});

	it("does nothing to a run that already finished", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);
		calls[0].settle({ state: "completed" });
		await tick();
		expect(manager.cancel("session-1", run.id).state).toBe("completed");
		expect(calls[0].hooks.signal.aborted).toBe(false);
	});
});

describe("terminal notification hook", () => {
	it("calls onTerminal once per run with the final view", async () => {
		const { supervisor, calls } = controlled();
		const seen: Array<{ id: string; state: string }> = [];
		const manager = new RunManager(supervisor, {
			onTerminal: (view) => {
				seen.push({ id: view.id, state: view.state });
			},
		});
		const run = manager.start("session-1", request);
		calls[0].hooks.markStopping();
		await tick();
		expect(seen).toEqual([]);
		calls[0].settle({ state: "failed", error: "boom" });
		await tick();
		expect(seen).toEqual([{ id: run.id, state: "failed" }]);
	});
});

describe("cancelAll", () => {
	it("cancels every active run of the session, waits for them to settle, and leaves other sessions alone", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const mine = manager.start("session-1", request);
		manager.start("session-2", request);

		let done = false;
		const all = manager.cancelAll("session-1").then(() => (done = true));
		await tick();
		expect(calls[0].hooks.signal.aborted).toBe(true);
		expect(calls[1].hooks.signal.aborted).toBe(false);
		expect(done).toBe(false);

		calls[0].settle({ state: "cancelled" });
		await all;
		expect(manager.status("session-1", mine.id).state).toBe("cancelled");
		expect(calls[1].hooks.signal.aborted).toBe(false);
	});

	it("is safe to repeat and does nothing when no run is active", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		await manager.cancelAll("session-1");
		manager.start("session-1", request);
		const first = manager.cancelAll("session-1");
		const second = manager.cancelAll("session-1");
		calls[0].settle({ state: "cancelled" });
		await Promise.all([first, second]);
		expect(manager.list("session-1")[0].state).toBe("cancelled");
	});
});

describe("cleanup failure", () => {
	const uncertain: RunOutcome = {
		state: "failed",
		error: "cleanup failed: process 4242 of the child still runs",
		cleanupFailed: true,
	};

	it("blocks further launches in that session, naming the run and the cause", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		const run = manager.start("session-1", request);
		calls[0].settle(uncertain);
		await tick();

		expect(manager.status("session-1", run.id)).toMatchObject({ state: "failed", error: uncertain.error });
		let blocked: unknown;
		try {
			manager.start("session-1", request);
		} catch (error) {
			blocked = error;
		}
		expect(blocked).toBeInstanceOf(CleanupBlockedError);
		expect((blocked as CleanupBlockedError).runId).toBe(run.id);
		expect((blocked as Error).message).toContain("process 4242 of the child still runs");
		expect((blocked as Error).message).toMatch(/reload/i);
		expect(supervisor).toHaveBeenCalledTimes(1);
	});

	it("leaves other sessions free to launch", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		manager.start("session-1", request);
		calls[0].settle(uncertain);
		await tick();
		expect(() => manager.start("session-2", request)).not.toThrow();
	});

	it("does not block after an ordinary failure", async () => {
		const { supervisor, calls } = controlled();
		const manager = new RunManager(supervisor);
		manager.start("session-1", request);
		calls[0].settle({ state: "failed", error: "model refused" });
		await tick();
		expect(() => manager.start("session-1", request)).not.toThrow();
	});
});

describe("change hook", () => {
	it("reports the starting state, every transition, and the terminal state, in order", async () => {
		const { supervisor, calls } = controlled();
		const seen: string[] = [];
		const manager = new RunManager(supervisor, { onChange: (view) => seen.push(view.state) });
		manager.start("session-1", request);
		calls[0].hooks.markRunning();
		calls[0].hooks.markStopping();
		calls[0].settle({ state: "completed" });
		await tick();
		expect(seen).toEqual(["starting", "running", "stopping", "completed"]);
	});
});
