import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryStore } from "../src/config.ts";
import { RunManager, type RunOutcome, type Supervisor } from "../src/runs.ts";
import { createService } from "../src/service.ts";

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "omps-admission-"));
	await mkdir(join(dir, "personas"));
	await writeFile(join(dir, "personas", "reader.md"), "Read.");
	await revision(4);
});
afterEach(() => rm(dir, { recursive: true, force: true }));
const tick = () => new Promise((done) => setImmediate(done));
const context = () => ({ cwd: dir, model: "fake/counter" });
const input = { agent: "reader", task: "Read the task" };
const revision = (capacity: number, tool = "read") =>
	writeFile(
		join(dir, "om-pi-subagents.yaml"),
		`version: 1\nlimits:\n  maxConcurrentRuns: ${capacity}\n  maxDepth: 3\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [${tool}]\n    thinking: off\n`,
	);

function setup() {
	const calls: Array<{ request: Parameters<Supervisor>[1]; settle: (outcome: RunOutcome) => void }> = [];
	const supervisor = vi.fn<Supervisor>(
		(_run, request, _hooks) => new Promise((settle) => calls.push({ request, settle })),
	);
	const manager = new RunManager(supervisor);
	const registry = createRegistryStore(join(dir, "om-pi-subagents.yaml"));
	let hold: { ready: () => void; wait: Promise<void> } | undefined;
	const service = createService({
		registry: {
			...registry,
			async refresh() {
				const snapshot = await registry.refresh();
				const gate = hold;
				hold = undefined;
				gate?.ready();
				await gate?.wait;
				return snapshot;
			},
		},
		manager,
		directoryFor: (owner, id) => join(dir, owner, id),
	});
	return {
		service,
		manager,
		calls,
		supervisor,
		holdRefresh() {
			let release!: () => void;
			let ready!: () => void;
			const wait = new Promise<void>((done) => {
				release = done;
			});
			const captured = new Promise<void>((done) => {
				ready = done;
			});
			hold = { wait, ready };
			return { captured, release };
		},
	};
}

describe("service parallel admission", () => {
	it("admits exactly four concurrent requests and rejects the fifth before supervising", async () => {
		const { service, supervisor, manager } = setup();
		const results = await Promise.allSettled(Array.from({ length: 5 }, () => service.run("owner", input, context())));
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
		expect(supervisor).toHaveBeenCalledTimes(4);
		const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
		expect(rejected.reason.message).toMatch(/maxConcurrentRuns.*4/);
		for (const run of manager.list("owner")) expect(rejected.reason.message).toContain(run.id);
	});

	it("uses freshly increased and decreased capacity without altering existing runs", async () => {
		await revision(1);
		const { service, calls } = setup();
		await service.run("owner", input, context());
		await revision(4);
		await service.run("owner", input, context());
		await service.run("owner", input, context());
		await revision(1);
		await expect(service.run("owner", input, context())).rejects.toThrow(/maxConcurrentRuns.*1/);
		expect(calls).toHaveLength(3);
		for (const call of calls) call.settle({ state: "completed" });
		await tick();
		await service.run("owner", input, context());
		expect(calls[3].request.limits).toEqual({ maxConcurrentRuns: 1, maxDepth: 3 });
	});

	it("retains a coherent persona and limits when refresh continuations overlap", async () => {
		const { service, calls, holdRefresh } = setup();
		const gate = holdRefresh();
		const first = service.run("owner", input, context());
		await gate.captured;
		await revision(7, "write");
		await service.run("owner", { ...input, task: "Later revision" }, context());
		gate.release();
		await first;
		expect(calls[0].request).toMatchObject({
			task: "Later revision",
			limits: { maxConcurrentRuns: 7 },
			agent: { tools: ["write"] },
		});
		expect(calls[1].request).toMatchObject({
			task: input.task,
			limits: { maxConcurrentRuns: 4 },
			agent: { tools: ["read"] },
		});
	});

	it("refuses an in-flight launch when shutdown closes admission", async () => {
		const { service, supervisor, holdRefresh } = setup();
		const gate = holdRefresh();
		const launch = service.run("owner", input, context());
		void launch.catch(() => undefined);
		await gate.captured;
		await service.shutdown("owner");
		gate.release();
		await expect(launch).rejects.toThrow(/session.*(ending|closed)/i);
		expect(supervisor).not.toHaveBeenCalled();
		await expect(service.run("owner", input, context())).rejects.toThrow(/session.*(ending|closed)/i);
		await expect(service.run("another", input, context())).resolves.toContain("Started run");
	});

	it("blocks new launches after failed refresh without changing an active snapshot", async () => {
		const { service, calls } = setup();
		await service.run("owner", input, context());
		await revision(0, "write");
		await expect(service.run("owner", input, context())).rejects.toThrow(/limits\.maxConcurrentRuns/);
		expect(calls).toHaveLength(1);
		expect(calls[0].request.agent.tools).toEqual(["read"]);
	});
});
