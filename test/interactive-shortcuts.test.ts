import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hosts = [
	{ version: "0.99.1", modules: process.env.PI_HOST_MODULES ?? resolve(".pi-host/node_modules") },
	{ version: "1.0.4", modules: process.env.OMPS_CURRENT_HOST_MODULES },
];
const scenarios = [
	"defaults",
	"off",
	"conflict",
	"reorder",
	"tab",
	"custom",
	"reload",
	"navigation-conflict",
	"navigation-released",
	"navigation-reload",
];
for (const host of hosts)
	describe.skipIf(!host.modules)(`OMPS view shortcuts ${host.version}`, () => {
		for (const scenario of scenarios)
			it(`registers and dispatches: ${scenario}`, () => {
				const directory = mkdtempSync(join(tmpdir(), "omps-shortcuts-"));
				try {
					const modules = resolve(host.modules!);
					expect(existsSync(join(modules, "@earendil-works/pi-tui/dist/index.js"))).toBe(true);
					expect(
						JSON.parse(readFileSync(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8")).version,
					).toBe(host.version);
					const config = join(directory, "tsconfig.json");
					writeFileSync(
						config,
						JSON.stringify({
							compilerOptions: {
								baseUrl: directory,
								paths: {
									"@earendil-works/pi-tui": [join(modules, "@earendil-works/pi-tui/dist/index.js")],
									"@earendil-works/pi-coding-agent": [join(modules, "@earendil-works/pi-coding-agent/dist/index.js")],
								},
							},
						}),
					);
					const result = spawnSync(
						"bun",
						[
							"--tsconfig-override",
							config,
							new URL("./fixtures/interactive-shortcuts.mjs", import.meta.url).pathname,
							modules,
							scenario,
						],
						{
							cwd: resolve("."),
							env: { ...process.env, PI_CODING_AGENT_DIR: directory, XDG_CONFIG_HOME: directory },
							encoding: "utf8",
							timeout: 30_000,
							shell: false,
						},
					);
					expect(result.error).toBeUndefined();
					expect(result.status, result.stderr).toBe(0);
					expect(JSON.parse(result.stdout)).toEqual({ scenario, verified: true });
				} finally {
					rmSync(directory, { recursive: true, force: true });
				}
			});
	});
