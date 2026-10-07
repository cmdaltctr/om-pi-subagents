import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUiSettings } from "../src/ui-settings.ts";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "omps-ui-settings-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

async function write(relativePath: string, text: string): Promise<void> {
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with literal test paths below the generated temporary root.
	const target = join(dir, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, text);
}

const registry = () => join(dir, "om-pi-subagents.yaml");
const legacy = () => join(dir, "pi-subagents", "config.json");

const defaults = { maxVisibleAgents: 5, toggleKey: "alt+o", inspectKey: "alt+i" };

const emptyRegistry = "version: 1\nagents: {}\n";

describe("cache without files", () => {
	it("starts on defaults and creates no settings file", async () => {
		const cache = createUiSettings(registry(), legacy());
		expect(cache.value).toEqual(defaults);
		const state = await cache.ensureLoaded();
		expect(state.value).toEqual(defaults);
		expect(state.maxVisibleAgentsSource).toBe("default");
		expect(state.diagnostics).toEqual([]);
		expect(existsSync(registry())).toBe(false);
		expect(existsSync(legacy())).toBe(false);
	});

	it("serves the cached value without file access", async () => {
		await write("om-pi-subagents.yaml", emptyRegistry);
		const cache = createUiSettings(registry(), legacy());
		await cache.ensureLoaded();

		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 1\nagents: {}\n");
		expect(cache.value).toEqual(defaults);
	});

	it("ensureLoaded keeps the first load and refresh reloads", async () => {
		await write("om-pi-subagents.yaml", emptyRegistry);
		const cache = createUiSettings(registry(), legacy());
		await cache.ensureLoaded();

		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 2\nagents: {}\n");
		expect((await cache.ensureLoaded()).value.maxVisibleAgents).toBe(5);
		expect((await cache.refresh()).value.maxVisibleAgents).toBe(2);
	});
});

describe("yaml ui declarations", () => {
	it("uses declared yaml values", async () => {
		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 9\nagents: {}\n");
		const cache = createUiSettings(registry(), legacy());
		const state = await cache.ensureLoaded();
		expect(state.value).toEqual({ maxVisibleAgents: 9, toggleKey: "alt+o", inspectKey: "alt+i" });
		expect(state.maxVisibleAgentsSource).toBe("yaml");
	});

	it("accepts partial declarations beside the legacy value", async () => {
		await write("pi-subagents/config.json", '{"maxVisibleAgents": 7}\n');
		await write("om-pi-subagents.yaml", 'version: 1\nui:\n  toggleKey: "off"\nagents: {}\n');
		const state = await createUiSettings(registry(), legacy()).ensureLoaded();
		expect(state.value).toEqual({ maxVisibleAgents: 7, toggleKey: "off", inspectKey: "alt+i" });
		expect(state.maxVisibleAgentsSource).toBe("legacy");
	});
});

describe("legacy display preferences", () => {
	it("applies a valid legacy visible-agent value read-only", async () => {
		await write("pi-subagents/config.json", '{"maxVisibleAgents": 7}\n');
		const cache = createUiSettings(registry(), legacy());
		const state = await cache.ensureLoaded();
		expect(state.value.maxVisibleAgents).toBe(7);
		expect(state.maxVisibleAgentsSource).toBe("legacy");
		expect(state.diagnostics).toEqual([]);
		// The compatibility input is read-only: loading writes nothing back.
		const text = await import("node:fs/promises").then((fs) => fs.readFile(legacy(), "utf8"));
		expect(text).toBe('{"maxVisibleAgents": 7}\n');
		expect(existsSync(registry())).toBe(false);
	});

	it("lets yaml win over the legacy value without rewriting it", async () => {
		await write("pi-subagents/config.json", '{"maxVisibleAgents": 7}\n');
		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 3\nagents: {}\n");
		const state = await createUiSettings(registry(), legacy()).ensureLoaded();
		expect(state.value.maxVisibleAgents).toBe(3);
		expect(state.maxVisibleAgentsSource).toBe("yaml");
		const text = await import("node:fs/promises").then((fs) => fs.readFile(legacy(), "utf8"));
		expect(JSON.parse(text).maxVisibleAgents).toBe(7);
	});

	it("diagnoses malformed legacy data and uses the default", async () => {
		await write("pi-subagents/config.json", "not json\n");
		const state = await createUiSettings(registry(), legacy()).ensureLoaded();
		expect(state.value.maxVisibleAgents).toBe(5);
		expect(state.maxVisibleAgentsSource).toBe("default");
		expect(state.diagnostics.length).toBe(1);
		expect(state.diagnostics[0]).toMatch(/config\.json/);
	});

	it("diagnoses an out-of-range legacy value and uses the default", async () => {
		await write("pi-subagents/config.json", '{"maxVisibleAgents": 999}\n');
		const state = await createUiSettings(registry(), legacy()).ensureLoaded();
		expect(state.value.maxVisibleAgents).toBe(5);
		expect(state.maxVisibleAgentsSource).toBe("default");
		expect(state.diagnostics.length).toBe(1);
	});

	it("reports a missing legacy file without a diagnostic", async () => {
		await write("om-pi-subagents.yaml", emptyRegistry);
		const state = await createUiSettings(registry(), legacy()).ensureLoaded();
		expect(state.value).toEqual(defaults);
		expect(state.maxVisibleAgentsSource).toBe("default");
		expect(state.diagnostics).toEqual([]);
	});
});

describe("registry failures", () => {
	it("keeps the retained cache usable when the registry becomes invalid", async () => {
		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 6\nagents: {}\n");
		const cache = createUiSettings(registry(), legacy());
		await cache.ensureLoaded();
		expect(cache.value.maxVisibleAgents).toBe(6);

		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 0\nagents: {}\n");
		const state = await cache.refresh();
		expect(state.value.maxVisibleAgents).toBe(5);
		expect(state.diagnostics.length).toBe(1);
		expect(state.diagnostics[0]).toMatch(/ui\.maxVisibleAgents/);
		// The retained cache still serves the last good presentation values.
		expect(cache.value).toEqual({ maxVisibleAgents: 6, toggleKey: "alt+o", inspectKey: "alt+i" });
	});

	it("recovers on the next refresh once the registry is valid again", async () => {
		await write("om-pi-subagents.yaml", "version: 1\nagents: {}\n");
		const cache = createUiSettings(registry(), legacy());
		await cache.ensureLoaded();
		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 0\nagents: {}\n");
		await cache.refresh();
		await write("om-pi-subagents.yaml", "version: 1\nui:\n  maxVisibleAgents: 4\nagents: {}\n");
		const state = await cache.refresh();
		expect(state.value.maxVisibleAgents).toBe(4);
		expect(state.diagnostics).toEqual([]);
		expect(cache.value.maxVisibleAgents).toBe(4);
	});
});
