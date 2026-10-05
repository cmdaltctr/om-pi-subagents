import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
import { verifyTodoViewerChild } from "./fixtures/todo-viewer-rpc.ts";

describe.skipIf(!PI_AVAILABLE)("real managed todo child during operator UI actions", () => {
	it.each([
		["normal", "ompss-first"],
		["normal", "todo-first"],
		["openspec", "ompss-first"],
		["openspec", "todo-first"],
	] as const)("%s, %s: keeps child id one and parent binding untouched", verifyTodoViewerChild);
});

const hosts = [
	{ version: "0.99.1", modules: process.env.PI_HOST_MODULES ?? resolve(".pi-host/node_modules") },
	{ version: "1.0.2", modules: process.env.OMPSS_CURRENT_HOST_MODULES },
];

// Each process isolates the real todo package's preference cache, session slots and foreground widget.
// Native UI handlers are exercised without a complete interactive AgentSession or a physical terminal.
for (const host of hosts)
	describe.skipIf(!host.modules)(`real todo with OMPSS viewer on Pi ${host.version}`, () => {
		for (const terminalMode of ["regular", "fullscreen"])
			for (const todoMode of ["normal", "openspec"])
				for (const order of ["ompss-first", "todo-first"])
					it(`${terminalMode}, ${todoMode}, ${order}: isolates expansion, inspection and settings`, () => {
						const directory = mkdtempSync(join(tmpdir(), "ompss-todo-viewer-"));
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
										paths: {
											"@earendil-works/pi-tui": [join(modules, "@earendil-works/pi-tui/dist/index.js")],
											"@earendil-works/pi-ai": [join(modules, "@earendil-works/pi-ai/dist/index.js")],
											"@earendil-works/pi-coding-agent": [
												join(modules, "@earendil-works/pi-coding-agent/dist/index.js"),
											],
											typebox: [join(modules, "typebox/build/index.mjs")],
										},
									},
								}),
							);
							const result = spawnSync(
								"bun",
								[
									"--tsconfig-override",
									config,
									new URL("./fixtures/todo-viewer.mjs", import.meta.url).pathname,
									modules,
									terminalMode,
									todoMode,
									order,
								],
								{
									cwd: resolve("."),
									shell: false,
									timeout: 30_000,
									encoding: "utf8",
									env: {
										...process.env,
										HOME: directory,
										PI_CODING_AGENT_DIR: directory,
										XDG_CONFIG_HOME: directory,
										PI_OFFLINE: "1",
										PI_SKIP_VERSION_CHECK: "1",
										OMPSS_CHILD: "",
										OMPSS_REGISTRY: "",
										PATH: `${resolve("node_modules/.bin")}:${process.env.PATH}`,
									},
								},
							);
							expect(result.error).toBeUndefined();
							expect(result.status, result.stderr).toBe(0);
							expect(JSON.parse(result.stdout)).toEqual({ terminalMode, todoMode, order, verified: true });
						} finally {
							rmSync(directory, { recursive: true, force: true });
						}
					});
	});
