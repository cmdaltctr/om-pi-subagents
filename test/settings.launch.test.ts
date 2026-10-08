import { writeFixturePersona } from "./fixtures/registry.ts";
import { readFile, realpath, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildLaunch } from "../src/runner.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";
import { PI_AVAILABLE, PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";
import { editRpcSettings } from "./fixtures/settings.ts";

const index = new URL("../src/index.ts", import.meta.url).pathname;
const guard = new URL("../src/child-guard.ts", import.meta.url).pathname;
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
async function waitFor(check: () => Promise<boolean>) {
	for (let attempts = 0; attempts < 400; attempts++) {
		if (await check()) return;
		await new Promise((done) => setTimeout(done, 50));
	}
	throw new Error("Saved-limit launch checkpoint timed out");
}
async function saved(fixture: PiFixture, filename: string) {
	// nosemgrep: AIK_ts_generic_path_traversal -- Fixture-owned mkdtemp directory followed by constant components; local scan evidence documents its source.
	const root = join(fixture.agentDir, "omps", "runs");
	const paths = (await readdir(root, { recursive: true }).catch(() => [])).filter((path) =>
		path.endsWith(`/${filename}`),
	);
	// nosemgrep: AIK_ts_generic_path_traversal -- Names come from readdir beneath this disposable fixture's run root.
	return Promise.all(paths.map(async (path) => ({ path, data: JSON.parse(await readFile(join(root, path), "utf8")) })));
}
async function launch(fixture: PiFixture, task: string): Promise<string> {
	const start = fixture.records.length;
	await fixture.send({ type: "prompt", message: `/omps run worker ${task}` });
	const notification = fixture.records.slice(start).find((record) => /Started run /.test(record.message ?? ""));
	expect(notification).toBeDefined();
	return /Started run ([a-f0-9-]+)/.exec(notification!.message)![1];
}

async function rootFixture() {
	return startPi({
		mcp: false,
		args: ["-e", index],
		env: { OMPS_PI_BIN: PI_BIN },
		seed: async ({ agentDir }) => {
			// nosemgrep: AIK_ts_generic_path_traversal -- Seed a constant persona filename in the disposable fixture directory.
			await writeFixturePersona(agentDir, "worker.md", "SAVED-LIMIT-WORKER");
			await writeFile(
				// nosemgrep: AIK_ts_generic_path_traversal -- Seed a constant registry filename in the disposable fixture directory.
				join(agentDir, "omps/config.yaml"),
				"version: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\nagents:\n  worker:\n    persona: ./personas/worker.md\n    tools: [read]\n    thinking: off\n",
			);
		},
	});
}

describe.skipIf(!PI_AVAILABLE)("saved limits through fresh real launches", () => {
	it.each([0, 6000])(
		"lower capacity preserves admitted work, completed output and one result per child (second launch delayed %i ms)",
		async (secondLaunchDelay) => {
			const fixture = await rootFixture();
			let releaseWorkers!: () => void;
			const workersHeld = new Promise<void>((resolve) => {
				releaseWorkers = resolve;
			});
			try {
				// Fixed reply delays can expire before a slower second child reaches readiness.
				fixture.model.script = async (body) => {
					if (JSON.stringify(body.messages).includes("SAVED-LIMIT-WORKER")) {
						await workersHeld;
						return { text: "Admitted worker completed" };
					}
					return { text: "Parent received results" };
				};
				const first = await launch(fixture, "first task");
				await waitFor(async () =>
					fixture.model.requests.some((body) => JSON.stringify(body).includes("SAVED-LIMIT-WORKER")),
				);
				if (secondLaunchDelay) await new Promise((done) => setTimeout(done, secondLaunchDelay));
				const ids = [first, await launch(fixture, "second task")];
				try {
					await waitFor(
						async () =>
							(await saved(fixture, "status.json")).filter(({ data }) => data.state === "running").length === 2,
					);
				} catch (error) {
					const states = (await saved(fixture, "status.json")).map(({ data }) => ({
						id: data.id,
						state: data.state,
						error: data.error,
					}));
					throw new Error(`${(error as Error).message}; synthetic child states: ${JSON.stringify(states)}`, {
						cause: error,
					});
				}
				const admitted = await saved(fixture, "status.json");
				await editRpcSettings(fixture, 1, "1");
				expect((await saved(fixture, "status.json")).every(({ data }) => data.state === "running")).toBe(true);
				const start = fixture.records.length;
				await fixture.send({ type: "prompt", message: "/omps run worker rejected task" });
				expect(
					fixture.records
						.slice(start)
						.some((record) => record.notifyType === "error" && /maxConcurrentRuns: 1/.test(record.message)),
				).toBe(true);
				expect(await saved(fixture, "config.json")).toHaveLength(2);
				releaseWorkers();
				await waitFor(async () =>
					(await saved(fixture, "status.json")).every(({ data }) => data.state === "completed"),
				);
				await Promise.all(
					ids.map((id) =>
						fixture.waitFor(
							(record) =>
								record.type === "message_end" &&
								record.message?.customType === "omps-result" &&
								record.message.details?.runId === id,
						),
					),
				);
				for (const id of ids) {
					expect(
						fixture.records.filter(
							(record) =>
								record.type === "message_end" &&
								record.message?.customType === "omps-result" &&
								record.message.details?.runId === id,
						),
					).toHaveLength(1);
					const configuration = (await saved(fixture, "config.json")).find(({ data }) => data.runId === id);
					expect(configuration).toBeDefined();
					const output = join(
						fixture.agentDir,
						"omps",
						"runs",
						configuration!.path.replace("config.json", "output.md"),
					);
					expect(await readFile(output, "utf8")).toContain("Admitted worker completed");
				}
				expect(admitted.some(({ data }) => alive(data.pid))).toBe(false);
				expect(await fixture.exit()).toBe(0);
			} finally {
				releaseWorkers();
				if (fixture.child.exitCode === null) await fixture.exit();
				await fixture.dispose();
			}
		},
	);

	it("depth zero blocks new launches without cancelling an admitted child", async () => {
		const fixture = await rootFixture();
		try {
			fixture.model.script = () => ({ hang: true });
			const id = await launch(fixture, "admitted task");
			await waitFor(async () => (await saved(fixture, "status.json")).some(({ data }) => data.state === "running"));
			const [{ data: before }] = await saved(fixture, "status.json");
			await editRpcSettings(fixture, 0, "0");
			const start = fixture.records.length;
			await fixture.send({ type: "prompt", message: "/omps run worker disabled task" });
			expect(
				fixture.records
					.slice(start)
					.some((record) => record.notifyType === "error" && /attempted depth 1.*maxDepth 0/.test(record.message)),
			).toBe(true);
			expect((await saved(fixture, "status.json"))[0].data.state).toBe("running");
			expect(alive(before.pid)).toBe(true);
			expect(await saved(fixture, "config.json")).toHaveLength(1);
			await fixture.send({ type: "prompt", message: `/omps cancel ${id}` });
			await waitFor(async () => (await saved(fixture, "status.json"))[0].data.state === "cancelled");
			expect(alive(before.pid)).toBe(false);
			expect(fixture.records.some((record) => record.message?.customType === "omps-result")).toBe(false);
			expect(await fixture.exit()).toBe(0);
		} finally {
			if (fixture.child.exitCode === null) await fixture.exit();
			await fixture.dispose();
		}
	});

	it.each([2, 3])("saved depth three preserves inherited ceiling %i", async (ceiling) => {
		let registryPath = "";
		const fixture = await startPi({
			mcp: false,
			env: { OMPS_PI_BIN: PI_BIN },
			seed: async ({ agentDir }) => {
				// nosemgrep: AIK_ts_generic_path_traversal -- Seed a constant persona filename in the disposable fixture directory.
				await writeFixturePersona(agentDir, "delegator.md", "SAVED-LIMIT-DELEGATOR");
				// nosemgrep: AIK_ts_generic_path_traversal -- Seed a constant persona filename in the disposable fixture directory.
				await writeFixturePersona(agentDir, "worker.md", "SAVED-NESTED-WORKER");
				await writeFile(
					// nosemgrep: AIK_ts_generic_path_traversal -- Seed a constant registry filename in the disposable fixture directory.
					join(agentDir, "omps/config.yaml"),
					`version: 1\nlimits: { maxDepth: ${ceiling}, maxConcurrentRuns: 4 }\nagents:\n  worker:\n    persona: ./personas/worker.md\n    tools: [omps]\n    thinking: off\n`,
				);
				// nosemgrep: AIK_ts_generic_path_traversal -- Canonicalise only the synthetic registry just written by this fixture.
				registryPath = await realpath(join(agentDir, "omps/config.yaml"));
			},
			launch: ({ cwd, agentDir }) =>
				buildLaunch({
					snapshot: {
						name: "delegator",
						personaPath: "unused",
						persona: "SAVED-LIMIT-DELEGATOR",
						tools: ["omps"],
						thinking: "off",
						skills: [],
						extensions: [],
					},
					cwd,
					// nosemgrep: AIK_ts_generic_path_traversal -- Constant persona filename in this disposable fixture's agent directory.
					personaFile: join(agentDir, "omps/personas", "delegator.md"),
					guardPath: guard,
					runToken: "settings-token",
					piBin: PI_BIN,
					parentModel: "fake/counter",
					lineage: { ...fixtureLineage(registryPath), maxDepth: ceiling },
				}),
		});
		try {
			await editRpcSettings(fixture, 0, "3");
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				if (!messages.includes("SAVED-NESTED-WORKER")) return { text: "Parent used nested results" };
				const hasTool = body.messages.some((message: { role: string }) => message.role === "tool");
				return hasTool
					? { text: "Worker received its descendant result" }
					: { tool: "omps", args: { action: "run", agent: "worker", task: "Next generation" } };
			};
			const id = await launch(fixture, "First nested generation");
			const result = await fixture.waitFor(
				(record) =>
					record.type === "message_end" &&
					record.message?.customType === "omps-result" &&
					record.message.details?.runId === id,
			);
			expect(result.message.details.state).toBe("completed");
			const configurations = await saved(fixture, "config.json");
			expect(configurations).toHaveLength(ceiling - 1);
			expect(configurations.every(({ data }) => data.nesting.maxDepth === ceiling)).toBe(true);
			expect(configurations.map(({ data }) => data.nesting.depth).sort()).toEqual(ceiling === 2 ? [2] : [2, 3]);
			const deepest = configurations.find(({ data }) => data.nesting.depth === ceiling)!;
			const events = await readFile(
				join(fixture.agentDir, "omps", "runs", deepest.path.replace("config.json", "events.jsonl")),
				"utf8",
			);
			expect(events).toContain(`attempted depth ${ceiling + 1}, limits.maxDepth ${ceiling}`);
			// Result delivery does not await the asynchronous status writes.
			await waitFor(async () => {
				const statuses = await saved(fixture, "status.json");
				return (
					statuses.length === configurations.length &&
					statuses.every(({ data }) => ["completed", "failed", "cancelled"].includes(data.state))
				);
			});
			expect((await saved(fixture, "status.json")).every(({ data }) => data.state === "completed")).toBe(true);
			expect((await saved(fixture, "status.json")).some(({ data }) => alive(data.pid))).toBe(false);
			expect(await fixture.exit()).toBe(0);
		} finally {
			if (fixture.child.exitCode === null) await fixture.exit();
			await fixture.dispose();
		}
	});
});
