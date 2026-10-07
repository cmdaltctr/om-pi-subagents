import { spawnSync } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { loadRegistry } from "../src/config.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const guide = await readFile(new URL("../docs/INSTALL.md", import.meta.url), "utf8");
let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-migration-"));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

function script(name: string): string {
	const match = new RegExp(`<!-- migration-test: ${name} -->\\s*\x60\x60\x60sh\\n([\\s\\S]*?)\x60\x60\x60`).exec(guide);
	expect(match, `Missing executable ${name} guide example`).not.toBeNull();
	return match![1];
}

describe("manual settings migration", () => {
	const yaml = "version: 1\nagents:\n  reader:\n    persona: ./om-pi-subagents/personas/reader.md\n    tools: [read]\n    thinking: off\n";
	async function seed() {
		await mkdir(join(root, "om-pi-subagents/personas"), { recursive: true });
		await writeFile(join(root, "om-pi-subagents/personas/reader.md"), "Trusted persona.\n");
		await writeFile(join(root, "om-pi-subagents.yaml"), yaml);
	}
	const run = () => spawnSync("bash", ["-c", script("settings")], {
		env: { ...process.env, PI_CODING_AGENT_DIR: root }, encoding: "utf8",
	});

	it("preserves saved evidence, loads the edited mapping and restores the backup byte for byte", async () => {
		await seed();
		const original = (await loadRegistry(join(root, "om-pi-subagents.yaml"))).agents.get("reader")!;
		await cp(join(root, "om-pi-subagents.yaml"), join(root, "registry.bak"));
		await cp(join(root, "om-pi-subagents/personas"), join(root, "personas.bak"), { recursive: true });
		const evidence = Buffer.from("Historical run evidence\u0000\n");
		const runFolder = join(root, "omps/runs/session-1/run-1");
		await mkdir(runFolder, { recursive: true });
		await writeFile(join(runFolder, "output.md"), evidence);
		expect(run().status).toBe(0);
		expect(await readFile(join(root, "omps/config.yaml"), "utf8")).toBe(yaml);
		await writeFile(join(root, "omps/config.yaml"), yaml.replace("./om-pi-subagents/personas/", "./personas/"));
		const migrated = (await loadRegistry(join(root, "omps/config.yaml"))).agents.get("reader")!;
		expect(migrated.persona).toBe(original.persona);
		expect(migrated.tools).toEqual(original.tools);
		expect(await readFile(join(runFolder, "output.md"))).toEqual(evidence);
		await cp(join(root, "registry.bak"), join(root, "om-pi-subagents.yaml"));
		await cp(join(root, "personas.bak/reader.md"), join(root, "om-pi-subagents/personas/reader.md"));
		expect(await readFile(join(root, "om-pi-subagents.yaml"))).toEqual(await readFile(join(root, "registry.bak")));
		expect(await readFile(join(root, "om-pi-subagents/personas/reader.md"))).toEqual(await readFile(join(root, "personas.bak/reader.md")));
	});

	it.each(["config.yaml", "personas/reader.md"])("refuses collision %s before moving either source", async (collision) => {
		await seed();
		const target = join(root, "omps", collision);
		await mkdir(join(root, "omps/personas"), { recursive: true });
		await writeFile(target, "Existing destination.");
		expect(run().status).not.toBe(0);
		expect(await readFile(target, "utf8")).toBe("Existing destination.");
		expect(await readFile(join(root, "om-pi-subagents.yaml"), "utf8")).toBe(yaml);
		expect(await readFile(join(root, "om-pi-subagents/personas/reader.md"), "utf8")).toBe("Trusted persona.\n");
	});
});

describe("manual migration examples", () => {
	it.each([
		["runs", "ompss/runs", "omps/runs"],
		["extension", "extensions/ompss", "extensions/omps"],
	])("%s preserves evidence bytes and refuses an existing destination", async (name, oldPath, newPath) => {
		const source = join(root, oldPath);
		const destination = join(root, newPath);
		await mkdir(source, { recursive: true });
		const evidence = Buffer.from("Historical ompss evidence\u0000\n");
		await writeFile(join(source, "evidence.bin"), evidence);
		const run = () =>
			spawnSync("bash", ["-c", script(name)], {
				env: { ...process.env, PI_CODING_AGENT_DIR: root },
				encoding: "utf8",
			});
		expect(run().status).toBe(0);
		expect(await readFile(join(destination, "evidence.bin"))).toEqual(evidence);
		await mkdir(source, { recursive: true });
		await writeFile(join(source, "other.bin"), "New source history");
		expect(run().status).not.toBe(0);
		expect(await readFile(join(destination, "evidence.bin"))).toEqual(evidence);
		expect(await readdir(destination)).toEqual(["evidence.bin"]);
		expect(await readFile(join(source, "other.bin"), "utf8")).toBe("New source history");
	});
});
