import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspace } from "./fixtures/pi-rpc.ts";

const pinnedModules = process.env.PI_HOST_MODULES ?? resolve(".pi-host/node_modules");

function findCurrentModules(): string | undefined {
	if (process.env.OMPSS_CURRENT_HOST_MODULES) return process.env.OMPSS_CURRENT_HOST_MODULES;
	for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
		const cli = join(directory, "pi");
		if (!existsSync(cli)) continue;
		const modules = resolve(dirname(realpathSync(cli)), "../../..");
		if (existsSync(join(modules, "@earendil-works/pi-coding-agent/package.json"))) return modules;
	}
	return undefined;
}

const currentModules = findCurrentModules();
const hosts = [
	{ version: "0.99.1", modules: pinnedModules },
	{ version: "1.0.2", modules: currentModules },
];

for (const host of hosts) {
	describe.skipIf(!host.modules)(`interactive host ${host.version}`, () => {
		for (const mode of ["regular", "fullscreen"]) {
			it(`${mode}: dispatches expansion, row clicks and overlay focus without personal settings`, async () => {
				const workspace = await createWorkspace({ mcp: false });
				try {
					const manifest = JSON.parse(
						readFileSync(join(host.modules!, "@earendil-works/pi-coding-agent/package.json"), "utf8"),
					);
					expect(manifest.version).toBe(host.version);
					const result = spawnSync(
						process.execPath,
						[new URL("./fixtures/interactive-host.mjs", import.meta.url).pathname, host.modules!, mode],
						{
							cwd: workspace.cwd,
							env: { ...process.env, ...workspace.isolationEnv },
							encoding: "utf8",
							timeout: 20_000,
							shell: false,
						},
					);
					expect(result.error).toBeUndefined();
					expect(result.status, result.stderr).toBe(0);
					expect(JSON.parse(result.stdout)).toEqual({ version: host.version, mode, verified: true });
				} finally {
					await workspace.dispose();
				}
			});
		}
	});
}
