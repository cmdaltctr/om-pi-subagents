import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url).pathname;
// Character classes keep the audit pattern separate from the names it checks.
const oldName = /omps[s]|Omps[s]|OMPS[S]/;

async function files(path: string): Promise<string[]> {
	const result: string[] = [];
	for (const entry of await readdir(join(root, path), { withFileTypes: true })) {
		const child = join(path, entry.name);
		if (["docs/adr", "docs/tdr", "docs/local-docs"].includes(child)) continue;
		result.push(...(entry.isDirectory() ? await files(child) : [child]));
	}
	return result;
}

describe("current namespace audit", () => {
	it("allows old names only in migration guidance and explicit rejection evidence", async () => {
		const current = [
			"README.md",
			"AGENTS.md",
			"package.json",
			"openspec/config.yaml",
			...(await files("src")),
			...(await files("test")),
			...(await files("skills")),
			...(await files("docs")),
			...(await files("scripts")),
			...(await files(".github")),
		];
		const findings: string[] = [];
		for (const path of current) {
			if (!/\.(ts|mjs|md|json|yaml|yml|sh|svg)$/.test(path)) continue;
			const lines = (await readFile(join(root, path), "utf8")).split("\n");
			let rejection = false;
			let migration = false;
			for (const [index, line] of lines.entries()) {
				if (line.startsWith('describe("old namespace rejection"')) rejection = true;
				else if (line.startsWith("describe(")) rejection = false;
				if (path === "docs/INSTALL.md" && line.startsWith("## Migrate from")) migration = true;
				else if (line.startsWith("## ") && !line.startsWith("## Migrate from")) migration = false;
				if (!oldName.test(line)) continue;
				if (migration || (rejection && ["test/index.test.ts", "test/nesting.test.ts"].includes(path))) continue;
				if (path === "src/index.ts" && /throw new Error\("Old child namespace/.test(line)) continue;
				if (path === "test/index.test.ts" && line.includes("name.startsWith")) continue;
				if (path === "test/startup.gate.test.ts" && line.includes("const oldCommand =")) continue;
				if (path === "test/namespace-storage.e2e.test.ts" && /const oldRoot|const evidence/.test(line)) continue;
				if (path === "test/migration.test.ts" && /\["runs"|\["extension"|const evidence/.test(line)) continue;
				if (["docs/USAGE.md", "docs/UNINSTALL.md"].includes(path) && /older|Older|migration and rollback/.test(line))
					continue;
				findings.push(`${path}:${index + 1}: ${line.trim()}`);
			}
		}
		expect(findings).toEqual([]);
	});
});
