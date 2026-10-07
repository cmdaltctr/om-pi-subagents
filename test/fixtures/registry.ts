import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveRegistryPath } from "../../src/registry-path.ts";

/** Resolve a disposable registry without inheriting the operator's override. */
export const fixtureRegistryPath = (agentDir: string): string => resolveRegistryPath(agentDir, {});

/** Seed a mapped persona and its conventional folder in a disposable agent directory. */
export async function writeFixturePersona(agentDir: string, name: string, text: string): Promise<void> {
	const folder = join(dirname(fixtureRegistryPath(agentDir)), "personas");
	await mkdir(folder, { recursive: true });
	await writeFile(join(folder, name), text);
}

/** Seed a registry without requiring a mapped persona. */
export async function writeFixtureRegistry(agentDir: string, text: string): Promise<void> {
	const path = fixtureRegistryPath(agentDir);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, text);
}
