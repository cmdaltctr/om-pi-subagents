import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentSnapshot } from "./config.ts";
import type { RunView } from "./runs.ts";
import { redact, RunStore } from "./store.ts";

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "ompss-store-"));
});
afterEach(async () => {
	await chmod(root, 0o700).catch(() => undefined);
	await rm(root, { recursive: true, force: true });
});

const agent: AgentSnapshot = {
	name: "reader",
	personaPath: "/x/p.md",
	persona: "PERSONA TEXT",
	tools: ["read"],
	model: "p/m",
	thinking: "off",
	skills: [],
	extensions: [],
};
const view = (overrides: Partial<RunView> = {}): RunView => ({
	id: "11111111-2222-3333-4444-555555555555",
	owner: "session-abc",
	agent: "reader",
	cwd: "/work",
	state: "starting",
	startedAt: 1,
	...overrides,
});
const mode = async (path: string) => (await stat(path)).mode & 0o777;
// nosemgrep: AIK_ts_generic_path_traversal -- This test reader receives only paths below the generated run directory.
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("create", () => {
	it("makes private directories and files holding the launch inputs", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "SECRET TASK", cwd: "/work" });

		expect(await mode(join(root, "runs"))).toBe(0o700);
		expect(await mode(join(root, "runs", "session-abc"))).toBe(0o700);
		expect(await mode(files.directory)).toBe(0o700);
		for (const name of ["config.json", "persona.md", "status.json"])
			expect(await mode(join(files.directory, name)), name).toBe(0o600);

		expect(await readFile(files.personaFile, "utf8")).toBe("PERSONA TEXT");
		expect(await json(join(files.directory, "config.json"))).toMatchObject({
			runId: view().id,
			agent: { name: "reader", tools: ["read"], model: "p/m" },
			task: "SECRET TASK",
			cwd: "/work",
		});
		expect(await json(join(files.directory, "status.json"))).toMatchObject({ state: "starting", owner: "session-abc" });
	});

	it("tightens an existing, looser directory to owner-only", async () => {
		await mkdir(join(root, "runs", "session-abc"), { recursive: true, mode: 0o755 });
		await chmod(join(root, "runs"), 0o755);
		await chmod(join(root, "runs", "session-abc"), 0o755);
		await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		expect(await mode(join(root, "runs"))).toBe(0o700);
		expect(await mode(join(root, "runs", "session-abc"))).toBe(0o700);
	});

	it.each(["../escape", "a/b", "", ".", "..", "with\0nul", "a\\b"])(
		"rejects the unsafe session id %j",
		async (owner) => {
			await expect(
				new RunStore(join(root, "runs")).create(view({ owner }), { agent, task: "t", cwd: "/w" }),
			).rejects.toThrow(/unsafe/);
			expect(await readdir(root)).toEqual([]);
		},
	);

	it("rejects an unsafe run id", async () => {
		await expect(
			new RunStore(join(root, "runs")).create(view({ id: "../../etc" }), { agent, task: "t", cwd: "/w" }),
		).rejects.toThrow(/unsafe/);
	});

	it("fails when the directory cannot be created", async () => {
		await chmod(root, 0o500);
		await expect(new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" })).rejects.toThrow();
	});
});

describe("status and output", () => {
	it("writes status atomically and leaves no temporary file", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		await Promise.all(
			[1, 2, 3, 4, 5].map((n) => files.writeStatus(view({ state: n === 5 ? "completed" : "running", endedAt: n }))),
		);
		expect((await readdir(files.directory)).filter((name) => name.includes(".tmp"))).toEqual([]);
		expect(["running", "completed"]).toContain((await json(join(files.directory, "status.json"))).state);
	});

	it("writes a final answer as is, privately", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		await files.writeOutput("final", "the answer");
		expect(await readFile(join(files.directory, "output.md"), "utf8")).toBe("the answer");
		expect(await mode(join(files.directory, "output.md"))).toBe(0o600);
	});

	it("labels partial output clearly and names the reason", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		await files.writeOutput("partial", "half an ans", "run failed: extension error");
		const text = await readFile(join(files.directory, "output.md"), "utf8");
		expect(text).toMatch(/^> PARTIAL OUTPUT/);
		expect(text).toContain("run failed: extension error");
		expect(text).toContain("half an ans");
	});

	it("rejects, and leaves no temporary file, when the disk refuses the write", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		await chmod(files.directory, 0o500);
		await expect(files.writeOutput("final", "x")).rejects.toThrow();
		await chmod(files.directory, 0o700);
		expect((await readdir(files.directory)).filter((name) => name.includes(".tmp"))).toEqual([]);
	});
});

describe("notification record and output reading", () => {
	it("keeps delivery metadata in its own private file, apart from status.json", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		await files.writeStatus(view({ state: "completed" }));
		await files.writeNotification({ delivered: false, error: "parent is gone" });

		expect(await json(join(files.directory, "notification.json"))).toEqual({
			delivered: false,
			error: "parent is gone",
		});
		expect(await mode(join(files.directory, "notification.json"))).toBe(0o600);
		expect(await json(join(files.directory, "status.json"))).not.toHaveProperty("delivered");
	});

	it("reads the saved output, and nothing when none was saved", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		expect(await files.readOutput()).toBeUndefined();
		await files.writeOutput("final", "the answer");
		expect(await files.readOutput()).toBe("the answer");
	});
});

describe("logs", () => {
	it("streams events and stderr to private files, in order", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		const logs = files.openLogs();
		logs.event({ type: "a", n: 1 });
		logs.event({ type: "b", n: 2 });
		logs.stderr("warning one\n");
		logs.stderr("warning two\n");
		await logs.close();

		const events = (await readFile(join(files.directory, "events.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(events).toEqual([
			{ type: "a", n: 1 },
			{ type: "b", n: 2 },
		]);
		expect(await readFile(join(files.directory, "stderr.log"), "utf8")).toBe("warning one\nwarning two\n");
		expect(await mode(join(files.directory, "events.jsonl"))).toBe(0o600);
		expect(await mode(join(files.directory, "stderr.log"))).toBe(0o600);
	});

	it("redacts authentication fields and bearer tokens before writing", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		const logs = files.openLogs();
		logs.event({
			type: "x",
			headers: { Authorization: "Bearer abc.def", "X-Api-Key": "k-123" },
			nested: { access_token: "t1", list: [{ password: "pw" }] },
			text: "sent Bearer zzz.yyy ok",
		});
		logs.stderr("retry with api_key=sk-secret and token: hunter2\n");
		await logs.close();

		const written =
			(await readFile(join(files.directory, "events.jsonl"), "utf8")) +
			(await readFile(join(files.directory, "stderr.log"), "utf8"));
		for (const secret of ["abc.def", "k-123", "t1", "pw", "zzz.yyy", "sk-secret", "hunter2"])
			expect(written, secret).not.toContain(secret);
		expect(written).toContain("[redacted]");
		expect(written).toContain("sent Bearer [redacted] ok");
	});

	it("reports a write failure once, and closes without throwing", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		await mkdir(join(files.directory, "events.jsonl")); // a directory where the log file should be: the open fails
		const logs = files.openLogs();
		logs.event({ type: "lost" });
		const reason = await Promise.race([
			logs.failure,
			new Promise((done) => setTimeout(() => done("no failure"), 2000)),
		]);
		expect(reason).toMatch(/could not write events\.jsonl/);
		await expect(logs.close()).resolves.toBeUndefined();
	});
});

describe("log backlog", () => {
	it("fails the run's logging instead of queueing without limit when the disk cannot keep up", async () => {
		const files = await new RunStore(join(root, "runs")).create(view(), { agent, task: "t", cwd: "/w" });
		const logs = files.openLogs();
		logs.event({ big: "x".repeat(9 * 1024 * 1024) });
		logs.event({ next: 1 }); // no await between the two writes, so the first is still queued
		expect(await logs.failure).toMatch(/could not write events\.jsonl: the disk cannot keep up/);
		await logs.close();
	});
});

describe("redact", () => {
	it("leaves ordinary data unchanged and does not mutate its input", () => {
		const input = { type: "message", text: "hello", n: 3, nested: { ok: true } };
		expect(redact(input)).toEqual(input);
		const secret = { apiKey: "k" };
		redact(secret);
		expect(secret.apiKey).toBe("k");
	});
});
