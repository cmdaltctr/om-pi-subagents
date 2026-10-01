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

import { loadRegistry, RegistryError } from "./config.ts";

let dir: string;
let outside: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ompss-invalid-"));
	outside = await mkdtemp(join(tmpdir(), "ompss-outside-"));
	for (const spy of Object.values(processSpies)) spy.mockClear();
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	await rm(outside, { recursive: true, force: true });
	// Rejection must happen before any spawn.
	for (const [name, spy] of Object.entries(processSpies)) expect(spy, name).not.toHaveBeenCalled();
});

async function write(root: string, relativePath: string, text: string): Promise<void> {
	// nosemgrep: AIK_ts_generic_path_traversal -- This helper is called only with literal test paths below generated temporary roots.
	const target = join(root, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, text);
}

/** Write a YAML file whose `reader` agent body is `agentLines` (indented four spaces). */
async function config(agentLines: string, head = "version: 1\n"): Promise<string> {
	await write(dir, "personas/reader.md", "Read things.");
	await write(dir, "om-pi-subagents.yaml", `${head}agents:\n  reader:\n${agentLines}`);
	return join(dir, "om-pi-subagents.yaml");
}

const valid = "    persona: ./personas/reader.md\n    tools: [read]\n";

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
		await write(dir, "om-pi-subagents.yaml", "version: 1\nagents: [unclosed,\n");
		await expectRejected(join(dir, "om-pi-subagents.yaml"), /malformed yaml/i);
	});

	it("rejects duplicate agent names", async () => {
		const path = await config(`${valid}  reader:\n${valid}`);
		await expectRejected(path, /duplicate/i);
	});

	it("rejects an unknown top-level field", async () => {
		await write(dir, "om-pi-subagents.yaml", "version: 1\nagents: {}\nextra: true\n");
		await expectRejected(join(dir, "om-pi-subagents.yaml"), /extra.*unknown field/i);
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
		await write(dir, "om-pi-subagents.yaml", `version: 1\nagents:\n  ${JSON.stringify(name)}:\n${valid}`);
		await expectRejected(join(dir, "om-pi-subagents.yaml"), /name/i);
	});

	it("requires a tools list", async () => {
		await expectRejected(await config("    persona: ./personas/reader.md\n"), /agents\.reader\.tools.*required/i);
	});

	it.each(["*", "read*", "mcp:context7", "mcp__ctx__*", "read write", ""])(
		"rejects non-exact tool %j",
		async (tool) => {
			await expectRejected(
				await config(`    persona: ./personas/reader.md\n    tools: [${JSON.stringify(tool)}]\n`),
				/exact/i,
			);
		},
	);

	it("rejects an invalid thinking level", async () => {
		await expectRejected(await config(`${valid}    thinking: turbo\n`), /agents\.reader\.thinking/);
	});

	it.each(["''", "[a]", "12"])("rejects invalid model %s", async (model) => {
		await expectRejected(await config(`${valid}    model: ${model}\n`), /agents\.reader\.model/);
	});
});

describe("persona file", () => {
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
		const path = await config(`    persona: ../${outside.split("/").pop()}/evil.md\n    tools: [read]\n`);
		await expectRejected(path, /outside/i);
	});

	it("rejects an absolute path outside the extension directory", async () => {
		await write(outside, "evil.md", "Outside.");
		await expectRejected(await config(`    persona: ${join(outside, "evil.md")}\n    tools: [read]\n`), /outside/i);
	});

	it("rejects a symbolic link that escapes the extension directory", async () => {
		await write(outside, "evil.md", "Outside.");
		const path = await config(valid);
		await rm(join(dir, "personas/reader.md"));
		await symlink(join(outside, "evil.md"), join(dir, "personas/reader.md"));
		await expectRejected(path, /outside/i);
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
