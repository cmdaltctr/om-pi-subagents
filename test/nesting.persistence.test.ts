import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createPersistence } from "../persistence.ts";
import { RunStore } from "../store.ts";

it("saves fresh limits and effective lineage in private configuration and status evidence", async () => {
	const root = await mkdtemp(join(tmpdir(), "ompss-nested-evidence-"));
	const limits = Object.freeze({ maxConcurrentRuns: 4, maxDepth: 5 });
	const nesting = Object.freeze({
		registryPath: join(root, "registry.yaml"),
		depth: 2,
		maxDepth: 3,
		rootSessionId: "root-session",
		parentRunId: "parent-run",
	});
	const view = {
		id: "grandchild-run",
		owner: "child-session",
		agent: "writer",
		cwd: root,
		state: "starting" as const,
		startedAt: 1,
		limits,
		nesting,
	};
	const store = new RunStore(join(root, "runs"));
	const persistence = createPersistence(store);
	const prepared = await persistence.prepare(view, {
		agent: {
			name: "writer",
			personaPath: "unused",
			persona: "Write the task.",
			tools: ["write"],
			thinking: "off",
			skills: [],
			extensions: [],
		},
		task: "Write the task",
		cwd: root,
		limits,
		nesting,
	});
	try {
		persistence.onChange({ ...view, state: "running" });
		await persistence.flush();
		const directory = store.directoryFor(view.owner, view.id);
		const config = JSON.parse(await readFile(join(directory, "config.json"), "utf8"));
		const status = JSON.parse(await readFile(join(directory, "status.json"), "utf8"));
		expect(config).toMatchObject({ runId: view.id, owner: view.owner, limits, nesting });
		expect(status).toMatchObject({ state: "running", limits, nesting });
		expect((await stat(directory)).mode & 0o777).toBe(0o700);
		for (const name of ["config.json", "status.json", "persona.md"])
			expect((await stat(join(directory, name))).mode & 0o777).toBe(0o600);
	} finally {
		await prepared.logs.close();
		await rm(root, { recursive: true, force: true });
	}
});
