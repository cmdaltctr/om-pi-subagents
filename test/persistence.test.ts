// A real run, recorded by the store: files, permissions, logs, partial labels and no leaked secrets.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createPersistence } from "../src/persistence.ts";
import { RunManager } from "../src/runs.ts";
import { createSupervisor } from "../src/supervisor.ts";
import { RunStore } from "../src/store.ts";
import { createWorkspace, PI_AVAILABLE, PI_BIN, type Workspace } from "./fixtures/pi-rpc.ts";

const GUARD = new URL("../src/child-guard.ts", import.meta.url).pathname;
const THROWING = new URL("./fixtures/throwing-handler-extension.ts", import.meta.url).pathname;

let workspace: Workspace | undefined;
afterEach(async () => {
	await workspace?.dispose();
	workspace = undefined;
});

async function run(options: {
	script: Parameters<typeof Array.prototype.concat>[0];
	extensions?: string[];
	killGraceMs?: number;
}) {
	workspace = await createWorkspace();
	workspace.model.script = options.script;
	const store = new RunStore(join(workspace.root, "store"));
	const persistence = createPersistence(store);
	const finished = new Map<string, (view: unknown) => void>();
	const supervisor = createSupervisor({
		piBin: PI_BIN,
		guardPath: GUARD,
		parentModel: "fake/counter",
		env: { ...process.env, ...workspace.isolationEnv },
		prepare: persistence.prepare,
		persist: persistence.persist,
		onChild: persistence.onChild,
		onReady: persistence.onReady,
	});
	const manager = new RunManager(supervisor, {
		onChange: persistence.onChange,
		onTerminal: (view) => finished.get(view.id)?.(view),
	});
	const agent = {
		name: "reader",
		personaPath: "unused",
		persona: "PERSONA TEXT",
		tools: ["read"],
		thinking: "off",
		skills: [],
		extensions: options.extensions ?? [],
	};
	const started = manager.start("session-1", { agent, task: "SECRET TASK", cwd: workspace.cwd });
	const final = await new Promise<Awaited<ReturnType<typeof manager.status>>>((resolve) => {
		finished.set(started.id, resolve as never);
		if (["completed", "failed", "cancelled"].includes(manager.status("session-1", started.id).state))
			resolve(manager.status("session-1", started.id));
	});
	await new Promise((done) => setTimeout(done, 100)); // let the last status write land
	return { final, directory: persistence.directoryOf(started.id)!, workspace: workspace! };
}

const mode = async (path: string) => (await stat(path)).mode & 0o777;

describe.skipIf(!PI_AVAILABLE)("a completed run", () => {
	it("leaves private files: launch inputs, terminal status, event and stderr logs, and the answer", async () => {
		const { final, directory } = await run({ script: [{ text: "the final answer" }] });
		expect(final.state).toBe("completed");

		expect((await readdir(directory)).sort()).toEqual([
			"config.json",
			"events.jsonl",
			"output.md",
			"persona.md",
			"status.json",
			"stderr.log",
		]);
		expect(await readFile(join(directory, "output.md"), "utf8")).toBe("the final answer");
		expect(await readFile(join(directory, "persona.md"), "utf8")).toBe("PERSONA TEXT");
		expect(JSON.parse(await readFile(join(directory, "config.json"), "utf8")).task).toBe("SECRET TASK");
		expect(JSON.parse(await readFile(join(directory, "status.json"), "utf8"))).toMatchObject({
			state: "completed",
			directory,
		});

		const events = (await readFile(join(directory, "events.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line).type);
		expect(events).toContain("agent_settled");
		for (const name of await readdir(directory)) expect(await mode(join(directory, name)), name).toBe(0o600);
		expect(await mode(directory)).toBe(0o700);
	});

	it("writes no credential into any file", async () => {
		const { directory, workspace: ws } = await run({ script: [{ text: "ok" }] });
		const everything =
			// nosemgrep: AIK_ts_generic_path_traversal -- The run directory is generated and readdir names cannot contain path separators.
			(await Promise.all((await readdir(directory)).map((name) => readFile(join(directory, name), "utf8")))).join("\n");
		expect(everything).not.toContain("fake-key");
		expect(ws.model.requests).toHaveLength(1);
	});
});

describe.skipIf(!PI_AVAILABLE)("the child's process id", () => {
	it("is recorded in status.json while the run lives, so an operator can find it", async () => {
		const { directory } = await run({ script: [{ text: "x" }] });
		const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
		expect(status.pid).toEqual(expect.any(Number));
	});
});

describe("delivery result", () => {
	it("is remembered for status and saved in notification.json", async () => {
		const { createPersistence: create } = await import("../src/persistence.ts");
		const { RunStore: Store } = await import("../src/store.ts");
		const os = await import("node:os");
		const fs = await import("node:fs/promises");
		const root = await fs.mkdtemp(join(os.tmpdir(), "omps-delivery-"));
		try {
			const persistence = create(new Store(join(root, "runs")));
			const view = {
				id: "11111111-2222-3333-4444-555555555555",
				owner: "s1",
				agent: "a",
				cwd: "/w",
				state: "completed" as const,
				startedAt: 1,
			};
			const prepared = await persistence.prepare(view, {
				agent: { name: "a", personaPath: "p", persona: "x", tools: [], thinking: "off", skills: [], extensions: [] },
				task: "t",
				cwd: "/w",
			});
			await prepared.logs.close();
			expect(persistence.deliveryOf(view.id)).toBeUndefined();
			await persistence.recordDelivery(view, { delivered: false, error: "parent is gone" });
			expect(persistence.deliveryOf(view.id)).toEqual({ delivered: false, error: "parent is gone" });
			expect(
				JSON.parse(await fs.readFile(join(persistence.directoryOf(view.id)!, "notification.json"), "utf8")),
			).toEqual({ delivered: false, error: "parent is gone" });
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});

describe("flush", () => {
	it("waits for status writes that the run table did not await", async () => {
		const { createPersistence: create } = await import("../src/persistence.ts");
		const { RunStore: Store } = await import("../src/store.ts");
		const { mkdtemp: tmp, rm: remove, readFile: read } = await import("node:fs/promises");
		const root = await tmp(join((await import("node:os")).tmpdir(), "omps-flush-"));
		try {
			const persistence = create(new Store(join(root, "runs")));
			const view = {
				id: "11111111-2222-3333-4444-555555555555",
				owner: "s1",
				agent: "a",
				cwd: "/w",
				state: "starting" as const,
				startedAt: 1,
			};
			const prepared = await persistence.prepare(view, {
				agent: { name: "a", personaPath: "p", persona: "x", tools: [], thinking: "off", skills: [], extensions: [] },
				task: "t",
				cwd: "/w",
			});
			await prepared.logs.close();
			persistence.onChange({ ...view, state: "cancelled", endedAt: 2 });
			await persistence.flush();
			expect(JSON.parse(await read(join(persistence.directoryOf(view.id)!, "status.json"), "utf8")).state).toBe(
				"cancelled",
			);
		} finally {
			await remove(root, { recursive: true, force: true });
		}
	});
});

describe.skipIf(!PI_AVAILABLE)("the resolved model", () => {
	it("is recorded in status.json once the child is ready, and kept through the terminal state", async () => {
		const { final, directory } = await run({ script: [{ text: "x" }] });
		expect(final.state).toBe("completed");
		expect(JSON.parse(await readFile(join(directory, "status.json"), "utf8"))).toMatchObject({
			state: "completed",
			model: "fake/counter",
		});
	});
});

describe.skipIf(!PI_AVAILABLE)("a failed run", () => {
	it("keeps the answer that arrived, labelled partial, with the reason", async () => {
		const { final, directory } = await run({ script: [{ text: "a fine answer" }], extensions: [THROWING] });
		expect(final.state).toBe("failed");
		const output = await readFile(join(directory, "output.md"), "utf8");
		expect(output).toMatch(/^> PARTIAL OUTPUT/);
		expect(output).toContain("extension error in turn_end");
		expect(output).toContain("a fine answer");
		expect(JSON.parse(await readFile(join(directory, "status.json"), "utf8"))).toMatchObject({ state: "failed" });
	});
});
