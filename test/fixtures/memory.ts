import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { buildLaunch } from "../../src/runner.ts";
import { fixtureLineage } from "./lineage.ts";
import { PI_BIN, startPi, type Workspace } from "./pi-rpc.ts";
import type { FakeModel } from "./fake-model.ts";

/** The sibling version this fixture was inspected against. */
export const MEMORY_VERSION = "4.8.0";

const entryOf = (manifestDir: string): string => {
	const manifest = JSON.parse(readFileSync(join(manifestDir, "package.json"), "utf8"));
	if (manifest.version !== MEMORY_VERSION || manifest.pi?.extensions?.length !== 1)
		throw new Error(`Expected om-memory-system ${MEMORY_VERSION} with one declared Pi extension entry.`);
	return resolve(manifestDir, manifest.pi.extensions[0]);
};

/**
 * Resolve the real OMMS Pi extension entry. An explicit override wins, then a local install,
 * then this machine's global Pi-managed copy. Absent everywhere, the caller reports a test gap.
 */
export function resolveMemoryExtension(): string | undefined {
	if (process.env.OMPS_OMMS_ENTRY) return process.env.OMPS_OMMS_ENTRY;
	const candidates = [
		join(process.cwd(), "node_modules", "om-memory-system"),
		join(homedir(), ".pi", "agent", "npm", "node_modules", "om-memory-system"),
	];
	for (const directory of candidates) if (existsSync(join(directory, "package.json"))) return entryOf(directory);
	return undefined;
}

/** Whether the inspected sibling is resolvable on this machine. */
export const memoryAvailable = (): boolean => {
	try {
		return resolveMemoryExtension() !== undefined;
	} catch {
		return false;
	}
};

/**
 * Seed a disposable OMMS configuration beneath an isolated HOME: fake local embeddings,
 * a workspace-local store, and every network maintenance path disabled.
 */
export async function seedMemoryConfig(
	home: string,
	model: FakeModel,
	options: { autoCapture?: boolean } = {},
): Promise<string> {
	const directory = join(home, ".config", "omms");
	await mkdir(directory, { recursive: true });
	const path = join(directory, "omms.json");
	await writeFile(
		path,
		JSON.stringify(
			{
				storagePath: join(home, "omms-store"),
				embeddingApiUrl: model.baseUrl,
				embeddingModel: "fake-embeddings",
				embeddingDimensions: 64,
				webServerAutoStart: false,
				autoBackfill: false,
				autoCaptureEnabled: options.autoCapture ?? false,
			},
			null,
			2,
		),
	);
	return path;
}

/** Where the seeded store keeps its data; used to prove stores stay disposable. */
export const memoryStorePath = (home: string): string => join(home, "omms-store");

/** Launch an isolated managed child with the real OMMS extension mapped explicitly. */
export async function startMemoryChild(
	options: {
		tools?: string[];
		extensions?: string[];
		autoCapture?: boolean;
		/** A caller-owned workspace for concurrency and scoping scenarios. */
		workspace?: Workspace;
		/** Override the child's working directory inside the shared workspace. */
		cwd?: string;
		/** Point embeddings at a dead endpoint to exercise memory failures. */
		deadEmbeddings?: boolean;
	} = {},
) {
	const extension = resolveMemoryExtension();
	if (!extension) throw new Error("om-memory-system is not resolvable for the child fixture.");
	return startPi({
		mcp: false,
		workspace: options.workspace,
		env: { OMPS_PI_BIN: PI_BIN },
		seed: async (paths) => {
			if (options.deadEmbeddings) {
				const config = join(paths.home, ".config", "omms");
				await mkdir(config, { recursive: true });
				await writeFile(
					join(config, "omms.json"),
					JSON.stringify({
						storagePath: join(paths.home, "omms-store"),
						embeddingApiUrl: "http://127.0.0.1:9/v1",
						embeddingModel: "fake-embeddings",
						embeddingDimensions: 64,
						webServerAutoStart: false,
						autoBackfill: false,
						autoCaptureEnabled: false,
					}),
				);
			} else
				await seedMemoryConfig(paths.home, paths.model, {
					autoCapture: options.autoCapture ?? false,
				});
			await writeFile(join(paths.agentDir, "memory-child.md"), "MEMORY-CHILD-PERSONA-MARKER");
		},
		launch: ({ cwd, agentDir }) =>
			buildLaunch({
				snapshot: {
					name: "memory-child",
					personaPath: "unused",
					persona: "MEMORY-CHILD-PERSONA-MARKER",
					tools: options.tools ?? ["memory"],
					thinking: "off",
					skills: [],
					extensions: options.extensions ?? [extension],
				},
				cwd: options.cwd ?? cwd,
				personaFile: join(agentDir, "memory-child.md"),
				guardPath: new URL("../../src/child-guard.ts", import.meta.url).pathname,
				runToken: "memory-token",
				piBin: PI_BIN,
				parentModel: "fake/counter",
				startupDeadlineMs: 2000,
				lineage: { ...fixtureLineage(join(agentDir, "om-pi-subagents.yaml")), maxDepth: 1 },
			}),
	});
}

/** The raw bytes of the disposable store's project shards, including their stored text. */
export async function capturedText(store: string): Promise<string> {
	try {
		const directory = join(store, "projects");
		const files = (await readdir(directory)).filter((name) => name.endsWith(".db"));
		let text = "";
		for (const file of files) text += await readFile(join(directory, file), "utf8");
		return text;
	} catch {
		return "";
	}
}
