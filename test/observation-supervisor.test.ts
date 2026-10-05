import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ObservedNode } from "../src/observation.ts";
import { groupAlive } from "../src/runner.ts";
import { observationSupervised } from "./fixtures/observation-supervised.ts";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";

describe.skipIf(!PI_AVAILABLE)("observation and real child supervision", () => {
	it("contains a failed display subscription, preserves persistence and detaches a successful subscription", async () => {
		const failure = vi.fn();
		const h = await observationSupervised({
			onObservation: () => {
				throw new Error("display subscription unavailable");
			},
			onDisplayFailure: (run) => {
				failure();
				h.observations.markIncomplete({ owner: run.owner, runId: run.id });
			},
		});
		try {
			h.workspace.model.script = [{ text: "The answer" }];
			const run = h.start();
			await h.manager.waitForOwned(h.owner);
			expect(h.manager.status(h.owner, run.id).state).toBe("completed");
			expect(h.observations.tree(h.owner, run.id)?.reasons).toContain("connection-lost");
			expect(failure).toHaveBeenCalledTimes(1);
			expect(h.saved).toEqual(["The answer"]);
			expect(h.terminal).toHaveLength(1);
			expect(h.workspace.model.requests).toHaveLength(1);
			expect(groupAlive(h.children[0].pid!)).toBe(false);
		} finally {
			await h.dispose();
		}
	});

	it("keeps missing SDK display identity separate from a real child's outcome and cleanup", async () => {
		const h = await observationSupervised({
			onObservation: (run, channel, token) =>
				h.relay.connect(
					run,
					{
						onRecord: channel.onRecord.bind(channel),
						request: async () => ({ success: true, data: {} }),
					},
					token,
				),
		});
		try {
			h.workspace.model.script = [{ text: "The answer" }];
			const run = h.start();
			await h.manager.waitForOwned(h.owner);
			expect(h.manager.status(h.owner, run.id).state).toBe("completed");
			expect(h.observations.tree(h.owner, run.id)?.reasons).toContain("lineage");
			expect(h.saved).toEqual(["The answer"]);
			expect(h.terminal).toHaveLength(1);
			expect(groupAlive(h.children[0].pid!)).toBe(false);
		} finally {
			await h.dispose();
		}
	});

	it("replays real readiness-time snapshots with observer revisions, including terminal evidence arriving before its parent", async () => {
		const h = await observationSupervised({
			guardPath: new URL("./fixtures/observation-readiness-guard.ts", import.meta.url).pathname,
		});
		try {
			const run = h.start();
			await h.manager.waitForOwned(h.owner);
			const tree = h.observations.tree(h.owner, run.id)!;
			expect(tree.nodes.map((node) => node.depth)).toEqual([1, 2, 3]);
			expect(tree.nodes.slice(1).map((node) => [node.state, node.revision])).toEqual([
				["completed", 4],
				["completed", 9],
			]);
			expect(tree.incomplete).toBe(false);
			expect(h.manager.status(h.owner, run.id).state).toBe("completed");
			expect(h.workspace.model.requests).toHaveLength(1);
		} finally {
			await h.dispose();
		}
	});

	it("reports task tools with the current running state and excludes task, args and raw results", async () => {
		const h = await observationSupervised();
		const samples: ObservedNode[] = [];
		h.observations.subscribe(h.owner, ({ runId }) => {
			samples.push(h.observations.tree(h.owner, runId)!.nodes[0]);
		});
		try {
			h.workspace.model.script = [
				{ tool: "write", args: { path: join(h.workspace.cwd, "sample.txt"), content: "SECRET_ARGS" } },
				{ text: "SECRET_RESULT", delayMs: 200 },
			];
			const run = h.start();
			await h.manager.waitForOwned(h.owner);
			expect(h.manager.status(h.owner, run.id).state).toBe("completed");
			expect(
				samples.some((node) => node.state === "running" && node.activeTools.some((tool) => tool.name === "write")),
			).toBe(true);
			expect(
				samples.slice(samples.findIndex((node) => node.state === "running")).some((node) => node.state === "starting"),
			).toBe(false);
			expect(JSON.stringify(samples)).not.toMatch(/SECRET_|args|result|thinking|stderr|auth/);
			expect(h.workspace.model.requests).toHaveLength(2);
			expect(h.terminal).toHaveLength(1);
		} finally {
			await h.dispose();
		}
	});

	it("detaches the display subscription after successful cleanup", async () => {
		const detach = vi.fn();
		const h = await observationSupervised({
			onObservation: (run, channel, token) => {
				const stop = h.relay.connect(run, channel, token);
				return () => {
					detach();
					stop();
				};
			},
		});
		try {
			const run = h.start();
			await h.manager.waitForOwned(h.owner);
			expect(h.manager.status(h.owner, run.id).state).toBe("completed");
			expect(detach).toHaveBeenCalledTimes(1);
			expect(h.terminal).toHaveLength(1);
		} finally {
			await h.dispose();
		}
	});

	it("retains real pipe-loss failure and cleanup while marking missing display evidence", async () => {
		const detach = vi.fn();
		const h = await observationSupervised({
			onObservation: (run, channel, token) => {
				const stop = h.relay.connect(run, channel, token);
				return () => {
					detach();
					stop();
				};
			},
		});
		try {
			h.workspace.model.script = [{ hang: true }];
			const run = h.start();
			await vi.waitFor(() => expect(h.manager.status(h.owner, run.id).state).toBe("running"), { timeout: 20_000 });
			// Break the pipe after startup writes finish, while the live child waits on its provider.
			await vi.waitFor(() => expect(h.workspace.model.requests).toHaveLength(1), { timeout: 20_000 });
			h.children[0].stdout!.destroy();
			await h.manager.waitForOwned(h.owner);
			const final = h.manager.status(h.owner, run.id);
			expect(final).toMatchObject({ state: "failed", error: "protocol error: child output closed" });
			expect(h.observations.tree(h.owner, run.id)?.reasons).toContain("connection-lost");
			expect(detach).toHaveBeenCalledTimes(1);
			expect(h.terminal).toHaveLength(1);
			expect(h.saved).toEqual([]);
			expect(groupAlive(h.children[0].pid!)).toBe(false);
		} finally {
			await h.dispose();
		}
	});
});
