import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDetailReader, DetailSelection, MAX_DETAIL_BYTES } from "../src/details.ts";
import { ObservationStore, type ObservedNode } from "../src/observation.ts";
import { RunStore } from "../src/store.ts";
import type { RunView } from "../src/runs.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	return { ...original, open: vi.fn(original.open) };
});
let root: string;
let directory: string;
let observations: ObservationStore;
const view = (patch: Partial<RunView> = {}): RunView => ({
	id: "direct",
	owner: "session",
	agent: "worker",
	cwd: "/work",
	state: "completed",
	startedAt: 1,
	endedAt: 2,
	nesting: { registryPath: "/registry", rootSessionId: "session", depth: 1, maxDepth: 3 },
	...patch,
});

beforeEach(async () => {
	root = await fs.mkdtemp(join(tmpdir(), "omps-details-"));
	observations = new ObservationStore();
	observations.updateRoot(view(), { model: "fake/counter" });
	observations.bindChildSession({ owner: "session", runId: "direct" }, "child-session");
	const files = await new RunStore(root).create(view(), {
		agent: {
			name: "worker",
			personaPath: "unused",
			persona: "PERSONA MUST NOT BE READ",
			tools: [],
			thinking: "off",
			skills: [],
			extensions: [],
		},
		task: "Selected task",
		cwd: "/work",
		nesting: view().nesting,
	});
	directory = files.directory;
	await files.writeOutput("final", "Selected final answer");
	await fs.writeFile(join(directory, "events.jsonl"), "RAW EVENTS MUST NOT BE READ");
	await fs.writeFile(join(directory, "stderr.log"), "STDERR MUST NOT BE READ");
	vi.clearAllMocks();
});
afterEach(async () => {
	vi.clearAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

describe("lazy selected details", () => {
	it("preserves printable CSI text before a bell with the Node 22-compatible Bun stripper", () => {
		const script = `
			import assert from "node:assert/strict";
			import { detailText } from ${JSON.stringify(new URL("../src/details.ts", import.meta.url).href)};
			for (const text of ${JSON.stringify([
				"\x1b[31manswer\x07\u2066",
				"\x9b31manswer\x07",
				"\x1b]8;;https://example.invalid/\x07answer\x1b]8;;\x07",
			])}) assert.equal(detailText(text), "answer");
		`;
		const result = spawnSync("bun", ["-e", script], { encoding: "utf8", shell: false, timeout: 10_000 });
		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr).toBe(0);
	});
	it("performs no I/O until an owned node is selected and reads only fixed evidence filenames", async () => {
		const reader = createDetailReader(root, observations, "session");
		expect(fs.open).not.toHaveBeenCalled();
		const result = await reader("direct", "direct");
		expect(result.task).toBe("Selected task");
		expect(result.output).toBe("Selected final answer");
		expect(result.node).toMatchObject({ state: "completed", model: "fake/counter" });
		expect(vi.mocked(fs.open).mock.calls.map(([path]) => String(path).split("/").at(-1))).toEqual([
			"config.json",
			"output.md",
		]);
		expect(JSON.stringify(result)).not.toMatch(/PERSONA MUST|RAW EVENTS|STDERR MUST/);
	});
	it.each(["../escape", "foreign", "", "a/b", ".", "x".repeat(129)])(
		"rejects unknown or invalid identity %j before reading",
		async (id) => {
			await expect(createDetailReader(root, observations, "session")("direct", id)).rejects.toThrow(
				/unknown|invalid|owned/i,
			);
			expect(fs.open).not.toHaveBeenCalled();
		},
	);
	it("rejects a foreign viewing owner before touching files", async () => {
		await expect(createDetailReader(root, observations, "foreign")("direct", "direct")).rejects.toThrow(
			/unknown|owned/i,
		);
		expect(fs.open).not.toHaveBeenCalled();
	});
	it("reads an observed descendant from its immediate owner's directory", async () => {
		const descendant = view({
			id: "descendant",
			owner: "child-session",
			nesting: { ...view().nesting!, depth: 2, parentRunId: "direct" },
		});
		const files = await new RunStore(root).create(descendant, {
			agent: {
				name: "worker",
				personaPath: "unused",
				persona: "Private persona",
				tools: [],
				thinking: "off",
				skills: [],
				extensions: [],
			},
			task: "Descendant task",
			cwd: "/work",
			nesting: descendant.nesting,
		});
		await files.writeOutput("final", "Descendant answer");
		observations.ingest(
			{ owner: "session", runId: "direct" },
			{
				owner: "child-session",
				rootSessionId: "session",
				runId: "descendant",
				parentRunId: "direct",
				depth: 2,
				agent: "worker",
				state: "completed",
				startedAt: 1,
				endedAt: 2,
				revision: 1,
				activeTools: [],
			},
		);
		const result = await createDetailReader(root, observations, "session")("direct", "descendant");
		expect(result.task).toBe("Descendant task");
		expect(result.output).toBe("Descendant answer");
	});
	it("rejects a symlinked run directory before reading its files", async () => {
		const moved = join(root, "moved");
		await fs.rename(directory, moved);
		await fs.symlink(moved, directory, "dir");
		await expect(createDetailReader(root, observations, "session")("direct", "direct")).rejects.toThrow(
			/outside|symlink/i,
		);
		expect(fs.open).not.toHaveBeenCalled();
	});
	it.each(["config.json", "output.md"])("rejects a symlinked %s instead of reading its target", async (filename) => {
		const target = join(root, "outside.txt");
		await fs.writeFile(target, "SENSITIVE TARGET");
		// nosemgrep: AIK_ts_generic_path_traversal -- filename is one of two test constants within a synthetic mkdtemp run directory.
		await fs.unlink(join(directory, filename));
		// nosemgrep: AIK_ts_generic_path_traversal -- The test symlink and its target exist only inside the disposable fixture root.
		await fs.symlink(target, join(directory, filename));
		await expect(createDetailReader(root, observations, "session")("direct", "direct")).rejects.toThrow(
			/outside|symlink/i,
		);
		expect(vi.mocked(fs.open).mock.calls.some(([path]) => String(path) === target)).toBe(false);
	});
	it("refuses mismatched saved identity before opening output", async () => {
		const config = JSON.parse(await fs.readFile(join(directory, "config.json"), "utf8"));
		await fs.writeFile(join(directory, "config.json"), JSON.stringify({ ...config, owner: "foreign" }));
		await expect(createDetailReader(root, observations, "session")("direct", "direct")).rejects.toThrow(
			/identity|lineage/i,
		);
		expect(vi.mocked(fs.open).mock.calls.some(([path]) => String(path).endsWith("output.md"))).toBe(false);
	});
	it("never reads whole oversized files before applying the byte bound", async () => {
		await fs.writeFile(join(directory, "output.md"), "x".repeat(MAX_DETAIL_BYTES * 4));
		const originalOpen = vi.mocked(fs.open).getMockImplementation()!;
		const reads: unknown[][][] = [];
		const boundedOpen: typeof fs.open = async (path, flags, mode) => {
			const file = await originalOpen(path, flags, mode);
			reads.push(vi.spyOn(file, "read").mock.calls);
			return file;
		};
		vi.mocked(fs.open).mockImplementationOnce(boundedOpen).mockImplementationOnce(boundedOpen);
		await createDetailReader(root, observations, "session")("direct", "direct");
		expect(reads).toHaveLength(2);
		for (const calls of reads) {
			expect(calls.length).toBeGreaterThan(0);
			for (const args of calls) {
				const buffer = args[0];
				if (!Buffer.isBuffer(buffer)) throw new Error("Expected bounded-buffer reads");
				expect(buffer.byteLength).toBeLessThanOrEqual(MAX_DETAIL_BYTES + 1);
			}
		}
	});

	it("bounds oversized output reads and labels truncation with its saved location", async () => {
		await fs.writeFile(join(directory, "output.md"), "x".repeat(MAX_DETAIL_BYTES * 4));
		const result = await createDetailReader(root, observations, "session")("direct", "direct");
		expect(result.output).toHaveLength(MAX_DETAIL_BYTES);
		expect(result.outputTruncated).toBe(true);
		expect(result.outputPath).toBe(await fs.realpath(join(directory, "output.md")));
	});
	it("labels missing output unavailable while retaining known state and task", async () => {
		await fs.unlink(join(directory, "output.md"));
		const result = await createDetailReader(root, observations, "session")("direct", "direct");
		expect(result.output).toBeUndefined();
		expect(result.task).toBe("Selected task");
		expect(result.node.state).toBe("completed");
	});
	it("labels failed saved output partial and sanitises displayed task and output", async () => {
		const failed = view({ id: "failed", state: "failed" });
		observations.updateRoot(failed);
		const files = await new RunStore(root).create(failed, {
			agent: {
				name: "worker",
				personaPath: "unused",
				persona: "Private",
				tools: [],
				thinking: "off",
				skills: [],
				extensions: [],
			},
			task: "\x1b[2Jtask\u202e",
			cwd: "/work",
			nesting: failed.nesting,
		});
		await files.writeOutput("partial", "\x1b[31manswer\x07\u2066", "Failed");
		const result = await createDetailReader(root, observations, "session")("failed", "failed");
		expect(result.partial).toBe(true);
		expect(result.task).toBe("task");
		expect(result.output).toContain("answer");
		expect(result.output).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
	});
	it("labels absent run files unavailable and never reads a sibling's output", async () => {
		observations.updateRoot(view({ id: "not-saved", state: "starting", endedAt: undefined }));
		const result = await createDetailReader(root, observations, "session")("not-saved", "not-saved");
		expect(result.task).toBeUndefined();
		expect(result.output).toBeUndefined();
		expect(fs.open).not.toHaveBeenCalled();
	});
});

const deferred = <T>() => {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
};
const result = (id: string) => ({
	node: { runId: id } as ObservedNode,
	task: id,
	output: id,
	taskTruncated: false,
	outputTruncated: false,
	partial: false,
	outputPath: "/saved/output.md",
});

describe("selection and session generations", () => {
	it("drops a late read after another node is selected and aborts the old signal", async () => {
		const pending = deferred<ReturnType<typeof result>>();
		let oldSignal: AbortSignal | undefined;
		const selection = new DetailSelection(async (_root, id, signal) => {
			if (id === "old") {
				oldSignal = signal;
				return pending.promise;
			}
			return result(id);
		});
		const old = selection.select("direct", "old");
		expect((await selection.select("direct", "new"))?.task).toBe("new");
		pending.resolve(result("old"));
		expect(await old).toBeUndefined();
		expect(oldSignal?.aborted).toBe(true);
	});
	it.each(["close", "session replacement"])("drops late reads after %s", async (kind) => {
		const pending = deferred<ReturnType<typeof result>>();
		let live = true;
		const selection = new DetailSelection(
			async () => pending.promise,
			() => live,
		);
		const reading = selection.select("direct", "old");
		if (kind === "close") selection.close();
		else live = false;
		pending.resolve(result("old"));
		expect(await reading).toBeUndefined();
	});
	it("contains stale read errors after closing", async () => {
		const selection = new DetailSelection(async () => {
			await Promise.resolve();
			throw new Error("late failure");
		});
		const reading = selection.select("direct", "old");
		selection.close();
		await expect(reading).resolves.toBeUndefined();
	});
});
