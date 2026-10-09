import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryStore } from "../src/config.ts";
import { RunManager, type RunOutcome, type Supervisor, type SupervisorHooks } from "../src/runs.ts";
import type { ChildLineage } from "../src/protocol.ts";
import { createService } from "../src/service.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";

let root: string;
let dir: string;
let context: { cwd: string; model: string; thinking: string };
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-service-"));
	dir = join(root, "omps");
	await mkdir(dir, { recursive: true });
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
afterEach(() => rm(root, { recursive: true, force: true }));

const writeYaml = (text: string) => writeFile(join(dir, "config.yaml"), text);
const tick = () => new Promise((done) => setImmediate(done));

function setup(
	deliveryOf?: (runId: string) => { delivered: boolean; error?: string } | undefined,
	branch?: ChildLineage,
) {
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
		registry: createRegistryStore(join(dir, "config.yaml")),
		manager,
		directoryFor: (owner, runId) => `/runs/${owner}/${runId}`,
		deliveryOf,
		branch,
	});
	return { service, manager, supervisor, calls };
}

describe("list", () => {
	it("shows the targets that approved delegation may reach", async () => {
		await writeYaml(
			"version: 1\nagents:\n  delegator:\n    persona: ./personas/reader.md\n    tools: [omps]\n    thinking: off\n    delegates: [delegator]\n",
		);
		const text = await setup().service.list();
		expect(text).toMatch(/delegator.*delegation-capable \(targets: delegator\)/);
	});

	it("shows each mapped name with its tools and flags write-capable personas", async () => {
		const text = await setup().service.list();
		expect(text).toMatch(/reader.*read, grep/);
		expect(text).not.toMatch(/reader.*write-capable/);
		expect(text).toMatch(/writer.*read, bash.*write-capable/);
		expect(text).toContain("p/own");
	});

	it("gives a compact line per agent with a tool count and its capability", async () => {
		const text = await setup().service.list("compact");
		expect(text).toMatch(/^reader: 2 tools \(read-only\)$/m);
		expect(text).toMatch(/^writer: 2 tools \(write-capable\)/m);
		expect(text).not.toMatch(/grep|bash/);
		expect(text).toContain("model p/own");
	});

	it("names one tool in the singular", async () => {
		await writeYaml(
			"version: 1\nagents:\n  solo:\n    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n",
		);
		expect(await setup().service.list("compact")).toBe("solo: 1 tool (read-only)");
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
		const other = await mkdtemp(join(tmpdir(), "omps-cwd-"));
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
		["a slash command after spaces", { agent: "reader", task: "  /omps-child-preflight" }, /slash command/],
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
			new RegExp(`omps cancel ${id}`),
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

describe("delegation targets", () => {
	const yaml = (builderTargets: string) => `version: 1
limits: { maxDepth: 3, maxConcurrentRuns: 4 }
agents:
  builder:
    persona: ./personas/reader.md
    tools: [read, omps]
    thinking: off
    delegates: ${builderTargets}
  writer:
    persona: ./personas/writer.md
    tools: [read, bash]
    thinking: off
  reader:
    persona: ./personas/reader.md
    tools: [read]
    thinking: off
  reviewer:
    persona: ./personas/reader.md
    tools: [read]
    thinking: off
`;
	/** The lineage a running `builder` child received, with the list captured at its start. */
	const child = (delegates: readonly string[], overrides: Partial<ChildLineage> = {}): ChildLineage => ({
		...fixtureLineage(join(dir, "config.yaml")),
		maxDepth: 3,
		agent: "builder",
		delegates,
		...overrides,
	});
	const launch = (service: ReturnType<typeof setup>["service"], agent: string) =>
		service.run("s1", { agent, task: "t" }, context);

	it("starts a target in both the captured and the fresh list", async () => {
		await writeYaml(yaml("[writer]"));
		const { service, calls } = setup(undefined, child(["writer"]));
		await launch(service, "writer");
		expect(calls).toHaveLength(1);
		expect(calls[0].request.agent.name).toBe("writer");
	});

	it("refuses a target outside the list before any process starts", async () => {
		await writeYaml(yaml("[writer]"));
		const { service, supervisor } = setup(undefined, child(["writer"]));
		await expect(launch(service, "reviewer")).rejects.toThrow(
			'builder cannot launch "reviewer": agents.builder.delegates allows writer.',
		);
		expect(supervisor).not.toHaveBeenCalled();
	});

	it("names every allowed target in the refusal", async () => {
		await writeYaml(yaml("[writer, reader]"));
		const { service } = setup(undefined, child(["writer", "reader"]));
		await expect(launch(service, "reviewer")).rejects.toThrow(/allows writer, reader\./);
	});

	it("refuses a target the operator removed from the list during the run", async () => {
		await writeYaml(yaml("[writer]"));
		const { service, supervisor } = setup(undefined, child(["writer", "reader"]));
		await expect(launch(service, "reader")).rejects.toThrow(/builder cannot launch "reader"/);
		expect(supervisor).not.toHaveBeenCalled();
	});

	it("does not widen a captured list when the operator adds a target during the run", async () => {
		await writeYaml(yaml("[writer, reviewer]"));
		const { service, supervisor } = setup(undefined, child(["writer"]));
		await expect(launch(service, "reviewer")).rejects.toThrow(/builder cannot launch "reviewer"/);
		expect(supervisor).not.toHaveBeenCalled();
	});

	it("lets a child started after the edit launch the added target", async () => {
		await writeYaml(yaml("[writer, reviewer]"));
		const { service, calls } = setup(undefined, child(["writer", "reviewer"]));
		await launch(service, "reviewer");
		expect(calls).toHaveLength(1);
	});

	it("refuses every launch when the delegating agent is no longer mapped", async () => {
		await writeYaml(yaml("[writer]"));
		const { service, supervisor } = setup(undefined, child(["writer"], { agent: "gone" }));
		await expect(launch(service, "writer")).rejects.toThrow(/gone is no longer mapped/);
		expect(supervisor).not.toHaveBeenCalled();
	});

	it("does not limit launches from the root session", async () => {
		await writeYaml(yaml("[writer]"));
		const { service, calls } = setup();
		await launch(service, "reviewer");
		expect(calls).toHaveLength(1);
	});

	it("reports the disallowed target before the depth limit", async () => {
		await writeYaml(yaml("[writer]"));
		const { service } = setup(undefined, child(["writer"], { depth: 3, parentRunId: "parent" }));
		await expect(launch(service, "reviewer")).rejects.toThrow(/builder cannot launch "reviewer"/);
	});

	it("shows each delegating agent's targets in the full root listing", async () => {
		await writeYaml(yaml("[writer, reader]"));
		const line = (await setup().service.list("full")).split("\n").find((text) => text.startsWith("builder:"))!;
		expect(line).toContain("delegation-capable (targets: writer, reader)");
		expect(line).not.toContain("can select write-capable targets");
	});

	it("shows the targets in the compact root listing", async () => {
		await writeYaml(yaml("[writer]"));
		const line = (await setup().service.list("compact")).split("\n").find((text) => text.startsWith("builder:"))!;
		expect(line).toBe("builder: 2 tools (read-only); delegation-capable: writer");
	});

	it("lists only the targets a restricted child may launch", async () => {
		await writeYaml(yaml("[writer, reader]"));
		const { service } = setup(undefined, child(["writer"]));
		const names = (await service.list("full")).split("\n").map((text) => text.split(":")[0]);
		expect(names).toEqual(["writer"]);
		expect(await service.list("compact")).toMatch(/^writer:/);
	});

	it("lists no target for a child whose agent is no longer mapped", async () => {
		await writeYaml(yaml("[writer]"));
		const { service } = setup(undefined, child(["writer"], { agent: "gone" }));
		expect(await service.list("full")).toBe("No mapped agent can be launched from here.");
	});

	it("records the launched agent and its captured list in the launch record", async () => {
		await writeYaml(yaml("[writer, reader]"));
		const { service, calls } = setup();
		await launch(service, "builder");
		expect(calls[0].request.nesting).toMatchObject({ agent: "builder", delegates: ["writer", "reader"] });
		await launch(service, "reviewer");
		expect(calls[1].request.nesting?.agent).toBe("reviewer");
		expect(calls[1].request.nesting?.delegates).toBeUndefined();
	});
});
