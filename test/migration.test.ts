import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
