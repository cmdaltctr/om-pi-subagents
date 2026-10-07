import { cp, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PI_BIN, startPi, type FixtureOptions, type PiFixture } from "./pi-rpc.ts";

export const SOURCE = fileURLToPath(new URL("../../", import.meta.url));

export interface Installed {
	/** The installed copy of the extension, as the README's steps 1 and 2 leave it. */
	installed: string;
	fixture: PiFixture;
	/** Empty directory used as HOME, so nothing of the real user is visible. */
	home: string;
	cleanup(): Promise<void>;
}

/** Copy the extension sources into a fresh directory, link its one dependency, and start a real parent Pi that loads it. */
export async function installExtension(options: Pick<FixtureOptions, "env"> = {}): Promise<Installed> {
	const scratch = await mkdtemp(join(tmpdir(), "omps-install-"));
	const installed = join(scratch, "omps");
	const home = join(scratch, "home");
	await mkdir(installed);
	await mkdir(home);
	for (const name of await readdir(SOURCE)) {
		if (/\.(ts|yaml|json)$/.test(name) && !name.endsWith(".test.ts") && name !== "vitest.config.ts")
			await cp(join(SOURCE, name), join(installed, name));
	}
	await cp(join(SOURCE, "src"), join(installed, "src"), { recursive: true });
	await mkdir(join(installed, "node_modules"));
	await symlink(join(SOURCE, "node_modules", "yaml"), join(installed, "node_modules", "yaml")); // stands in for `bun install`
	const bin = join(scratch, "bin");
	await mkdir(bin);
	await symlink(PI_BIN, join(bin, "pi"));

	const fixture = await startPi({
		args: ["-e", join(installed, "src", "index.ts")],
		env: { PATH: `${bin}:${process.env.PATH}`, HOME: home, ...options.env },
		mcp: false,
	});
	return {
		installed,
		fixture,
		home,
		async cleanup() {
			await fixture.dispose();
			await rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		},
	};
}
