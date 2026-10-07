import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { buildLaunch } from "../../src/runner.ts";
import { fixtureLineage } from "./lineage.ts";
import { PI_BIN, startPi, type WorkspaceOptions } from "./pi-rpc.ts";

export const TODO_VERSION = "0.2.0";

/** Resolve the real development package through its declared Pi extension entry. */
export async function resolveTodoExtension(): Promise<string> {
	const require = createRequire(import.meta.url);
	const manifestPath = require.resolve("om-pi-todo/package.json");
	const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
	if (manifest.version !== TODO_VERSION || manifest.pi?.extensions?.length !== 1)
		throw new Error(`Expected om-pi-todo ${TODO_VERSION} with one declared Pi extension entry.`);
	return resolve(dirname(manifestPath), manifest.pi.extensions[0]);
}

/** Seed preferences only beneath a disposable workspace's isolated XDG directory. */
export async function seedTodoPreferences(agentDir: string, mode: "normal" | "openspec"): Promise<string> {
	const directory = join(dirname(agentDir), "config", "pi-todo");
	await mkdir(directory, { recursive: true });
	const path = join(directory, "config.json");
	await writeFile(path, JSON.stringify({ mode }));
	return path;
}

/** Launch an isolated leaf or delegator with the real todo package mapped explicitly. */
export async function startTodoChild(
	options: {
		tools?: string[];
		extensions?: string[];
		mode?: "normal" | "openspec";
		maxDepth?: number;
		seed?: WorkspaceOptions["seed"];
	} = {},
) {
	const extension = await resolveTodoExtension();
	return startPi({
		mcp: false,
		env: { OMPS_PI_BIN: PI_BIN },
		seed: async (paths) => {
			await seedTodoPreferences(paths.agentDir, options.mode ?? "normal");
			await writeFile(join(paths.agentDir, "todo-child.md"), "TODO-CHILD-PERSONA-MARKER");
			await options.seed?.(paths);
		},
		launch: ({ cwd, agentDir }) =>
			buildLaunch({
				snapshot: {
					name: "todo-child",
					personaPath: "unused",
					persona: "TODO-CHILD-PERSONA-MARKER",
					tools: options.tools ?? ["todo"],
					thinking: "off",
					skills: [],
					extensions: options.extensions ?? [extension],
				},
				cwd,
				personaFile: join(agentDir, "todo-child.md"),
				guardPath: new URL("../../src/child-guard.ts", import.meta.url).pathname,
				runToken: "todo-token",
				piBin: PI_BIN,
				parentModel: "fake/counter",
				startupDeadlineMs: 2000,
				lineage: { ...fixtureLineage(join(agentDir, "om-pi-subagents.yaml")), maxDepth: options.maxDepth ?? 1 },
			}),
	});
}
