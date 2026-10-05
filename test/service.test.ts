import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryStore } from "../src/config.ts";
import { RunManager, type RunOutcome, type Supervisor, type SupervisorHooks } from "../src/runs.ts";
import { createService } from "../src/service.ts";

let dir: string;
let context: { cwd: string; model: string; thinking: string };
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ompss-service-"));
	context = { cwd: dir, model: "p/parent", thinking: "high" };
	await mkdir(join(dir, "personas"));
	await writeFile(join(dir, "personas/reader.md"), "Read.");
	await writeFile(join(dir, "personas/writer.md"), "Write.");
	await writeYaml(`version: 1
agents:
  reader:
    persona: ./personas/reader.md
    tools: [read, grep]
    thinking: off
  writer:
    persona: ./personas/writer.md
    tools: [read, bash]
    thinking: off
    model: p/own
`);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const writeYaml = (text: string) => writeFile(join(dir, "om-pi-subagents.yaml"), text);
const tick = () => new Promise((done) => setImmediate(done));

function setup(deliveryOf?: (runId: string) => { delivered: boolean; error?: string } | undefined) {
	const calls: Array<{
		hooks: SupervisorHooks;
		settle: (outcome: RunOutcome) => void;
		request: Parameters<Supervisor>[1];
	}> = [];
	const supervisor = vi.fn<Supervisor>(
		(_run, request, hooks) => new Promise<RunOutcome>((settle) => calls.push({ hooks, settle, request })),
	);
	const manager = new RunManager(supervisor);
	const service = createService({
		registry: createRegistryStore(join(dir, "om-pi-subagents.yaml")),
		manager,
		directoryFor: (owner, runId) => `/runs/${owner}/${runId}`,
		deliveryOf,
	});
	return { service, manager, supervisor, calls };
}

describe("list", () => {
	it("identifies approved delegation as capable of reaching write-enabled targets", async () => {
		await writeYaml(
			"version: 1\nagents:\n  delegator:\n    persona: ./personas/reader.md\n    tools: [ompss]\n    thinking: off\n",
		);
		const text = await setup().service.list();
		expect(text).toMatch(/delegator.*delegation-capable.*write-capable targets/);
	});

	it("shows each mapped name with its tools and flags write-capable personas", async () => {
		const text = await setup().service.list();
		expect(text).toMatch(/reader.*read, grep/);
		expect(text).not.toMatch(/reader.*write-capable/);
		expect(text).toMatch(/writer.*read, bash.*write-capable/);
		expect(text).toContain("p/own");
	});

	it("says so when nothing is mapped", async () => {
		await writeYaml("version: 1\nagents: {}\n");
		expect(await setup().service.list()).toBe("No personas mapped.");
	});

	it("reports a configuration error", async () => {
		await writeYaml("version: 2\nagents: {}\n");
		await expect(setup().service.list()).rejects.toThrow(/version/);
	});
});

describe("run", () => {
	it("returns at once with the run id and file directory while the child still works", async () => {
		const { service, calls, supervisor } = setup();
		const text = await service.run("s1", { agent: "reader", task: "look around" }, context);

		expect(supervisor).toHaveBeenCalledTimes(1);
		const id = /run ([0-9a-f-]{36})/.exec(text)![1];
		expect(text).toContain(`/runs/s1/${id}`);
		expect(text).toMatch(/status/);
		expect(calls[0].request).toMatchObject({
			task: "look around",
			cwd: dir,
			agent: { name: "reader", tools: ["read", "grep"] },
		});
		// Thinking comes from the agent's YAML only; the parent's level must never reach the run.
		expect(calls[0].request.parent).toEqual({ model: "p/parent" });
	});

	it("uses an explicit absolute working directory", async () => {
		const other = await mkdtemp(join(tmpdir(), "ompss-cwd-"));
		try {
			const { service, calls } = setup();
			await service.run("s1", { agent: "reader", task: "t", cwd: other }, context);
			expect(calls[0].request.cwd).toBe(other);
		} finally {
			await rm(other, { recursive: true, force: true });
		}
	});

	it.each([
		["an unknown agent", { agent: "nobody", task: "t" }, /unknown agent "nobody".*reader, writer/],
		["an empty task", { agent: "reader", task: "" }, /task is required/],
		["a blank task", { agent: "reader", task: "  \n " }, /task is required/],
		["a slash command", { agent: "reader", task: "/help" }, /slash command/],
		["a slash command after spaces", { agent: "reader", task: "  /ompss-child-preflight" }, /slash command/],
		["a relative directory", { agent: "reader", task: "t", cwd: "work" }, /absolute/],
		["a missing directory", { agent: "reader", task: "t", cwd: "/nonexistent/dir" }, /does not exist|not a directory/],
	])("refuses %s and starts nothing", async (_label, input, message) => {
		const { service, supervisor } = setup();
		await expect(service.run("s1", input, context)).rejects.toThrow(message);
		expect(supervisor).not.toHaveBeenCalled();
	});

	it("accepts a task that merely contains a slash", async () => {
		const { service, supervisor } = setup();
		await service.run("s1", { agent: "reader", task: "read src/a.ts and /etc/hosts" }, context);
		expect(supervisor).toHaveBeenCalledTimes(1);
	});

	it("names the active run when the slot is taken", async () => {
		const { service } = setup();
		const first = await service.run("s1", { agent: "reader", task: "one" }, context);
		const id = /run ([0-9a-f-]{36})/.exec(first)![1];
		await expect(service.run("s1", { agent: "reader", task: "two" }, context)).rejects.toThrow(
			new RegExp(`ompss cancel ${id}`),
		);
	});

	it("does not launch on a stale registry after a failed refresh", async () => {
		const { service, supervisor } = setup();
		await service.list();
		await writeYaml(
			"version: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: ['*']\n    thinking: off\n",
		);
		await expect(service.run("s1", { agent: "reader", task: "t" }, context)).rejects.toThrow(/exact tool name/);
		expect(supervisor).not.toHaveBeenCalled();
	});

	it("picks up an edited persona on the next launch", async () => {
		const { service, calls } = setup();
		await service.run("s1", { agent: "reader", task: "one" }, context);
		calls[0].settle({ state: "completed" });
		await tick();
		await writeFile(join(dir, "personas/reader.md"), "Edited.");
		await service.run("s1", { agent: "reader", task: "two" }, context);
		expect(calls[1].request.agent.persona).toBe("Edited.");
	});
});

describe("status and cancel", () => {
	it("shows the state, agent and files of one run, and lists the session's runs", async () => {
		const { service } = setup();
		const id = /run ([0-9a-f-]{36})/.exec(await service.run("s1", { agent: "reader", task: "t" }, context))![1];
		expect(service.status("s1", id)).toMatch(new RegExp(`${id}.*starting.*reader`, "s"));
		expect(service.status("s1")).toContain(id);
		expect(service.status("s2")).toBe("No runs in this session.");
	});

	it("includes the error of a failed run", async () => {
		const { service, calls } = setup();
		const id = /run ([0-9a-f-]{36})/.exec(await service.run("s1", { agent: "reader", task: "t" }, context))![1];
		calls[0].settle({ state: "failed", error: "permission violation: write is not approved" });
		await tick();
		expect(service.status("s1", id)).toMatch(/failed.*permission violation: write/s);
	});

	it("refuses another session's run, for status and for cancel", async () => {
		const { service, calls } = setup();
		const id = /run ([0-9a-f-]{36})/.exec(await service.run("s1", { agent: "reader", task: "t" }, context))![1];
		expect(() => service.status("s2", id)).toThrow(/unknown run/);
		expect(() => service.cancel("s2", id)).toThrow(/unknown run/);
		expect(calls[0].hooks.signal.aborted).toBe(false);
	});

	it("cancels an owned run", async () => {
		const { service, calls } = setup();
		const id = /run ([0-9a-f-]{36})/.exec(await service.run("s1", { agent: "reader", task: "t" }, context))![1];
		expect(service.cancel("s1", id)).toMatch(/stopping/);
		expect(calls[0].hooks.signal.aborted).toBe(true);
	});

	it("requires a run id to cancel", () => {
		expect(() => setup().service.cancel("s1", "")).toThrow(/run id is required/);
	});
});

describe("status shows a failed result message", () => {
	const finish = async (delivery: { delivered: boolean; error?: string } | undefined) => {
		const { service, calls } = setup(() => delivery);
		const id = /run ([0-9a-f-]{36})/.exec(await service.run("s1", { agent: "reader", task: "t" }, context))![1];
		calls[0].settle({ state: "completed" });
		await tick();
		return service.status("s1", id);
	};

	it("names the reason when the notification did not reach the parent", async () => {
		expect(await finish({ delivered: false, error: "the owning session has ended" })).toMatch(
			/result message not delivered: the owning session has ended/,
		);
	});

	it("says nothing when it was delivered or is unknown", async () => {
		expect(await finish({ delivered: true })).not.toMatch(/not delivered/);
		expect(await finish(undefined)).not.toMatch(/not delivered/);
	});
});
