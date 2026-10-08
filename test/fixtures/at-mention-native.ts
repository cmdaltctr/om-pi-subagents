import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect } from "vitest";

/** Run a disposable native host in a separate process, with the pinned peer packages. */
export function runAtMentionNative(script: string, scenario?: string): Record<string, any> {
	const directory = mkdtempSync(join(tmpdir(), "omps-at-native-"));
	try {
		const modules = resolve(process.env.PI_HOST_MODULES ?? ".pi-host/node_modules");
		expect(
			JSON.parse(readFileSync(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8")).version,
		).toBe("0.99.1");
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
				new URL(`./${script}.mjs`, import.meta.url).pathname,
				modules,
				...(scenario ? [scenario] : []),
			],
			{
				cwd: resolve("."),
				shell: false,
				encoding: "utf8",
				timeout: 35_000,
				env: {
					...process.env,
					OMPS_CHILD: "",
					OMPS_REGISTRY: "",
					PI_CODING_AGENT_DIR: directory,
					HOME: directory,
					XDG_CONFIG_HOME: directory,
				},
			},
		);
		expect(result.error).toBeUndefined();
		expect(result.status, result.stderr).toBe(0);
		return JSON.parse(result.stdout);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}
