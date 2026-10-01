import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);

it("caches the exact pinned host versions after one install", async () => {
	const scratch = await mkdtemp(join(tmpdir(), "ompss-host-cache-"));
	try {
		await mkdir(join(scratch, "scripts"));
		await mkdir(join(scratch, "bin"));
		await mkdir(join(scratch, ".pi-host/node_modules/@earendil-works/pi-coding-agent"), { recursive: true });
		await copyFile(resolve(import.meta.dirname, "../scripts/setup-host.sh"), join(scratch, "scripts/setup-host.sh"));
		const fakeBun = join(scratch, "bin/bun");
		await writeFile(fakeBun, '#!/bin/sh\nprintf "install\\n" >> "$SETUP_INSTALL_LOG"\n');
		await chmod(fakeBun, 0o755);
		const env = {
			...process.env,
			PATH: `${join(scratch, "bin")}:${process.env.PATH}`,
			PI_HOST_MODULES: "",
			PI_HOST_VERSION: "0.99.1",
			TYPEBOX_VERSION: "1.3.27",
			SETUP_INSTALL_LOG: join(scratch, "installs.log"),
		};
		await run("bash", ["scripts/setup-host.sh"], { cwd: scratch, env });
		await run("bash", ["scripts/setup-host.sh"], { cwd: scratch, env });
		expect(await readFile(join(scratch, "installs.log"), "utf8")).toBe("install\n");
		expect(await readFile(join(scratch, ".pi-host/.versions"), "utf8")).toBe("0.99.1 1.3.27");
	} finally {
		await rm(scratch, { recursive: true, force: true });
	}
});
