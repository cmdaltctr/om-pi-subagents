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
	describe.skipIf(!host.modules)(`OMPS native viewer ${host.version}`, () => {
		for (const mode of ["regular", "fullscreen"])
			it.each([
				["dark", false],
				["dark", true],
				["light", false],
				["light", true],
			] as const)(`${mode}: %s theme (delayed file reads: %s)`, (theme, delayedReads) => {
				const directory = mkdtempSync(join(tmpdir(), "omps-viewer-aliases-"));
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
					const preload = join(directory, "delayed-read.mjs");
					if (delayedReads)
						writeFileSync(
							preload,
							`import assert from "node:assert/strict";
import { open } from "node:fs/promises";
const handle = await open(import.meta.filename, "r");
const prototype = Object.getPrototypeOf(handle);
await handle.close();
const read = prototype.read;
let delayed = 0;
prototype.read = async function (...args) {
	delayed++;
	await new Promise((done) => setTimeout(done, 100));
	return read.apply(this, args);
};
process.on("exit", () => assert(delayed > 0, "regression must delay actual detail-file reads"));
`,
						);
					const result = spawnSync(
						"bun",
						[
							...(delayedReads ? ["--preload", preload] : []),
							"--tsconfig-override",
							config,
							new URL("./fixtures/interactive-viewer.mjs", import.meta.url).pathname,
							modules,
							mode,
							theme,
						],
						{
							cwd: resolve("."),
							env: { ...process.env, PI_CODING_AGENT_DIR: directory, XDG_CONFIG_HOME: directory },
							encoding: "utf8",
							timeout: 20_000,
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
