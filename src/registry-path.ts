import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** Resolve the operator's agent directory without reading files. */
export function resolveAgentDir(env: NodeJS.ProcessEnv = process.env): string {
	return env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

/** Keep operator mappings outside the installed package, with an explicit path override. */
export function resolveRegistryPath(agentDir: string, env: NodeJS.ProcessEnv = process.env): string {
	// nosemgrep: AIK_ts_generic_path_traversal -- Trusted operator directory plus fixed components; no file read. Evidence: docs/local-docs/move-config-into-omps-folder-security-triage.md.
	return env.OMPS_REGISTRY ?? join(agentDir, "omps", "config.yaml");
}

/** Explain a missing default registry when the operator still has the old file. Never read its contents. */
export async function registryMigrationMessage(yamlPath: string): Promise<string | undefined> {
	const agentDir = resolve(resolveAgentDir());
	const destination = resolveRegistryPath(agentDir);
	// nosemgrep: AIK_ts_generic_path_traversal -- Normalise the operator-selected filename for comparison only. Evidence: docs/local-docs/move-config-into-omps-folder-security-triage.md.
	if (process.env.OMPS_REGISTRY !== undefined || resolve(yamlPath) !== destination) return undefined;
	const oldPath = join(agentDir, "om-pi-subagents.yaml");
	try {
		if (!(await stat(oldPath)).isFile()) return undefined;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	const personas = join(agentDir, "omps", "personas");
	const quoted = (path: string) => /^[A-Za-z0-9_./-]+$/.test(path) ? path : `'${path.replaceAll("'", "'\\''")}'`;
	return `OMPS now reads ${destination}. Move your settings:\n  mkdir -p ${quoted(personas)}\n  mv ${quoted(oldPath)} ${quoted(destination)}\nThen move your persona files into ${personas}/ and change each persona: line to ./personas/<name>.md.\nSee docs/INSTALL.md#move-settings-into-the-omps-folder.`;
}
