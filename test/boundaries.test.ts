// Sibling-boundary check (task 5.5): first-party source and the shipped package stay independent
// of om-pi-todo and om-memory-system internals. Test-only development dependencies are allowed;
// imports, runtime dependencies and todo-result parsing are not. The scan itself is proven able
// to fail by planting violations in a disposable copy.
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SIBLING_IMPORT = /(?:from\s+|import\()["']om-(?:pi-todo|memory-system)/;
const TODO_SEAM = /pi-todo-session/;

async function* walk(directory: string): AsyncGenerator<string> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.name.endsWith(".ts")) yield path;
	}
}

/** Every boundary violation found beneath one source tree, plus its package manifest findings. */
export async function boundaryViolations(root: string): Promise<string[]> {
	const findings: string[] = [];
	for await (const path of walk(join(root, "src"))) {
		const text = await readFile(path, "utf8");
		if (SIBLING_IMPORT.test(text)) findings.push(`sibling import: ${path}`);
		if (TODO_SEAM.test(text) && !path.endsWith("todo-bootstrap.ts"))
			findings.push(`todo replay seam outside the bootstrap: ${path}`);
	}
	try {
		const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
		for (const dependency of Object.keys(manifest.dependencies ?? {}))
			if (/^om-(pi-todo|memory-system)/.test(dependency))
				findings.push(`runtime dependency on a sibling: ${dependency}`);
	} catch {
		/* A tree without a manifest has no runtime-dependency claim to check. */
	}
	return findings;
}

describe("sibling boundaries", () => {
	it("keeps first-party source, runtime dependencies and todo parsing independent", async () => {
		expect(await boundaryViolations(process.cwd())).toEqual([]);
	});

	it("fails when a disposable copy adds a sibling client import, result parser or runtime dependency", async () => {
		const root = await mkdtemp(join(tmpdir(), "omps-boundary-"));
		try {
			await writeFile(
				join(root, "violating.ts"),
				'import { memoryClient } from "om-memory-system/dist/services/client.js";\nconst tasks = JSON.parse(result).tasks;\n',
				{ flag: "w" },
			);
			await writeFile(join(root, "todo-parse.ts"), 'const mode = JSON.parse(entry).mode === "pi-todo-session";\n');
			// Nested under src/ so the scan sees it; a manifest dependency completes the violation set.
			await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { "om-pi-todo": "0.2.0" } }));
			// Move the planted files into src after the manifest is in place.
			const { mkdir, rename } = await import("node:fs/promises");
			await mkdir(join(root, "src"), { recursive: true });
			await rename(join(root, "violating.ts"), join(root, "src", "violating.ts"));
			await rename(join(root, "todo-parse.ts"), join(root, "src", "todo-parse.ts"));
			const findings = await boundaryViolations(root);
			expect(findings).toContain(`sibling import: ${join(root, "src", "violating.ts")}`);
			expect(findings).toContain(`todo replay seam outside the bootstrap: ${join(root, "src", "todo-parse.ts")}`);
			expect(findings).toContain("runtime dependency on a sibling: om-pi-todo");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
