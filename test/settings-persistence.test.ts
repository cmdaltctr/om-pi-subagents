import * as fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRegistry } from "../src/config.ts";
import {
	displayPreferencesPath,
	readLimitSettings,
	saveLimitSetting,
	saveUiSetting,
	type UiField,
} from "../src/settings-persistence.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
	const original = await importOriginal<typeof import("node:fs/promises")>();
	return { ...original, rename: vi.fn(original.rename), open: vi.fn(original.open) };
});

let root: string;
let registry: string;
let _display: string;
const yaml = `# Operator mappings\nversion: 1\nlimits:\n  maxDepth: 3 # root starts at zero\n  maxConcurrentRuns: 4 # per parent\nagents:\n  reader:\n    persona: reader.md\n    tools: [read]\n    thinking: off\n    model: fake/counter\n`;

beforeEach(async () => {
	vi.clearAllMocks();
	root = await fs.mkdtemp(join(tmpdir(), "omps-settings-"));
	registry = join(root, "registry.yaml");
	_display = join(root, "config", "pi-subagents", "config.json");
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
		const other = join(root, "other.yaml");
		await fs.writeFile(other, "version: 1\nagents: {}\n");
		await saveUiSetting(await readLimitSettings(other), "maxVisibleAgents", 6);
		expect((await loadRegistry(other)).ui.maxVisibleAgents).toBe(6);
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

describe("display preferences path", () => {
	it("uses absolute XDG paths and a home fallback for relative XDG paths", () => {
		expect(displayPreferencesPath({ XDG_CONFIG_HOME: root }, root)).toBe(join(root, "pi-subagents", "config.json"));
		expect(displayPreferencesPath({ XDG_CONFIG_HOME: "relative" }, root)).toBe(
			join(root, ".config", "pi-subagents", "config.json"),
		);
	});
});

describe("ui settings persistence", () => {
	it("saves visible agents into ui while preserving comments, limits and mappings", async () => {
		const displayed = await readLimitSettings(registry);
		await saveUiSetting(displayed, "maxVisibleAgents", 7);
		const saved = await fs.readFile(registry, "utf8");
		expect(saved).toContain("maxVisibleAgents: 7");
		expect(saved).toContain("maxConcurrentRuns: 4 # per parent");
		expect(saved).toContain("# Operator mappings");
		expect(saved).toContain("persona: reader.md");
		const loaded = await loadRegistry(registry);
		expect(loaded.limits).toEqual({ maxDepth: 3, maxConcurrentRuns: 4 });
		expect(loaded.ui.maxVisibleAgents).toBe(7);
		expect(loaded.agents.get("reader")?.model).toBe("fake/counter");
		expect((await fs.stat(registry)).mode & 0o777).toBe(0o600);
	});

	it("creates a ui mapping when the registry has none", async () => {
		await fs.writeFile(registry, "version: 1\nagents: {}\n");
		await saveUiSetting(await readLimitSettings(registry), "toggleKey", "alt+p");
		const loaded = await loadRegistry(registry);
		expect(loaded.ui.toggleKey).toBe("alt+p");
		expect(loaded.ui.maxVisibleAgents).toBe(5);
	});

	it.each([
		["maxVisibleAgents", 0],
		["maxVisibleAgents", 257],
		["maxVisibleAgents", 1.5],
		["maxVisibleAgents", "5"],
		["toggleKey", "Alt+O"],
		["toggleKey", "alt o"],
		["toggleKey", "control+o"],
		["toggleKey", 12],
		["inspectKey", ""],
		["inspectKey", "disabled"],
	])("rejects invalid %s=%v without touching the file", async (field, value) => {
		const displayed = await readLimitSettings(registry);
		await expect(saveUiSetting(displayed, field as UiField, value as number | string)).rejects.toThrow(
			/1.*256|key specification|off/i,
		);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
	});

	it.each(["toggleKey", "inspectKey"])("rejects the Tab alias for %s", async (field) => {
		const displayed = await readLimitSettings(registry);
		await expect(saveUiSetting(displayed, field as UiField, field === "toggleKey" ? "ctrl+i" : "tab")).rejects.toThrow(
			/unsafe.*Tab|choose another key/i,
		);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
	});

	it("accepts off for both shortcuts", async () => {
		const displayed = await readLimitSettings(registry);
		await saveUiSetting(displayed, "toggleKey", "off");
		await saveUiSetting(await readLimitSettings(registry), "inspectKey", "off");
		expect((await loadRegistry(registry)).ui).toEqual({
			maxVisibleAgents: 5,
			fleetView: "expanded",
			showManagementList: true,
			navigationDownKey: "down",
			navigationUpKey: "up",
			toggleKey: "off",
			inspectKey: "off",
		});
	});

	it("saves a valid fleet view and rejects other values without touching the file", async () => {
		await saveUiSetting(await readLimitSettings(registry), "fleetView", "collapsed");
		expect((await loadRegistry(registry)).ui.fleetView).toBe("collapsed");
		const saved = await fs.readFile(registry, "utf8");
		await expect(saveUiSetting(await readLimitSettings(registry), "fleetView", "hidden")).rejects.toThrow(
			/ui\.fleetView/,
		);
		expect(await fs.readFile(registry, "utf8")).toBe(saved);
	});

	it("rejects a key that duplicates the other declared shortcut", async () => {
		const displayed = await readLimitSettings(registry);
		await saveUiSetting(displayed, "inspectKey", "alt+p");
		await expect(saveUiSetting(await readLimitSettings(registry), "toggleKey", "alt+p")).rejects.toThrow(
			/duplicate.*alt\+p|choose distinct/i,
		);
		expect((await loadRegistry(registry)).ui.toggleKey).toBe("off");
	});

	it("requires explicit confirmation before creating a missing registry", async () => {
		const missing = join(root, "missing", "registry.yaml");
		const displayed = await readLimitSettings(missing);
		await expect(saveUiSetting(displayed, "maxVisibleAgents", 2)).rejects.toThrow(/confirm/i);
		await expect(fs.stat(missing)).rejects.toMatchObject({ code: "ENOENT" });
		await saveUiSetting(displayed, "maxVisibleAgents", 2, true);
		expect((await loadRegistry(missing)).ui.maxVisibleAgents).toBe(2);
		expect((await loadRegistry(missing)).agents.size).toBe(0);
	});

	it("rejects external edits since display", async () => {
		const displayed = await readLimitSettings(registry);
		const newer = yaml.replace("maxConcurrentRuns: 4", "maxConcurrentRuns: 5");
		await fs.writeFile(registry, newer);
		await expect(saveUiSetting(displayed, "toggleKey", "alt+p")).rejects.toThrow(/reopen settings/i);
		expect(await fs.readFile(registry, "utf8")).toBe(newer);
	});

	it("honours a cross-process file lock without blocking ui saves to another destination", async () => {
		const displayed = await readLimitSettings(registry);
		const lock = `${registry}.lock`;
		await fs.writeFile(lock, "other session", { flag: "wx", mode: 0o600 });
		const saving = saveUiSetting(displayed, "maxVisibleAgents", 2);
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
		const other = join(root, "other.yaml");
		await fs.writeFile(other, "version: 1\nagents: {}\n");
		await saveUiSetting(await readLimitSettings(other), "maxVisibleAgents", 6);
		expect((await loadRegistry(other)).ui.maxVisibleAgents).toBe(6);
		const newer = yaml.replace("maxConcurrentRuns: 4", "maxConcurrentRuns: 5");
		await fs.writeFile(registry, newer);
		await fs.unlink(lock);
		expect(await outcome).toMatchObject({ message: expect.stringMatching(/reopen settings/i) });
		expect(await fs.readFile(registry, "utf8")).toBe(newer);
	});

	it("keeps the original file and releases temporary resources after failed ui replacement", async () => {
		const displayed = await readLimitSettings(registry);
		vi.mocked(fs.rename).mockRejectedValueOnce(new Error("synthetic replacement failure"));
		await expect(saveUiSetting(displayed, "maxVisibleAgents", 2)).rejects.toThrow(/replacement failure/i);
		expect(await fs.readFile(registry, "utf8")).toBe(yaml);
		expect((await fs.readdir(root)).filter((name) => /\.tmp$|\.lock$/.test(name))).toEqual([]);
	});
});
