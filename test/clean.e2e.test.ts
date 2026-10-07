// Independent clean-environment test: no pi-subagents, no legacy settings, no legacy artefacts, an empty HOME.
// A real parent Pi loads the installed extension and starts real children.
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { groupAlive } from "../src/runner.ts";
import { installExtension, SOURCE, type Installed } from "./fixtures/install.ts";
import type { Turn } from "./fixtures/fake-model.ts";

const PERSONA = "CLEAN-ENV-PERSONA: you read files.";
// The OMPS preference path shares the legacy name; package references remain forbidden.
const LEGACY_SOURCE =
	/(^|[^\w-])pi-subagents(?!",\s*"config\.json"\))|(?:from\s*|(?:import|require)\s*\(\s*)["'][^"']*subagent/;

suite("legacy package source guard", () => {
	it("allows the approved OMPS display preference directory", () => {
		expect('return join(configDir, "pi-subagents", "config.json");').not.toMatch(LEGACY_SOURCE);
	});
	it.each([
		'import agent from "pi-subagents";',
		'await import("pi-subagents");',
		'await import("pi-subagents", "config.json");',
		'require("pi-subagents", "config.json");',
		'import agent from "./subagent.ts";',
		'const packageName = "pi-subagents";',
	])("still rejects legacy package references: %s", (source) => {
		expect(source).toMatch(LEGACY_SOURCE);
	});
});
let env: Installed | undefined;
afterEach(async () => {
	await env?.cleanup();
	env = undefined;
});

const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 30_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

const isChild = (request: unknown) => JSON.stringify(request).includes("CLEAN-ENV-PERSONA");
const notices = (installed: Installed) =>
	installed.fixture.records
		.filter((r) => r.type === "extension_ui_request" && r.method === "notify")
		.map((r) => r.message as string);

async function start() {
	env = await installExtension();
	await mkdir(join(env.fixture.agentDir, "personas"));
	await writeFile(join(env.fixture.agentDir, "personas", "reader.md"), PERSONA);
	await writeFile(
		join(env.fixture.agentDir, "om-pi-subagents.yaml"),
		"version: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n",
	);
	await writeFile(join(env.fixture.cwd, "note.txt"), "NOTE-CONTENT-88");
	return env;
}

const runDirectory = async (installed: Installed) => {
	// nosemgrep: AIK_ts_generic_path_traversal -- The installed fixture directory is generated and appended path segments are fixed literals.
	const root = join(installed.fixture.agentDir, "omps", "runs");
	const [session] = await readdir(root).catch(() => []);
	// nosemgrep: AIK_ts_generic_path_traversal -- The fixture root is generated and readdir names cannot contain path separators.
	const [run] = session ? await readdir(join(root, session)) : [];
	// nosemgrep: AIK_ts_generic_path_traversal -- The fixture root is generated and readdir names cannot contain path separators.
	return run ? join(root, session, run) : undefined;
};
const statusOf = async (installed: Installed) => {
	const directory = await runDirectory(installed);
	// nosemgrep: AIK_ts_generic_path_traversal -- The directory comes from the generated fixture root and the filename is fixed.
	return directory ? JSON.parse(await readFile(join(directory, "status.json"), "utf8").catch(() => "{}")) : {};
};

/** Every path under `root`, recursively, without following links. */
const walk = (root: string): string[] =>
	readdirSync(root, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() && !entry.isSymbolicLink()
			? // nosemgrep: AIK_ts_generic_path_traversal -- Walk starts at a generated fixture root and readdir names cannot contain path separators.
				[join(root, entry.name), ...walk(join(root, entry.name))]
			: // nosemgrep: AIK_ts_generic_path_traversal -- Walk starts at a generated fixture root and readdir names cannot contain path separators.
				[join(root, entry.name)],
	);

describe("the environment is clean", () => {
	it("has no legacy package, settings or artefacts, and rejects legacy source references", async () => {
		const handle = await start();
		const { installed, fixture, home } = handle;
		expect(readdirSync(fixture.agentDir).sort()).toEqual(
			["mcp.json", "models.json", "om-pi-subagents.yaml", "personas"].filter((name) =>
				readdirSync(fixture.agentDir).includes(name),
			),
		);
		expect(readdirSync(home)).toEqual([]);
		for (const path of [
			...walk(installed).filter((p) => !p.includes("node_modules")),
			...walk(fixture.agentDir),
			...walk(home),
		])
			expect(path, path).not.toMatch(/(^|[^\w-])pi-subagents|(^|\/)subagents?(\/|$)|subagent-/i);

		const dependencies = JSON.parse(readFileSync(join(SOURCE, "package.json"), "utf8"));
		const declared = [dependencies.dependencies, dependencies.devDependencies, dependencies.peerDependencies].flatMap(
			(group) => Object.keys(group ?? {}),
		);
		expect(declared.filter((name) => /subagent/i.test(name))).toEqual([]);
		for (const name of readdirSync(installed).filter((n) => n.endsWith(".ts")))
			expect(readFileSync(join(installed, name), "utf8"), name).not.toMatch(LEGACY_SOURCE);
	});
});

describe("OMPS in that environment", () => {
	it("starts, lists its agent, runs an approved tool, persists the result and leaves no process", async () => {
		const handle = await start();
		const fixture = handle.fixture;

		await fixture.send({ type: "prompt", message: "/omps list" });
		await waitFor(() => notices(handle).some((text) => /^reader: 1 tool \(read-only\)$/.test(text)));

		fixture.model.script = (body): Turn => {
			const text = JSON.stringify(body);
			if (!isChild(body)) return { text: "parent ok" };
			return text.includes('"role":"tool"')
				? { text: "I read it" }
				: { tool: "read", args: { path: join(fixture.cwd, "note.txt") } };
		};
		await fixture.send({ type: "prompt", message: "/omps run reader read the note" });
		await waitFor(async () => (await statusOf(handle)).state === "completed");

		const directory = (await runDirectory(handle))!;
		expect(await readFile(join(directory, "output.md"), "utf8")).toBe("I read it");
		expect(JSON.stringify(fixture.model.requests.findLast(isChild))).toContain("NOTE-CONTENT-88"); // the approved tool ran
		expect((await stat(directory)).mode & 0o777).toBe(0o700);
		const { pid } = await statusOf(handle);
		expect(groupAlive(pid)).toBe(false);
	});

	it("cancels a running child and leaves no process", async () => {
		const handle = await start();
		const fixture = handle.fixture;
		fixture.model.script = (body): Turn => (isChild(body) ? { hang: true } : { text: "parent ok" });
		await fixture.send({ type: "prompt", message: "/omps run reader wait" });
		await waitFor(async () => (await statusOf(handle)).state === "running" && fixture.model.requests.some(isChild));
		const { pid } = await statusOf(handle);
		expect(groupAlive(pid)).toBe(true);

		const id = (await statusOf(handle)).id as string;
		await fixture.send({ type: "prompt", message: `/omps cancel ${id}` });
		await waitFor(async () => (await statusOf(handle)).state === "cancelled");
		expect(groupAlive(pid)).toBe(false);
	});

	it("still works in a fresh session after the old one ended", async () => {
		const handle = await start();
		const fixture = handle.fixture;
		await fixture.send({ type: "new_session" });
		await fixture.send({ type: "prompt", message: "/omps list" });
		await waitFor(() => notices(handle).some((text) => /^reader: 1 tool \(read-only\)$/.test(text)));
	});
});
