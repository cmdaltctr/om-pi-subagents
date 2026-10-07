import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processSpies = vi.hoisted(() => ({
	spawn: vi.fn(),
	spawnSync: vi.fn(),
	exec: vi.fn(),
	execFile: vi.fn(),
	fork: vi.fn(),
}));
vi.mock("node:child_process", () => processSpies);

import { loadRegistry, RegistryError } from "../src/config.ts";

let root: string;
let dir: string;
let outside: string;

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-invalid-"));
	dir = join(root, "omps");
	await mkdir(dir, { recursive: true });
	outside = await mkdtemp(join(tmpdir(), "omps-outside-"));
	for (const spy of Object.values(processSpies)) spy.mockClear();
});

afterEach(async () => {
	vi.unstubAllEnvs();
	await rm(root, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
	// Rejection must happen before any spawn.
	for (const [name, spy] of Object.entries(processSpies)) expect(spy, name).not.toHaveBeenCalled();
});

async function write(base: string, relativePath: string, text: string): Promise<void> {
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with literal test paths below generated temporary roots.
	const target = join(base, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, text);
}

/** Write a YAML file whose `reader` agent body is `agentLines` (indented four spaces). */
async function config(agentLines: string, head = "version: 1\n"): Promise<string> {
	await write(dir, "personas/reader.md", "Read things.");
	await write(dir, "config.yaml", `${head}agents:\n  reader:\n${agentLines}`);
	return join(dir, "config.yaml");
}

const valid = "    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n";

async function expectRejected(yamlPath: string, pattern: RegExp): Promise<void> {
	const failure = await loadRegistry(yamlPath).then(
		() => undefined,
		(error: unknown) => error,
	);
	expect(failure).toBeInstanceOf(RegistryError);
	expect((failure as Error).message).toMatch(pattern);
}

describe("YAML structure", () => {
	it("rejects malformed YAML", async () => {
		await write(dir, "config.yaml", "version: 1\nagents: [unclosed,\n");
		await expectRejected(join(dir, "config.yaml"), /malformed yaml/i);
	});

	it("rejects duplicate agent names", async () => {
		const path = await config(`${valid}  reader:\n${valid}`);
		await expectRejected(path, /duplicate/i);
	});

	it("rejects an unknown top-level field", async () => {
		await write(dir, "config.yaml", "version: 1\nagents: {}\nextra: true\n");
		await expectRejected(join(dir, "config.yaml"), /extra.*unknown field/i);
	});

	it("rejects an unknown agent field such as `toolz`", async () => {
		await expectRejected(await config(`${valid}    toolz: [write]\n`), /agents\.reader\.toolz.*unknown field/i);
	});

	it.each(["version: 2\n", "", "version: '1'\n"])("rejects unsupported version %j", async (head) => {
		await expectRejected(await config(valid, head), /version/i);
	});

	it("rejects aliases", async () => {
		await expectRejected(
			await config(`    persona: ./personas/reader.md\n    tools: &t [read]\n    skills: *t\n`),
			/alias/i,
		);
	});

	it("rejects custom tags", async () => {
		await expectRejected(await config("    persona: ./personas/reader.md\n    tools: !custom [read]\n"), /tag/i);
	});
});

describe("agent settings", () => {
	it.each(["Reader", "1reader", "read_er", "", "a".repeat(65)])("rejects invalid name %j", async (name) => {
		await write(dir, "personas/reader.md", "Read things.");
		await write(dir, "config.yaml", `version: 1\nagents:\n  ${JSON.stringify(name)}:\n${valid}`);
		await expectRejected(join(dir, "config.yaml"), /name/i);
	});

	it("requires a tools list", async () => {
		await expectRejected(
			await config("    persona: ./personas/reader.md\n    thinking: off\n"),
			/agents\.reader\.tools.*required/i,
		);
	});

	it.each(["*", "read*", "mcp:context7", "mcp__ctx__*", "read write", ""])(
		"rejects non-exact tool %j",
		async (tool) => {
			await expectRejected(
				await config(`    persona: ./personas/reader.md\n    tools: [${JSON.stringify(tool)}]\n    thinking: off\n`),
				/exact/i,
			);
		},
	);

	it("requires an explicit thinking variant before any child starts", async () => {
		await expectRejected(
			await config(valid.replace("    thinking: off\n", "")),
			/agents\.reader\.thinking.*(required|must be one of).*off/,
		);
	});

	it.each(["turbo", "''", "null", "12", "true", "[]", "{}"])(
		"rejects thinking %s with supported variants",
		async (thinking) => {
			await expectRejected(
				await config(valid.replace("thinking: off", `thinking: ${thinking}`)),
				/agents\.reader\.thinking.*off, minimal, low, medium, high, xhigh, max/,
			);
		},
	);

	it.each(["''", "[a]", "12"])("rejects invalid model %s", async (model) => {
		await expectRejected(await config(`${valid}    model: ${model}\n`), /agents\.reader\.model/);
	});
});

describe("persona file", () => {
	it.each([
		[false, "runs/session-1/run-1/output.md"],
		[true, "runs/session-1/run-1/output.md"],
		[false, "runs/..persona.md"],
		[true, "runs/..persona.md"],
	])("rejects run evidence as a persona (symbolic link: %s, path: %s)", async (linked, evidence) => {
		vi.stubEnv("PI_CODING_AGENT_DIR", root);
		await write(dir, evidence as string, "Untrusted model output.");
		await write(
			dir,
			"config.yaml",
			`version: 1\nagents:\n  reader:\n${valid.replace("./personas/reader.md", linked ? "./personas/evidence.md" : `./${evidence}`)}`,
		);
		if (linked) {
			await mkdir(join(dir, "personas"), { recursive: true });
			await symlink(join(dir, evidence as string), join(dir, "personas/evidence.md"));
		}
		await expectRejected(join(dir, "config.yaml"), /agents\.reader\.persona.*resolves inside the OMPS run folder/);
	});

	it("accepts a contained filename beginning with two dots outside run evidence", async () => {
		await write(dir, "..persona.md", "Trusted instructions.");
		const path = await config(valid.replace("./personas/reader.md", "./..persona.md"));
		expect((await loadRegistry(path)).agents.get("reader")?.persona).toBe("Trusted instructions.");
	});

	it("accepts a sibling of the run folder without confusing its shared prefix", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", root);
		await mkdir(join(dir, "runs"));
		await write(dir, "runs-archive/reader.md", "Trusted instructions.");
		const path = await config(valid.replace("./personas/reader.md", "./runs-archive/reader.md"));
		expect((await loadRegistry(path)).agents.get("reader")?.persona).toBe("Trusted instructions.");
	});

	it("keeps an unrelated registry's runs folder available when the OMPS run root is elsewhere", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", outside);
		await mkdir(join(outside, "omps/runs"), { recursive: true });
		await write(dir, "runs/reader.md", "Trusted instructions.");
		const path = await config(valid.replace("./personas/reader.md", "./runs/reader.md"));
		expect((await loadRegistry(path)).agents.get("reader")?.persona).toBe("Trusted instructions.");
	});

	it("refuses a persona beneath the canonical target of a linked run root", async () => {
		vi.stubEnv("PI_CODING_AGENT_DIR", root);
		await write(dir, "evidence/output.md", "Untrusted model output.");
		await symlink(join(dir, "evidence"), join(dir, "runs"));
		const path = await config(valid.replace("./personas/reader.md", "./evidence/output.md"));
		await expectRejected(path, /agents\.reader\.persona.*resolves inside the OMPS run folder/);
	});

	it("rejects frontmatter", async () => {
		const path = await config(valid);
		await write(dir, "personas/reader.md", "---\ntools: read\n---\nRead things.");
		await expectRejected(path, /frontmatter/i);
	});

	it.each([
		["missing", async () => rm(join(dir, "personas/reader.md"))],
		["empty", async () => write(dir, "personas/reader.md", "  \n")],
		[
			"a directory",
			async () => {
				await rm(join(dir, "personas/reader.md"));
				await mkdir(join(dir, "personas/reader.md"));
			},
		],
		["unreadable", async () => chmod(join(dir, "personas/reader.md"), 0o000)],
	])("rejects a %s persona", async (_label, breakIt) => {
		const path = await config(valid);
		await breakIt();
		await expectRejected(path, /agents\.reader\.persona/);
	});

	it("rejects a traversal path outside the extension directory", async () => {
		await write(outside, "evil.md", "Outside.");
		const path = await config(
			`    persona: ../../${outside.split("/").pop()}/evil.md\n    tools: [read]\n    thinking: off\n`,
		);
		await expectRejected(path, /outside/i);
	});

	it("rejects an absolute path outside the extension directory", async () => {
		await write(outside, "evil.md", "Outside.");
		await expectRejected(
			await config(`    persona: ${join(outside, "evil.md")}\n    tools: [read]\n    thinking: off\n`),
			/outside/i,
		);
	});

	it("rejects a symbolic link that escapes the extension directory", async () => {
		await write(outside, "evil.md", "Outside.");
		const path = await config(valid);
		await rm(join(dir, "personas/reader.md"));
		await symlink(join(outside, "evil.md"), join(dir, "personas/reader.md"));
		await expectRejected(path, /outside/i);
	});
});

describe("ui settings", () => {
	const uiHead = (ui: string) => `version: 1
ui:
${ui}`;

	it("rejects a non-mapping ui value", async () => {
		await expectRejected(await config(valid, "version: 1\nui: [1]\n"), /ui.*must be a mapping/i);
	});

	it("rejects an unknown ui field", async () => {
		await expectRejected(await config(valid, uiHead("  visible: 5\n")), /ui\.visible.*unknown field/i);
	});

	it.each([0, -1, 257, 2.5, '"5"', "null", "[]"])("rejects maxVisibleAgents %s", async (value) => {
		await expectRejected(
			await config(valid, uiHead(`  maxVisibleAgents: ${value}\n`)),
			/ui\.maxVisibleAgents.*1 to 256/i,
		);
	});

	const invalidKeys = ["''", '"alt o"', '"CTRL+O"', '"Alt+O"', 12, '"f13"', '"[]"', '"control+o"', '"ctrl+"'];
	it.each(invalidKeys)("rejects invalid toggleKey %s", async (key) => {
		await expectRejected(await config(valid, uiHead(`  toggleKey: ${key}\n`)), /ui\.toggleKey.*(key|off)/i);
	});

	it("rejects ctrl+i because legacy terminals read it as Tab", async () => {
		await expectRejected(await config(valid, uiHead('  toggleKey: "ctrl+i"\n')), /ui\.toggleKey.*(ctrl\+i|tab)/i);
	});

	it("rejects tab as the inspection key", async () => {
		await expectRejected(await config(valid, uiHead("  inspectKey: tab\n")), /ui\.inspectKey.*(ctrl\+i|tab)/i);
	});

	it("rejects duplicate fleet and inspection keys", async () => {
		await expectRejected(
			await config(valid, uiHead('  toggleKey: "alt+p"\n  inspectKey: "alt+p"\n')),
			/ui\.inspectKey.*duplicate.*alt\+p/i,
		);
	});

	it.each(["hidden", '"Expanded"', "12", "true", "[]"])("rejects fleetView %s", async (value) => {
		await expectRejected(
			await config(valid, uiHead(`  fleetView: ${value}\n`)),
			/ui\.fleetView.*expanded.*collapsed.*off/i,
		);
	});

	it("rejects duplicate keys written in another modifier order", async () => {
		await expectRejected(
			await config(valid, uiHead('  toggleKey: "ctrl+alt+p"\n  inspectKey: "alt+ctrl+p"\n')),
			/ui\.inspectKey.*duplicate/i,
		);
	});

	it("rejects an off value spelled differently", async () => {
		await expectRejected(await config(valid, uiHead('  inspectKey: "disabled"\n')), /ui\.inspectKey.*(key|off)/i);
	});
});

describe("skills and extensions", () => {
	it("rejects a missing skill file", async () => {
		await expectRejected(await config(`${valid}    skills: [./skills/none/SKILL.md]\n`), /agents\.reader\.skills/);
	});

	it("rejects a missing extension path", async () => {
		await expectRejected(await config(`${valid}    extensions: [./ext/none.ts]\n`), /agents\.reader\.extensions/);
	});
});
