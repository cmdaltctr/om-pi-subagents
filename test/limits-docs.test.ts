import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/config.ts";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("public parallel and nested guidance", () => {
	it("validates the README limits example with the real YAML parser", async () => {
		const readme = await read("README.md");
		const block = /<!-- docs-test: limits -->\s*```yaml\n([\s\S]*?)```/.exec(readme);
		expect(block).not.toBeNull();
		const directory = await mkdtemp(join(tmpdir(), "omps-doc-limits-"));
		try {
			const path = join(directory, "registry.yaml");
			await writeFile(path, block![1]);
			expect((await loadRegistry(path)).limits).toEqual({ maxConcurrentRuns: 4, maxDepth: 3 });
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	it("covers configured limits, branch ceilings, explicit todo mapping and skill loading", async () => {
		const setup = await read("docs/SETUP.md");
		const usage = await read("docs/USAGE.md");
		for (const term of [
			"maxConcurrentRuns",
			"maxDepth",
			"defaults",
			"depth zero",
			"84",
			"inherited",
			"extensions:",
			"skills:",
			"todo",
			"/skill:om-pi-subagents",
		])
			expect(`${setup}\n${usage}`, term).toContain(term);
		expect(usage).toContain("subtree");
		expect(usage).toContain("parent's OpenSpec");
		expect(usage).toContain("immediate parent");
		expect(usage).toContain("cleanup");
		expect(usage).not.toContain("An agent cannot start another agent.");
		expect(usage).not.toContain("### One run per session");
		expect(await read("README.md")).not.toContain("A child that starts another child.");
	});

	it("keeps project instructions consistent with configured capacity and approved nesting", async () => {
		const instructions = await read("AGENTS.md");
		expect(instructions).toContain("limits.maxConcurrentRuns");
		expect(instructions).toContain("inherited plus fresh depth ceilings");
		expect(instructions).not.toContain("Keep one child active per parent session.");
		expect(instructions).not.toContain("the single active run");
		const context = await read("openspec/config.yaml");
		expect(context).toContain("direct-child capacity per parent session");
		expect(context).toContain("Exact omps approval permits nesting");
		expect(context).not.toContain("one native RPC child per parent session");
	});

	it("explains skill installation, subtree removal and rollback compatibility", async () => {
		expect(await read("docs/INSTALL.md")).toContain("/skill:om-pi-subagents");
		expect(await read("docs/INSTALL.md")).toContain("limits");
		expect(await read("docs/UNINSTALL.md")).toContain("subtree");
		expect(await read("docs/UNINSTALL.md")).toContain("/skill:om-pi-subagents");
	});
});
