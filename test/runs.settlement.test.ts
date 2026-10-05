import { describe, expect, it, vi } from "vitest";
import { RunManager, type RunOutcome, type RunView, type Supervisor } from "../src/runs.ts";
import { createNotifier } from "../src/notify.ts";

const request = {
	agent: { name: "reader", personaPath: "p", persona: "Read.", tools: [], thinking: "off", skills: [], extensions: [] },
	task: "Read the task",
	cwd: "/work",
	limits: { maxConcurrentRuns: 4, maxDepth: 3 },
};
const tick = () => new Promise((done) => setImmediate(done));
function gate() {
	let release!: () => void;
	const wait = new Promise<void>((done) => {
		release = done;
	});
	return { wait, release };
}
function controlled(onTerminal?: (view: RunView) => Promise<void>) {
	const completions: Array<(outcome: RunOutcome) => void> = [];
	const supervisor = vi.fn<Supervisor>(() => new Promise((done) => completions.push(done)));
	return { manager: new RunManager(supervisor, { onTerminal }), completions };
}

describe("owned settlement waiting", () => {
	it.each(["completed", "failed", "cancelled"] as const)(
		"waits for delayed saved output and preserves %s delivery rules",
		async (state) => {
			const output = gate();
			const send = vi.fn(async () => undefined);
			const readOutput = vi.fn(async () => {
				await output.wait;
				return state === "failed" ? "PARTIAL OUTPUT: failed answer" : "Saved answer";
			});
			const recordDelivery = vi.fn(async () => undefined);
			const notifier = createNotifier({
				messenger: () => ({ send }),
				readOutput,
				recordDelivery,
				directoryFor: () => "/runs",
			});
			const { manager, completions } = controlled(notifier.onTerminal);
			const run = manager.start("parent", request);
			let settled = false;
			const waiting = manager.waitForOwned("parent").then(() => {
				settled = true;
			});
			completions[0]({ state });
			await tick();
			expect(manager.status("parent", run.id).state).toBe(state);
			if (state === "cancelled") {
				await waiting;
				expect(readOutput).not.toHaveBeenCalled();
				expect(send).not.toHaveBeenCalled();
				return;
			}
			expect(readOutput).toHaveBeenCalledTimes(1);
			expect(settled).toBe(false);
			expect(send).not.toHaveBeenCalled();
			output.release();
			await waiting;
			expect(send).toHaveBeenCalledTimes(1);
			expect(recordDelivery).toHaveBeenCalledWith(expect.objectContaining({ id: run.id }), { delivered: true });
			if (state === "failed") expect(JSON.stringify(send.mock.calls)).toContain("PARTIAL OUTPUT");
		},
	);

	it("waits for each supervisor and its terminal delivery attempt after the slot is released", async () => {
		const delivery = gate();
		const { manager, completions } = controlled(async () => delivery.wait);
		const run = manager.start("parent", request);
		let settled = false;
		const waiting = manager.waitForOwned("parent").then(() => {
			settled = true;
		});
		completions[0]({ state: "completed" });
		await tick();
		expect(manager.status("parent", run.id).state).toBe("completed");
		expect(settled).toBe(false);
		delivery.release();
		await waiting;
		expect(settled).toBe(true);
	});

	it("keeps two delivery attempts separate when runs complete out of order", async () => {
		const deliveries = [gate(), gate()];
		const ids: string[] = [];
		const { manager, completions } = controlled(async (view) => deliveries[ids.indexOf(view.id)].wait);
		ids.push(manager.start("parent", request).id, manager.start("parent", request).id);
		let settled = false;
		const waiting = manager.waitForOwned("parent").then(() => {
			settled = true;
		});
		completions[1]({ state: "failed", error: "model failed" });
		deliveries[1].release();
		await tick();
		expect(settled).toBe(false);
		completions[0]({ state: "completed" });
		await tick();
		expect(settled).toBe(false);
		deliveries[0].release();
		await waiting;
	});

	it("observes a failed delivery without changing the completed run", async () => {
		const { manager, completions } = controlled(async () => {
			throw new Error("parent unavailable");
		});
		const run = manager.start("parent", request);
		const waiting = manager.waitForOwned("parent");
		completions[0]({ state: "completed" });
		await waiting;
		expect(manager.status("parent", run.id).state).toBe("completed");
	});

	it("releases a cancelled run and ignores a sibling owner's work", async () => {
		const { manager, completions } = controlled();
		const run = manager.start("parent", request);
		manager.start("sibling", request);
		manager.cancel("parent", run.id);
		const waiting = manager.waitForOwned("parent");
		completions[0]({ state: "cancelled" });
		await waiting;
		expect(manager.list("sibling")[0].state).toBe("starting");
	});

	it("ends a settlement wait on cancellation even while delivery is held", async () => {
		const delivery = gate();
		const { manager, completions } = controlled(async () => delivery.wait);
		manager.start("parent", request);
		completions[0]({ state: "completed" });
		await tick();
		const controller = new AbortController();
		const waiting = manager.waitForOwned("parent", controller.signal);
		controller.abort(new Error("settlement cancelled"));
		await expect(waiting).rejects.toThrow(/settlement cancelled/);
		delivery.release();
	});

	it("also waits for a fresh owned run admitted while an earlier delivery is pending", async () => {
		const delivery = gate();
		const { manager, completions } = controlled(async () => delivery.wait);
		manager.start("parent", request);
		let settled = false;
		const waiting = manager.waitForOwned("parent").then(() => {
			settled = true;
		});
		completions[0]({ state: "completed" });
		await tick();
		manager.start("parent", request);
		delivery.release();
		await tick();
		expect(settled).toBe(false);
		completions[1]({ state: "completed" });
		await waiting;
	});
});
