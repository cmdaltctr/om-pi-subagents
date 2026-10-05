import * as fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRegistry } from "./config.ts";
import {
	createDisplayPreferences,
	displayPreferencesPath,
	readLimitSettings,
	saveLimitSetting,
} from "./settings-persistence.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	return { ...original, rename: vi.fn(original.rename), open: vi.fn(original.open) };
});

let root: string;
let registry: string;
let display: string;
const yaml = `# Operator mappings\nversion: 1\nlimits:\n  maxDepth: 3 # root starts at zero\n  maxConcurrentRuns: 4 # per parent\nagents:\n  reader:\n    persona: reader.md\n    tools: [read]\n    thinking: off\n    model: fake/counter\n`;

beforeEach(async () => {
	vi.clearAllMocks();
	root = await fs.mkdtemp(join(tmpdir(), "ompss-settings-"));
	registry = join(root, "registry.yaml");
	display = join(root, "config", "pi-subagents", "config.json");
	await fs.writeFile(join(root, "reader.md"), "Read the selected task.");
	await fs.writeFile(registry, yaml);
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(root, { recursive: true, force: true });
});

describe("execution-limit persistence", () => {
	it("preserves YAML comments, mappings and the other limit", async () => {
		const displayed = await readLimitSettings(registry);
		await saveLimitSetting(displayed, "maxDepth", 0);
		const saved = await fs.readFile(registry, "utf8");
		expect(saved).toContain("maxDepth: 0 # root starts at zero");
		expect(saved).toContain("maxConcurrentRuns: 4 # per parent");
		expect(saved).toContain("# Operator mappings");
		expect(saved).toContain("persona: reader.md");
		const loaded = await loadRegistry(registry);
		expect(loaded.limits).toEqual({ maxDepth: 0, maxConcurrentRuns: 4 });
		expect(loaded.agents.get("reader")?.model).toBe("fake/counter");
		expect((await fs.stat(registry)).mode & 0o777).toBe(0o600);
	});

	it.each([
		["maxDepth", -1],
		["maxDepth", 1.5],
		["maxDepth", "2"],
		["maxConcurrentRuns", 0],
		["maxConcurrentRuns", Number.MAX_SAFE_INTEGER + 1],
		["maxConcurrentRuns", Infinity],
		["other", 2],
	])("rejects invalid %s=%s without touching the file", async (key, value) => {
		const displayed = await readLimitSettings(registry);
		await expect(saveLimitSetting(displayed, key as "maxDepth", value as number)).rejects.toThrow(
			/safe integer|unknown limit/i,
		);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
	});

	it.each([
		"version: [",
		"version: 1\nagents: {}\nversion: 1\n",
		"version: 1\nagents: {}\nextra: true\n",
		yaml.replace("reader.md", "missing.md"),
	])("refuses malformed or invalid registries without replacing them: %s", async (text) => {
		await fs.writeFile(registry, text);
		await expect(readLimitSettings(registry)).rejects.toThrow();
		expect(await fs.readFile(registry, "utf8")).toBe(text);
	});

	it("requires explicit confirmation before creating a missing registry", async () => {
		const missing = join(root, "missing", "registry.yaml");
		const displayed = await readLimitSettings(missing);
		expect(displayed.missing).toBe(true);
		await expect(saveLimitSetting(displayed, "maxDepth", 2)).rejects.toThrow(/confirm/i);
		await expect(fs.stat(missing)).rejects.toMatchObject({ code: "ENOENT" });
		await saveLimitSetting(displayed, "maxDepth", 2, true);
		expect((await loadRegistry(missing)).limits).toEqual({ maxDepth: 2, maxConcurrentRuns: 1 });
		expect((await loadRegistry(missing)).agents.size).toBe(0);
	});

	it("rejects external edits since display", async () => {
		const displayed = await readLimitSettings(registry);
		const newer = yaml.replace("maxConcurrentRuns: 4", "maxConcurrentRuns: 5");
		await fs.writeFile(registry, newer);
		await expect(saveLimitSetting(displayed, "maxDepth", 2)).rejects.toThrow(/reopen settings/i);
		expect(await fs.readFile(registry, "utf8")).toBe(newer);
	});

	it("serialises two sessions saving the same revision and rejects the stale writer", async () => {
		const one = await readLimitSettings(registry);
		const two = await readLimitSettings(registry);
		const results = await Promise.allSettled([
			saveLimitSetting(one, "maxDepth", 2),
			saveLimitSetting(two, "maxConcurrentRuns", 5),
		]);
		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
		await saveLimitSetting(await readLimitSettings(registry), "maxDepth", 6);
		expect((await loadRegistry(registry)).limits.maxDepth).toBe(6);
	});

	it("honours a cross-process file lock without blocking saves to another destination", async () => {
		const displayed = await readLimitSettings(registry);
		const lock = `${registry}.lock`;
		await fs.writeFile(lock, "other session", { flag: "wx", mode: 0o600 });
		const saving = saveLimitSetting(displayed, "maxDepth", 2);
		let settled = false;
		const outcome = saving.then(
			() => {
				settled = true;
				return undefined;
			},
			(error: unknown) => {
				settled = true;
				return error;
			},
		);
		await delay(50);
		expect(settled).toBe(false);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		const prefs = createDisplayPreferences(display);
		await prefs.save(await prefs.refresh(), 6);
		expect(prefs.value).toBe(6);
		const newer = yaml.replace("maxConcurrentRuns: 4", "maxConcurrentRuns: 5");
		await fs.writeFile(registry, newer);
		await fs.unlink(lock);
		expect(await outcome).toMatchObject({ message: expect.stringMatching(/reopen settings/i) });
		expect(await fs.readFile(registry, "utf8")).toBe(newer);
	});

	it("validates the proposed registry including changed persona files", async () => {
		const displayed = await readLimitSettings(registry);
		await fs.writeFile(join(root, "reader.md"), "---\ntools: [bash]\n---\nChanged");
		await expect(saveLimitSetting(displayed, "maxDepth", 2)).rejects.toThrow(/frontmatter/i);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
	});

	it("keeps the original file and releases temporary resources after failed replacement", async () => {
		const displayed = await readLimitSettings(registry);
		vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic replacement failure"));
		await expect(saveLimitSetting(displayed, "maxDepth", 2)).rejects.toThrow(/replacement failure/i);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect((await fs.readdir(root)).filter((name) => /\.tmp$|\.lock$/.test(name))).toEqual([]);
		await saveLimitSetting(displayed, "maxDepth", 2);
		expect((await loadRegistry(registry)).limits.maxDepth).toBe(2);
	});
});

describe("display preferences", () => {
	it("uses absolute XDG paths and a home fallback for relative XDG paths", () => {
		expect(displayPreferencesPath({ XDG_CONFIG_HOME: root }, root)).toBe(join(root, "pi-subagents", "config.json"));
		expect(displayPreferencesPath({ XDG_CONFIG_HOME: "relative" }, root)).toBe(
			join(root, ".config", "pi-subagents", "config.json"),
		);
	});

	it("does no I/O when created or read from the cache", async () => {
		const read = vi.mocked(fs.open);
		const prefs = createDisplayPreferences(display);
		expect(prefs.value).toBe(4);
		expect(read).not.toHaveBeenCalled();
		const displayed = await prefs.refresh();
		expect(displayed.diagnostics).toEqual([]);
		expect(prefs.value).toBe(4);
		await expect(fs.stat(display)).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("preserves unrelated JSON keys and updates cache only after saving", async () => {
		await fs.mkdir(join(root, "config", "pi-subagents"), { recursive: true });
		await fs.writeFile(display, '{"maxVisibleAgents":8,"unrelated":{"keep":true}}');
		const prefs = createDisplayPreferences(display);
		const displayed = await prefs.refresh();
		expect(prefs.value).toBe(8);
		await prefs.save(displayed, 2);
		expect(prefs.value).toBe(2);
		expect(JSON.parse(await fs.readFile(display, "utf8"))).toEqual({ maxVisibleAgents: 2, unrelated: { keep: true } });
		expect((await fs.stat(display)).mode & 0o777).toBe(0o600);
		expect(createDisplayPreferences(display).value).toBe(4);
	});

	it.each([0, -1, 257, 1.5, Infinity, NaN, "3", Number.MAX_SAFE_INTEGER + 1])(
		"rejects invalid visible-agent value %s",
		async (value) => {
			const prefs = createDisplayPreferences(display);
			await expect(prefs.save(await prefs.refresh(), value as number)).rejects.toThrow(/1.*256/i);
			expect(prefs.value).toBe(4);
			await expect(fs.stat(display)).rejects.toMatchObject({ code: "ENOENT" });
		},
	);

	it.each(["{", "[]", "null", '{"maxVisibleAgents":null}', '{"maxVisibleAgents":0}', '{"maxVisibleAgents":"4"}'])(
		"diagnoses invalid display config and refuses to overwrite: %s",
		async (text) => {
			await fs.mkdir(join(root, "config", "pi-subagents"), { recursive: true });
			await fs.writeFile(display, text);
			const prefs = createDisplayPreferences(display);
			const displayed = await prefs.refresh();
			expect(prefs.value).toBe(4);
			expect(displayed.diagnostics.length).toBeGreaterThan(0);
			await expect(prefs.save(displayed, 2)).rejects.toThrow(/fix/i);
			expect(await fs.readFile(display, "utf8")).toBe(text);
		},
	);

	it("picks up another session's edits on refresh and detects a stale save", async () => {
		const one = createDisplayPreferences(display);
		const two = createDisplayPreferences(display);
		const displayed = await one.refresh();
		await two.save(await two.refresh(), 6);
		await expect(one.save(displayed, 2)).rejects.toThrow(/reopen settings/i);
		expect(one.value).toBe(4);
		await one.refresh();
		expect(one.value).toBe(6);
	});

	it("keeps cache and disk unchanged after failed atomic replacement", async () => {
		const prefs = createDisplayPreferences(display);
		await prefs.save(await prefs.refresh(), 8);
		const displayed = await prefs.refresh();
		const previous = await fs.readFile(display, "utf8");
		vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic replacement failure"));
		await expect(prefs.save(displayed, 2)).rejects.toThrow(/replacement failure/i);
		expect(await fs.readFile(display, "utf8")).toBe(previous);
		expect(prefs.value).toBe(8);
	});

	it("labels an oversized config invalid without saving over it", async () => {
		await fs.mkdir(join(root, "config", "pi-subagents"), { recursive: true });
		await fs.writeFile(display, JSON.stringify({ padding: "x".repeat(300_000) }));
		const prefs = createDisplayPreferences(display);
		const displayed = await prefs.refresh();
		expect(displayed.diagnostics.join(" ")).toMatch(/large|bound/i);
		await expect(prefs.save(displayed, 2)).rejects.toThrow(/fix/i);
	});
});
