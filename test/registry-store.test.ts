import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveRegistryPath } from "../src/index.ts";
import { createRegistryStore, RegistryError } from "../src/config.ts";

let dir: string;
let home: string;
const savedHome = process.env.HOME;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "omps-store-"));
	home = await mkdtemp(join(tmpdir(), "omps-home-"));
	process.env.HOME = home;
});

afterEach(async () => {
	vi.unstubAllEnvs();
	process.env.HOME = savedHome;
	await rm(dir, { recursive: true, force: true });
	await rm(home, { recursive: true, force: true });
});

async function write(root: string, relativePath: string, text: string): Promise<void> {
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with literal test paths below generated temporary roots.
	const target = join(root, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, text);
}

const yaml = (tools: string) => `version: 1
agents:
  reader:
    persona: ./personas/reader.md
    tools: [${tools}]
    thinking: off
`;

describe("registry migration", () => {
	it("loads only the new file when both registries exist", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", dir);
		vi.stubEnv("OMPS_REGISTRY", undefined);
		await write(dir, "om-pi-subagents.yaml", "invalid old YAML [");
		await write(dir, "omps/config.yaml", yaml("read"));
		await write(dir, "omps/personas/reader.md", "New persona.");
		const store = createRegistryStore(resolveRegistryPath(dir, {}));
		await store.refresh();
		expect(store.list()).toEqual(["reader"]);
		expect(store.get("reader").persona).toBe("New persona.");
		expect(await readFile(join(dir, "om-pi-subagents.yaml"), "utf8")).toBe("invalid old YAML [");
	});

	it("loads the old file only when the operator explicitly selects it", async () => {
		const oldPath = join(dir, "om-pi-subagents.yaml");
		vi.stubEnv("PI_CODING_AGENT_DIR", dir);
		vi.stubEnv("OMPS_REGISTRY", oldPath);
		await write(dir, "om-pi-subagents.yaml", yaml("read"));
		await write(dir, "personas/reader.md", "Explicit old persona.");
		const store = createRegistryStore(resolveRegistryPath(dir));
		await store.refresh();
		expect(store.get("reader").persona).toBe("Explicit old persona.");
	});

	it("blocks refresh and launch snapshots when only the old file exists without changing it", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", dir);
		vi.stubEnv("OMPS_REGISTRY", undefined);
		const oldPath = join(dir, "om-pi-subagents.yaml");
		const newPath = join(dir, "omps", "config.yaml");
		const bytes = Buffer.from("version: 1\nagents: {}\n# original operator settings\n");
		await writeFile(oldPath, bytes);
		const store = createRegistryStore(resolveRegistryPath(dir, {}));
		const error = await store.refresh().catch((failure: unknown) => failure);
		expect(error).toBeInstanceOf(RegistryError);
		const message = (error as Error).message;
		expect(message).toContain(newPath);
		expect(message).toContain(oldPath);
		expect(message).toContain(`mkdir -p ${join(dir, "omps", "personas")}`);
		expect(message).toContain(`mv ${oldPath} ${newPath}`);
		expect(() => store.get("reader")).toThrow(message);
		expect(() => store.list()).toThrow(message);
		expect(await readFile(oldPath)).toEqual(bytes);
	});
});

describe("explicit settings", () => {
	it("carries model, thinking, skills and extensions into the snapshot", async () => {
		await write(join(dir, "omps"), "personas/reader.md", "Read.");
		await write(join(dir, "omps"), "skills/local/SKILL.md", "# local");
		await write(join(dir, "omps"), "ext/provider.ts", "export default () => {};");
		await write(home, "shared/SKILL.md", "# shared");
		await write(outside(), "abs/SKILL.md", "# absolute");
		await write(
			join(dir, "omps"),
			"config.yaml",
			`version: 1
agents:
  reader:
    persona: ./personas/reader.md
    tools: [read]
    model: my-provider/my-model
    thinking: medium
    skills: [./skills/local/SKILL.md, ~/shared/SKILL.md, ${join(outside(), "abs/SKILL.md")}]
    extensions: [./ext/provider.ts]
`,
		);
		const store = createRegistryStore(join(dir, "omps", "config.yaml"));
		await store.refresh();
		const agent = store.get("reader");
		expect(agent.model).toBe("my-provider/my-model");
		expect(agent.thinking).toBe("medium");
		expect(agent.skills).toEqual([
			join(dir, "omps", "skills/local/SKILL.md"),
			join(home, "shared/SKILL.md"),
			join(outside(), "abs/SKILL.md"),
		]);
		expect(agent.extensions).toEqual([join(dir, "omps", "ext/provider.ts")]);
	});

	function outside(): string {
		return join(home, "elsewhere");
	}
});

describe("ui settings in the store", () => {
	const uiYaml = (ui: string) => `version: 1
${ui}agents:
  reader:
    persona: ./personas/reader.md
    tools: [read]
    thinking: off
`;

	it("serves ui settings from the snapshot", async () => {
		await write(join(dir, "omps"), "personas/reader.md", "Read.");
		await write(join(dir, "omps"), "config.yaml", uiYaml("ui:\n  maxVisibleAgents: 6\n"));
		const store = createRegistryStore(join(dir, "omps", "config.yaml"));
		const snapshot = await store.refresh();
		expect(snapshot.ui).toEqual({ maxVisibleAgents: 6, fleetView: "expanded", toggleKey: "off", inspectKey: "off" });
	});

	it("blocks refresh on invalid ui values and serves no stale configuration", async () => {
		await write(join(dir, "omps"), "personas/reader.md", "Read.");
		await write(join(dir, "omps"), "config.yaml", uiYaml(""));
		const store = createRegistryStore(join(dir, "omps", "config.yaml"));
		await store.refresh();

		await write(join(dir, "omps"), "config.yaml", uiYaml("ui:\n  maxVisibleAgents: 0\n"));
		await expect(store.refresh()).rejects.toThrow(/ui\.maxVisibleAgents/);
		expect(() => store.get("reader")).toThrow(/ui\.maxVisibleAgents/);
		expect(() => store.list()).toThrow(/ui\.maxVisibleAgents/);
	});

	it("recovers once the ui error is repaired", async () => {
		await write(join(dir, "omps"), "personas/reader.md", "Read.");
		await write(join(dir, "omps"), "config.yaml", uiYaml('ui:\n  toggleKey: "alt o"\n'));
		const store = createRegistryStore(join(dir, "omps", "config.yaml"));
		await expect(store.refresh()).rejects.toThrow(/ui\.toggleKey/);

		await write(join(dir, "omps"), "config.yaml", uiYaml('ui:\n  toggleKey: "off"\n'));
		const snapshot = await store.refresh();
		expect(snapshot.ui.toggleKey).toBe("off");
	});
});

describe("refresh", () => {
	async function setup() {
		await write(join(dir, "omps"), "personas/reader.md", "Version one.");
		await write(join(dir, "omps"), "config.yaml", yaml("read"));
		const store = createRegistryStore(join(dir, "omps", "config.yaml"));
		await store.refresh();
		return store;
	}

	it("freezes snapshots so an active run keeps its original permissions", async () => {
		const store = await setup();
		const active = store.get("reader");
		await write(join(dir, "omps"), "personas/reader.md", "Version two.");
		await write(join(dir, "omps"), "config.yaml", yaml("read, write"));
		await store.refresh();

		expect(active.tools).toEqual(["read"]);
		expect(active.persona).toBe("Version one.");
		expect(Object.isFrozen(active)).toBe(true);
		expect(Object.isFrozen(active.tools)).toBe(true);
		expect(store.get("reader").tools).toEqual(["read", "write"]);
		expect(store.get("reader").persona).toBe("Version two.");
	});

	it("does not see edits until a refresh", async () => {
		const store = await setup();
		await write(join(dir, "omps"), "config.yaml", yaml("read, write"));
		expect(store.get("reader").tools).toEqual(["read"]);
	});

	it("reports a failed refresh and never serves stale configuration", async () => {
		const store = await setup();
		await write(join(dir, "omps"), "config.yaml", yaml(JSON.stringify("*")));

		await expect(store.refresh()).rejects.toBeInstanceOf(RegistryError);
		expect(() => store.get("reader")).toThrow(/exact tool name/);
		expect(() => store.list()).toThrow(/exact tool name/);
	});

	it("recovers after a later successful refresh", async () => {
		const store = await setup();
		await write(join(dir, "omps"), "config.yaml", yaml(JSON.stringify("*")));
		await expect(store.refresh()).rejects.toThrow();
		await write(join(dir, "omps"), "config.yaml", yaml("read, grep"));
		await store.refresh();
		expect(store.get("reader").tools).toEqual(["read", "grep"]);
	});

	it("reports an unknown agent after its mapping is removed", async () => {
		const store = await setup();
		await write(join(dir, "omps"), "config.yaml", "version: 1\nagents: {}\n");
		await store.refresh();
		expect(() => store.get("reader")).toThrow(/unknown agent/i);
		expect(store.list()).toEqual([]);
	});

	it("refuses to serve before the first refresh", async () => {
		await write(join(dir, "omps"), "config.yaml", yaml("read"));
		expect(() => createRegistryStore(join(dir, "omps", "config.yaml")).get("reader")).toThrow(/not loaded/i);
	});
});
