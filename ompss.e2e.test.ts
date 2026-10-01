// The tool and the command driving a real child: background launch, status, cancel, completion and working directories.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it, vi } from "vitest";
import { PI_AVAILABLE } from "./test/fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { createRegistryStore } from "./config.ts";
import { registerOmpss } from "./index.ts";
import { createPersistence } from "./persistence.ts";
import { groupAlive } from "./runner.ts";
import { RunManager } from "./runs.ts";
import { createService } from "./service.ts";
import { RunStore } from "./store.ts";
import { createSupervisor } from "./supervisor.ts";
import type { Turn } from "./test/fixtures/fake-model.ts";
import { createWorkspace, PI_BIN, type Workspace } from "./test/fixtures/pi-rpc.ts";

const GUARD = new URL("./child-guard.ts", import.meta.url).pathname;

let workspace: Workspace | undefined;
let scratch: string | undefined;
let manager: RunManager | undefined;
const pids: number[] = [];

afterEach(async () => {
	if (manager) await manager.cancelAll("session-1");
	for (const pid of pids.splice(0)) if (groupAlive(pid)) process.kill(-pid, "SIGKILL");
	await workspace?.dispose();
	if (scratch) await rm(scratch, { recursive: true, force: true });
	workspace = scratch = manager = undefined;
});

async function setup(script: Turn[]) {
	workspace = await createWorkspace();
	workspace.model.script = script;
	scratch = await mkdtemp(join(tmpdir(), "ompss-e2e-"));
	await mkdir(join(scratch, "personas"));
	await writeFile(join(scratch, "personas/reader.md"), "You read.");
	await writeFile(
		join(scratch, "om-pi-subagents.yaml"),
		"version: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n",
	);

	const store = new RunStore(join(workspace.root, "store"));
	const persistence = createPersistence(store);
	manager = new RunManager(
		createSupervisor({
			piBin: PI_BIN,
			guardPath: GUARD,
			env: { ...process.env, ...workspace.isolationEnv },
			prepare: persistence.prepare,
			persist: persistence.persist,
			onChild: (_run, child) => void pids.push(child.pid!),
		}),
		{ onChange: persistence.onChange },
	);
	const service = createService({
		registry: createRegistryStore(join(scratch, "om-pi-subagents.yaml")),
		manager,
		directoryFor: (o, r) => store.directoryFor(o, r),
	});

	const tools = new Map<string, any>();
	const commands = new Map<string, any>();
	registerOmpss(
		{
			registerTool: (t: any) => tools.set(t.name, t),
			registerCommand: (n: string, c: any) => commands.set(n, c),
			on: () => undefined,
		} as any,
		() => service,
	);
	const notify = vi.fn();
	const ctx = {
		cwd: workspace.cwd,
		model: { provider: "fake", id: "counter" },
		sessionManager: { getSessionId: () => "session-1" },
		ui: { notify },
	};
	const tool = (params: object) =>
		tools
			.get("ompss")
			.execute("1", params, undefined, undefined, ctx)
			.then((r: any) => r.content[0].text as string);
	return { workspace, store, tool, command: (text: string) => commands.get("ompss").handler(text, ctx), notify };
}

const runId = (text: string) => /run ([0-9a-f-]{36})/.exec(text)![1];
const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 20_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

describe("background launch", () => {
	it("returns before the model answers, then reports status and cancels", async () => {
		const { workspace: ws, store, tool, notify, command } = await setup([{ hang: true }]);

		const started = await tool({ action: "run", agent: "reader", task: "explore" });
		expect(ws.model.requests.length).toBeLessThanOrEqual(1); // the model is still busy, or not reached yet
		const id = runId(started);
		expect(started).toContain(store.directoryFor("session-1", id));

		await waitFor(() => ws.model.requests.length === 1);
		expect(await tool({ action: "status", runId: id })).toMatch(/running/);

		await command(`cancel ${id}`);
		expect(notify).toHaveBeenLastCalledWith(expect.stringMatching(/stopping|already/), "info");
		await waitFor(async () => /cancelled/.test(await tool({ action: "status", runId: id })));
		expect(pids.every((pid) => !groupAlive(pid))).toBe(true);
	});

	it("completes a run and leaves the answer in the run's files", async () => {
		const { tool, store } = await setup([{ text: "the answer" }]);
		const id = runId(await tool({ action: "run", agent: "reader", task: "explore" }));
		await waitFor(async () => /completed/.test(await tool({ action: "status", runId: id })));
		await waitFor(async () => (await readdir(store.directoryFor("session-1", id))).includes("output.md"));
		expect(await readFile(join(store.directoryFor("session-1", id), "output.md"), "utf8")).toBe("the answer");
	});

	it("rejects a second launch while the first is active, naming it", async () => {
		const { tool } = await setup([{ hang: true }]);
		const id = runId(await tool({ action: "run", agent: "reader", task: "one" }));
		await expect(tool({ action: "run", agent: "reader", task: "two" })).rejects.toThrow(new RegExp(id));
	});
});

describe("working directory", () => {
	it("defaults to the parent's for the command, and honours an explicit one for the tool", async () => {
		const { tool, command, store, workspace: ws } = await setup([{ text: "ok" }]);
		const other = join(ws.root, "elsewhere");
		await mkdir(other);

		await command("run reader from the command");
		await waitFor(async () => /completed/.test(await tool({ action: "status" })));
		const viaTool = runId(await tool({ action: "run", agent: "reader", task: "from the tool", cwd: other }));
		await waitFor(async () => /completed/.test(await tool({ action: "status", runId: viaTool })));

		const cwds = await Promise.all(
			(await readdir(join(ws.root, "store", "session-1"))).map(
				// nosemgrep: AIK_ts_generic_path_traversal -- The store root is generated, the owner is fixed and directoryFor validates each run id.
				async (id) => JSON.parse(await readFile(join(store.directoryFor("session-1", id), "config.json"), "utf8")).cwd,
			),
		);
		expect(cwds.sort()).toEqual([ws.cwd, other].sort());
	});
});
