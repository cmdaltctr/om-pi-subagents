import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRegistry } from "../config.ts";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ompss-config-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

const yamlPath = () => join(dir, "om-pi-subagents.yaml");

async function write(relativePath: string, text: string): Promise<void> {
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with literal test paths below the generated temporary root.
	const target = join(dir, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, text);
}

const reader = `version: 1
agents:
  reader:
    persona: ./personas/reader.md
    tools: [read, grep]
    thinking: off
`;

describe("catalogue", () => {
	it("accepts an empty catalogue and adds no fallback personas", async () => {
		await write("om-pi-subagents.yaml", "version: 1\nagents: {}\n");
		const registry = await loadRegistry(yamlPath());
		expect(registry.agents.size).toBe(0);
		expect(registry.agents.get("a-explore")).toBeUndefined();
	});

	it("treats a missing file as an empty catalogue", async () => {
		const registry = await loadRegistry(yamlPath());
		expect(registry.agents.size).toBe(0);
	});

	it("registers arbitrary names without an `a-` prefix", async () => {
		await write("personas/one.md", "First.");
		await write("personas/two.md", "Second.");
		await write(
			"om-pi-subagents.yaml",
			`version: 1
agents:
  x9-review:
    persona: ./personas/one.md
    tools: [read]
    thinking: off
  zeta:
    persona: ./personas/two.md
    tools: []
    thinking: off
`,
		);
		const registry = await loadRegistry(yamlPath());
		expect([...registry.agents.keys()].sort()).toEqual(["x9-review", "zeta"]);
		expect(registry.agents.get("zeta")?.tools).toEqual([]);
	});

	it("keeps unmapped persona files unavailable", async () => {
		await write("personas/reader.md", "Read things.");
		await write("personas/unlisted.md", "Not mapped.");
		await write("om-pi-subagents.yaml", reader);
		const registry = await loadRegistry(yamlPath());
		expect([...registry.agents.keys()]).toEqual(["reader"]);
	});

	it("follows added and removed mappings on the next load", async () => {
		await write("personas/reader.md", "Read things.");
		await write("personas/writer.md", "Write things.");
		await write("om-pi-subagents.yaml", reader);
		expect([...(await loadRegistry(yamlPath())).agents.keys()]).toEqual(["reader"]);

		await write(
			"om-pi-subagents.yaml",
			`version: 1
agents:
  writer:
    persona: ./personas/writer.md
    tools: [read, write]
    thinking: off
`,
		);
		const after = await loadRegistry(yamlPath());
		expect([...after.agents.keys()]).toEqual(["writer"]);
		expect(after.agents.get("reader")).toBeUndefined();
	});
});

describe("explicit thinking", () => {
	it.each(["off", "minimal", "low", "medium", "high", "xhigh", "max"])(
		"accepts %s without requiring a model",
		async (thinking) => {
			await write("personas/reader.md", "Read things.");
			await write("om-pi-subagents.yaml", reader.replace("thinking: off", `thinking: ${thinking}`));
			const agent = (await loadRegistry(yamlPath())).agents.get("reader")!;
			expect(agent.thinking).toBe(thinking);
			expect(agent.model).toBeUndefined();
		},
	);
});

describe("persona snapshot", () => {
	it("resolves persona paths relative to the YAML file", async () => {
		await write("personas/reader.md", "Read things.");
		await write("om-pi-subagents.yaml", reader);
		const agent = (await loadRegistry(yamlPath())).agents.get("reader")!;
		expect(agent.personaPath.endsWith(join("personas", "reader.md"))).toBe(true);
		expect(agent.persona).toBe("Read things.");
	});

	it("applies empty defaults for optional settings", async () => {
		await write("personas/reader.md", "Read things.");
		await write("om-pi-subagents.yaml", reader);
		const agent = (await loadRegistry(yamlPath())).agents.get("reader")!;
		expect(agent).toMatchObject({ name: "reader", tools: ["read", "grep"], skills: [], extensions: [] });
		expect(agent.model).toBeUndefined();
		expect(agent.thinking).toBe("off");
	});

	it("gives the next load edited text and leaves the earlier snapshot unchanged", async () => {
		await write("personas/reader.md", "Version one.");
		await write("om-pi-subagents.yaml", reader);
		const first = (await loadRegistry(yamlPath())).agents.get("reader")!;

		await write("personas/reader.md", "Version two.");
		const second = (await loadRegistry(yamlPath())).agents.get("reader")!;

		expect(first.persona).toBe("Version one.");
		expect(second.persona).toBe("Version two.");
	});
});
