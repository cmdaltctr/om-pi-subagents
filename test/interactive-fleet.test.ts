import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hosts = [
	{ version: "0.99.1", modules: process.env.PI_HOST_MODULES ?? resolve(".pi-host/node_modules") },
	{ version: "1.0.4", modules: process.env.OMPS_CURRENT_HOST_MODULES },
];
for (const host of hosts)
	describe.skipIf(!host.modules)(`OMPS fleet navigation ${host.version}`, () => {
		it.each([
			["regular", "dark"],
			["regular", "light"],
			["fullscreen", "dark"],
			["fullscreen", "light"],
		] as const)("keeps %s input safe with the %s theme", (mode, theme) => {
			const directory = mkdtempSync(join(tmpdir(), "omps-fleet-"));
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
						new URL("./fixtures/interactive-fleet.mjs", import.meta.url).pathname,
						modules,
						mode,
						theme,
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
				expect(JSON.parse(result.stdout)).toEqual({ mode, theme, verified: true });
			} finally {
				rmSync(directory, { recursive: true, force: true });
			}
		});
	});
