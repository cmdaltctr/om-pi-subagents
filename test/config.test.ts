import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkUiKey, loadRegistry, typedKeyToSpec } from "../src/config.ts";

let root: string;
let dir: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-config-"));
	dir = join(root, "omps");
	await mkdir(dir, { recursive: true });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const yamlPath = () => join(dir, "config.yaml");

async function write(relativePath: string, text: string): Promise<void> {
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with literal test paths below the generated temporary root.
	const target = join(dir, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, text);
}

const managementDefaults = {
	showManagementList: true,
	navigationDownKey: "down",
	navigationUpKey: "up",
	resultKey: "ctrl+shift+e",
};

const reader = `version: 1
agents:
  reader:
    persona: ./personas/reader.md
    tools: [read, grep]
    thinking: off
`;

describe("catalogue", () => {
	it("accepts an empty catalogue and adds no fallback personas", async () => {
		await write("config.yaml", "version: 1\nagents: {}\n");
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
			"config.yaml",
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
		await write("config.yaml", reader);
		const registry = await loadRegistry(yamlPath());
		expect([...registry.agents.keys()]).toEqual(["reader"]);
	});

	it("follows added and removed mappings on the next load", async () => {
		await write("personas/reader.md", "Read things.");
		await write("personas/writer.md", "Write things.");
		await write("config.yaml", reader);
		expect([...(await loadRegistry(yamlPath())).agents.keys()]).toEqual(["reader"]);

		await write(
			"config.yaml",
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
			await write("config.yaml", reader.replace("thinking: off", `thinking: ${thinking}`));
			const agent = (await loadRegistry(yamlPath())).agents.get("reader")!;
			expect(agent.thinking).toBe(thinking);
			expect(agent.model).toBeUndefined();
		},
	);
});

describe("typed shortcut conversion", () => {
	it.each([
		["pageUp", "pageUp"],
		["pageDown", "pageDown"],
		["ctrl+pageUp", "ctrl+pageUp"],
		["ctrl+pageDown", "ctrl+pageDown"],
		["PAGEUP", "pageUp"],
		["PAGEDOWN", "pageDown"],
		[" Control + PAGEUP ", "ctrl+pageUp"],
		["Option + pageDOWN", "alt+pageDown"],
	])("preserves Pi Page key spelling for %j", (typed, expected) => {
		const converted = typedKeyToSpec(typed);
		expect(converted).toBe(expected);
		expect(checkUiKey("toggleKey", converted)).toBe(expected);
	});

	it.each([
		["ctrl", "ctrl"],
		["ctr", "ctrl"],
		["ctl", "ctrl"],
		["control", "ctrl"],
		["alt", "alt"],
		["opt", "alt"],
		["option", "alt"],
		["shift", "shift"],
		["super", "super"],
		["cmd", "super"],
		["command", "super"],
		["win", "super"],
	])("converts modifier %s to %s", (typed, expected) => {
		expect(typedKeyToSpec(`${typed}+1`)).toBe(`${expected}+1`);
	});

	it.each([
		["CONTROL+O", "ctrl+o"],
		[" Control \t+ 1 ", "ctrl+1"],
		["CTL + Shift + OPTION + CMD + O", "ctrl+shift+alt+super+o"],
		["ctrl+shift+i", "ctrl+shift+i"],
		["OFF", "off"],
		[" off ", "off"],
		["Hyper + 1", "hyper+1"],
		["meta+1", "meta+1"],
		["control", "control"],
		["ctrl+command", "ctrl+command"],
		["ctrl++", "ctrl++"],
	])("converts %j to %j without interpreting the base key", (typed, expected) => {
		expect(typedKeyToSpec(typed)).toBe(expected);
	});
});

describe("ui settings", () => {
	const uiYaml = (ui: string) => `version: 1
${ui}agents: {}
`;

	it("applies five visible agents, the expanded fleet and the result shortcut when ui is omitted", async () => {
		await write("config.yaml", uiYaml(""));
		const registry = await loadRegistry(yamlPath());
		expect(registry.ui).toEqual({
			...managementDefaults,
			maxVisibleAgents: 5,
			fleetView: "expanded",
			toggleKey: "off",
			inspectKey: "off",
		});
	});

	it.each(["control", "ctr", "ctl", "opt", "option", "cmd", "command", "win", "meta"])(
		"keeps YAML strict for modifier %s",
		async (modifier) => {
			await write("config.yaml", uiYaml(`ui:\n  toggleKey: ${modifier}+1\n`));
			await expect(loadRegistry(yamlPath())).rejects.toThrow("ui.toggleKey: must be a lowercase Pi key specification");
		},
	);

	it("accepts an empty ui mapping", async () => {
		await write("config.yaml", uiYaml("ui: {}\n"));
		const registry = await loadRegistry(yamlPath());
		expect(registry.ui).toEqual({
			...managementDefaults,
			maxVisibleAgents: 5,
			fleetView: "expanded",
			toggleKey: "off",
			inspectKey: "off",
		});
	});

	it("carries declared ui values", async () => {
		await write("config.yaml", uiYaml('ui:\n  maxVisibleAgents: 9\n  toggleKey: "ctrl+alt+p"\n  inspectKey: "off"\n'));
		const registry = await loadRegistry(yamlPath());
		expect(registry.ui).toEqual({
			...managementDefaults,
			maxVisibleAgents: 9,
			fleetView: "expanded",
			toggleKey: "ctrl+alt+p",
			inspectKey: "off",
		});
	});

	it.each(["expanded", "collapsed", "off"])("carries fleetView %s", async (view) => {
		await write("config.yaml", uiYaml(`ui:\n  fleetView: "${view}"\n`));
		expect((await loadRegistry(yamlPath())).ui.fleetView).toBe(view);
	});

	it("keeps explicit Alt keys after the defaults change", async () => {
		await write("config.yaml", uiYaml('ui:\n  toggleKey: "alt+o"\n  inspectKey: "alt+i"\n'));
		const registry = await loadRegistry(yamlPath());
		expect(registry.ui).toMatchObject({ toggleKey: "alt+o", inspectKey: "alt+i" });
	});

	it("applies only the matching default for each omitted ui field", async () => {
		await write("config.yaml", uiYaml("ui:\n  maxVisibleAgents: 8\n"));
		const registry = await loadRegistry(yamlPath());
		expect(registry.ui).toEqual({
			...managementDefaults,
			maxVisibleAgents: 8,
			fleetView: "expanded",
			toggleKey: "off",
			inspectKey: "off",
		});
		await write("config.yaml", uiYaml('ui:\n  inspectKey: "alt+i"\n'));
		expect((await loadRegistry(yamlPath())).ui).toEqual({
			...managementDefaults,
			maxVisibleAgents: 5,
			fleetView: "expanded",
			toggleKey: "off",
			inspectKey: "alt+i",
		});
	});

	it("keeps ui settings beside limits and mapped agents", async () => {
		await write("personas/reader.md", "Read things.");
		await write(
			"config.yaml",
			`version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
ui:
  maxVisibleAgents: 2
agents:
  reader:
    persona: ./personas/reader.md
    tools: [read]
    thinking: off
`,
		);
		const registry = await loadRegistry(yamlPath());
		expect([...registry.agents.keys()]).toEqual(["reader"]);
		expect(registry.limits).toEqual({ maxConcurrentRuns: 4, maxDepth: 3 });
		expect(registry.ui).toEqual({
			...managementDefaults,
			maxVisibleAgents: 2,
			fleetView: "expanded",
			toggleKey: "off",
			inspectKey: "off",
		});
	});

	it("freezes the resolved ui settings", async () => {
		await write("config.yaml", uiYaml("ui: {}\n"));
		const registry = await loadRegistry(yamlPath());
		expect(Object.isFrozen(registry.ui)).toBe(true);
	});
});

describe("persona snapshot", () => {
	it("resolves persona paths relative to the YAML file", async () => {
		await write("personas/reader.md", "Read things.");
		await write("config.yaml", reader);
		const agent = (await loadRegistry(yamlPath())).agents.get("reader")!;
		expect(agent.personaPath.endsWith(join("personas", "reader.md"))).toBe(true);
		expect(agent.persona).toBe("Read things.");
	});

	it("applies empty defaults for optional settings", async () => {
		await write("personas/reader.md", "Read things.");
		await write("config.yaml", reader);
		const agent = (await loadRegistry(yamlPath())).agents.get("reader")!;
		expect(agent).toMatchObject({ name: "reader", tools: ["read", "grep"], skills: [], extensions: [] });
		expect(agent.model).toBeUndefined();
		expect(agent.thinking).toBe("off");
	});

	it("gives the next load edited text and leaves the earlier snapshot unchanged", async () => {
		await write("personas/reader.md", "Version one.");
		await write("config.yaml", reader);
		const first = (await loadRegistry(yamlPath())).agents.get("reader")!;

		await write("personas/reader.md", "Version two.");
		const second = (await loadRegistry(yamlPath())).agents.get("reader")!;

		expect(first.persona).toBe("Version one.");
		expect(second.persona).toBe("Version two.");
	});
});

describe("delegation targets", () => {
	const delegator = (targets: string) => `version: 1
agents:
  builder:
    persona: ./personas/builder.md
    tools: [read, omps]
    thinking: off
    delegates: ${targets}
  writer:
    persona: ./personas/writer.md
    tools: [read]
    thinking: off
`;

	beforeEach(async () => {
		await write("personas/builder.md", "Build.");
		await write("personas/writer.md", "Write.");
	});

	it("freezes the allowed targets on the snapshot", async () => {
		await write("config.yaml", delegator("[writer, builder]"));
		const builder = (await loadRegistry(yamlPath())).agents.get("builder");
		expect(builder?.delegates).toEqual(["writer", "builder"]);
		expect(Object.isFrozen(builder?.delegates)).toBe(true);
	});

	it("needs no list for an agent that does not approve omps", async () => {
		await write("config.yaml", delegator("[writer]"));
		expect((await loadRegistry(yamlPath())).agents.get("writer")?.delegates).toBeUndefined();
	});
});
