import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistryStore, RegistryError } from "../src/config.ts";

let dir: string;
let home: string;
const savedHome = process.env.HOME;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ompss-store-"));
	home = await mkdtemp(join(tmpdir(), "ompss-home-"));
	process.env.HOME = home;
});

afterEach(async () => {
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

describe("explicit settings", () => {
	it("carries model, thinking, skills and extensions into the snapshot", async () => {
		await write(dir, "personas/reader.md", "Read.");
		await write(dir, "skills/local/SKILL.md", "# local");
		await write(dir, "ext/provider.ts", "export default () => {};");
		await write(home, "shared/SKILL.md", "# shared");
		await write(outside(), "abs/SKILL.md", "# absolute");
		await write(
			dir,
			"om-pi-subagents.yaml",
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
		const store = createRegistryStore(join(dir, "om-pi-subagents.yaml"));
		await store.refresh();
		const agent = store.get("reader");
		expect(agent.model).toBe("my-provider/my-model");
		expect(agent.thinking).toBe("medium");
		expect(agent.skills).toEqual([
			join(dir, "skills/local/SKILL.md"),
			join(home, "shared/SKILL.md"),
			join(outside(), "abs/SKILL.md"),
		]);
		expect(agent.extensions).toEqual([join(dir, "ext/provider.ts")]);
	});

	function outside(): string {
		return join(home, "elsewhere");
	}
});

describe("refresh", () => {
	async function setup() {
		await write(dir, "personas/reader.md", "Version one.");
		await write(dir, "om-pi-subagents.yaml", yaml("read"));
		const store = createRegistryStore(join(dir, "om-pi-subagents.yaml"));
		await store.refresh();
		return store;
	}

	it("freezes snapshots so an active run keeps its original permissions", async () => {
		const store = await setup();
		const active = store.get("reader");
		await write(dir, "personas/reader.md", "Version two.");
		await write(dir, "om-pi-subagents.yaml", yaml("read, write"));
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
		await write(dir, "om-pi-subagents.yaml", yaml("read, write"));
		expect(store.get("reader").tools).toEqual(["read"]);
	});

	it("reports a failed refresh and never serves stale configuration", async () => {
		const store = await setup();
		await write(dir, "om-pi-subagents.yaml", yaml(JSON.stringify("*")));

		await expect(store.refresh()).rejects.toBeInstanceOf(RegistryError);
		expect(() => store.get("reader")).toThrow(/exact tool name/);
		expect(() => store.list()).toThrow(/exact tool name/);
	});

	it("recovers after a later successful refresh", async () => {
		const store = await setup();
		await write(dir, "om-pi-subagents.yaml", yaml(JSON.stringify("*")));
		await expect(store.refresh()).rejects.toThrow();
		await write(dir, "om-pi-subagents.yaml", yaml("read, grep"));
		await store.refresh();
		expect(store.get("reader").tools).toEqual(["read", "grep"]);
	});

	it("reports an unknown agent after its mapping is removed", async () => {
		const store = await setup();
		await write(dir, "om-pi-subagents.yaml", "version: 1\nagents: {}\n");
		await store.refresh();
		expect(() => store.get("reader")).toThrow(/unknown agent/i);
		expect(store.list()).toEqual([]);
	});

	it("refuses to serve before the first refresh", async () => {
		await write(dir, "om-pi-subagents.yaml", yaml("read"));
		expect(() => createRegistryStore(join(dir, "om-pi-subagents.yaml")).get("reader")).toThrow(/not loaded/i);
	});
});
