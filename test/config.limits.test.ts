import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistryStore, loadRegistry } from "../src/config.ts";

let dir: string;
let path: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "omps-limits-"));
	path = join(dir, "om-pi-subagents.yaml");
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const write = (limits: string) => writeFile(path, `version: 1\n${limits}agents: {}\n`);

describe("configuration limits", () => {
	it("gives a missing registry an empty mapping and default limits", async () => {
		const snapshot = await loadRegistry(path);
		expect(snapshot.limits).toEqual({ maxConcurrentRuns: 1, maxDepth: 1 });
		expect(snapshot.agents.size).toBe(0);
	});

	it.each([
		["", 1, 1],
		["limits: {}\n", 1, 1],
		["limits:\n  maxConcurrentRuns: 4\n", 4, 1],
		["limits:\n  maxDepth: 0\n", 1, 0],
		["limits:\n  maxConcurrentRuns: 7\n  maxDepth: 5\n", 7, 5],
		[
			`limits:\n  maxConcurrentRuns: ${Number.MAX_SAFE_INTEGER}\n  maxDepth: ${Number.MAX_SAFE_INTEGER}\n`,
			Number.MAX_SAFE_INTEGER,
			Number.MAX_SAFE_INTEGER,
		],
	])("accepts omitted, partial and operator-chosen limits %j", async (yaml, maxConcurrentRuns, maxDepth) => {
		await write(yaml);
		expect((await loadRegistry(path)).limits).toEqual({ maxConcurrentRuns, maxDepth });
	});

	it.each(["null", "[]", "false", "'4'", "4"])("rejects limits shape %s", async (value) => {
		await write(`limits: ${value}\n`);
		await expect(loadRegistry(path)).rejects.toThrow(/limits:.*mapping/);
	});

	it("names unknown limit keys", async () => {
		await write("limits:\n  maxChildren: 4\n");
		await expect(loadRegistry(path)).rejects.toThrow(/limits\.maxChildren:.*unknown field/);
	});

	it.each(["maxConcurrentRuns", "maxDepth"])("validates the exact field %s", async (field) => {
		for (const value of [
			"null",
			"[]",
			"{}",
			"true",
			"'4'",
			"1.5",
			"-1",
			"9007199254740992",
			".inf",
			".nan",
			...(field === "maxConcurrentRuns" ? ["0"] : []),
		]) {
			await write(`limits:\n  ${field}: ${value}\n`);
			await expect(loadRegistry(path), value).rejects.toThrow(new RegExp(`limits\\.${field}:.*safe integer`));
		}
	});
});

describe("coherent registry snapshots", () => {
	async function revision(capacity: number, tool: string) {
		await mkdir(join(dir, "personas"), { recursive: true });
		await writeFile(join(dir, "personas", "reader.md"), "Read the task.");
		await writeFile(
			path,
			`version: 1\nlimits:\n  maxConcurrentRuns: ${capacity}\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [${tool}]\n    thinking: off\n`,
		);
	}

	it("returns immutable limits and personas from each refresh", async () => {
		await revision(4, "read");
		const store = createRegistryStore(path);
		const first = await store.refresh();
		await revision(7, "write");
		const second = await store.refresh();
		expect(first.limits.maxConcurrentRuns).toBe(4);
		expect(first.agents.get("reader")?.tools).toEqual(["read"]);
		expect(second.limits.maxConcurrentRuns).toBe(7);
		expect(second.agents.get("reader")?.tools).toEqual(["write"]);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.limits)).toBe(true);
		expect(Object.isFrozen(first.agents)).toBe(true);
		expect("set" in first.agents).toBe(false);
	});

	it("keeps a caller's snapshot when another refresh wins before its continuation", async () => {
		await revision(4, "read");
		const store = createRegistryStore(path);
		let release!: () => void;
		const gate = new Promise<void>((done) => {
			release = done;
		});
		const ready = store.refresh();
		const pending = ready.then(async (snapshot) => {
			await gate;
			return snapshot;
		});
		void pending.catch(() => undefined);
		await ready;
		await revision(7, "write");
		const later = await store.refresh();
		release();
		const earlier = await pending;
		expect(earlier).toMatchObject({ limits: { maxConcurrentRuns: 4 } });
		expect(earlier.agents.get("reader")?.tools).toEqual(["read"]);
		expect(later).toMatchObject({ limits: { maxConcurrentRuns: 7 } });
		expect(later.agents.get("reader")?.tools).toEqual(["write"]);
	});

	it("drops stale settings when limits fail validation and recovers after repair", async () => {
		await revision(4, "read");
		const store = createRegistryStore(path);
		await store.refresh();
		await write("limits:\n  maxDepth: false\n");
		await expect(store.refresh()).rejects.toThrow(/limits\.maxDepth/);
		expect(() => store.get("reader")).toThrow(/limits\.maxDepth/);
		expect(() => store.list()).toThrow(/limits\.maxDepth/);
		await revision(7, "write");
		expect((await store.refresh()).limits.maxConcurrentRuns).toBe(7);
	});
});
