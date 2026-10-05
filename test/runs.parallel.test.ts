import { describe, expect, it, vi } from "vitest";
import {
	CleanupBlockedError,
	OccupiedError,
	RunManager,
	type RunOutcome,
	type Supervisor,
	type SupervisorHooks,
} from "../src/runs.ts";

const request = {
	agent: {
		name: "reader",
		personaPath: "p",
		persona: "Read.",
		tools: ["read"],
		thinking: "off",
		skills: [],
		extensions: [],
	},
	task: "Read the task",
	cwd: "/work",
	limits: { maxConcurrentRuns: 4, maxDepth: 3 },
};
function controlled() {
	const calls: Array<{ hooks: SupervisorHooks; settle: (outcome: RunOutcome) => void }> = [];
	const supervise = vi.fn<Supervisor>(
		(_run, _request, hooks) => new Promise((settle) => calls.push({ hooks, settle })),
	);
	return { manager: new RunManager(supervise), supervise, calls };
}
const tick = () => new Promise((done) => setImmediate(done));

describe("per-owner parallel admission", () => {
	it("reserves exactly four of five simultaneous launches before invoking supervisors", () => {
		const { manager, supervise } = controlled();
		const outcomes = Array.from({ length: 5 }, () => {
			try {
				return manager.start("owner", request);
			} catch (error) {
				return error;
			}
		});
		expect(supervise).toHaveBeenCalledTimes(4);
		expect(manager.list("owner")).toHaveLength(4);
		expect(outcomes[4]).toBeInstanceOf(OccupiedError);
		const message = (outcomes[4] as Error).message;
		expect(message).toMatch(/maxConcurrentRuns.*4/);
		for (const run of manager.list("owner")) expect(message).toContain(run.id);
		expect(message).toMatch(/wait/i);
		expect(message).toMatch(/cancel/i);
		expect(message).toMatch(/YAML/);
	});

	it("counts starting, running and stopping, and frees ordinary terminal slots", async () => {
		const { manager, calls } = controlled();
		const runs = Array.from({ length: 4 }, () => manager.start("owner", request));
		calls[1].hooks.markRunning();
		manager.cancel("owner", runs[2].id);
		expect(calls[2].hooks.signal.aborted).toBe(true);
		expect(() => manager.start("owner", request)).toThrow(OccupiedError);
		calls[3].settle({ state: "failed", error: "model refused" });
		await tick();
		expect(() => manager.start("owner", request)).not.toThrow();
		expect(manager.list("owner").filter((run) => ["starting", "running", "stopping"].includes(run.state))).toHaveLength(
			4,
		);
	});

	it("applies increases and decreases without cancelling active runs", async () => {
		const { manager, calls } = controlled();
		manager.start("owner", { ...request, limits: { maxConcurrentRuns: 1, maxDepth: 1 } });
		manager.start("owner", request);
		manager.start("owner", request);
		expect(() => manager.start("owner", { ...request, limits: { maxConcurrentRuns: 1, maxDepth: 1 } })).toThrow(
			OccupiedError,
		);
		expect(calls.every((call) => !call.hooks.signal.aborted)).toBe(true);
		for (const call of calls) call.settle({ state: "completed" });
		await tick();
		expect(() => manager.start("owner", { ...request, limits: { maxConcurrentRuns: 1, maxDepth: 1 } })).not.toThrow();
	});

	it("gives another immediate parent independent capacity and ownership", () => {
		const { manager, calls } = controlled();
		const root = Array.from({ length: 4 }, () => manager.start("root", request));
		const child = manager.start("child", request);
		expect(manager.list("root")).toHaveLength(4);
		expect(manager.list("child")).toEqual([child]);
		expect(() => manager.status("child", root[0].id)).toThrow(/unknown run/);
		expect(() => manager.cancel("child", root[0].id)).toThrow(/unknown run/);
		expect(calls[0].hooks.signal.aborted).toBe(false);
	});

	it("blocks uncertain cleanup despite spare capacity and leaves sibling cancellation available", async () => {
		const { manager, calls } = controlled();
		const bad = manager.start("owner", request);
		const sibling = manager.start("owner", request);
		calls[0].settle({ state: "failed", error: "process still runs", cleanupFailed: true });
		await tick();
		expect(() => manager.start("owner", request)).toThrow(CleanupBlockedError);
		expect(manager.status("owner", bad.id).cleanupFailed).toBe(true);
		expect(manager.cancel("owner", sibling.id).state).toBe("stopping");
		expect(calls[1].hooks.signal.aborted).toBe(true);
		expect(() => manager.start("another", request)).not.toThrow();
	});

	it("closes admission before teardown without closing another owner's slots", async () => {
		const { manager, calls, supervise } = controlled();
		manager.start("owner", request);
		manager.closeAdmission("owner");
		const stopping = manager.cancelAll("owner");
		expect(() => manager.start("owner", request)).toThrow(/session.*(ending|closed)/i);
		expect(supervise).toHaveBeenCalledTimes(1);
		calls[0].settle({ state: "cancelled" });
		await stopping;
		expect(() => manager.start("owner", request)).toThrow(/session.*(ending|closed)/i);
		expect(() => manager.start("another", request)).not.toThrow();
	});
});
