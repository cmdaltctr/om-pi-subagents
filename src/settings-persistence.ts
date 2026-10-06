import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseDocument } from "yaml";
import { checkUiKey, loadRegistry, type Registry, type RunLimits } from "./config.ts";
import type { CapabilityMapping } from "./capabilities.ts";

const MAX_SETTINGS_BYTES = 256 * 1024;
const CREATION_TEMPLATE = "version: 1\nlimits:\n  maxDepth: 1\n  maxConcurrentRuns: 1\nagents: {}\n";

type Revision = Readonly<{ path: string; text: string | undefined }>;

export interface LimitSettings extends Revision {
	readonly limits: RunLimits;
	readonly agents: Registry;
	readonly missing: boolean;
}

/** One editable `ui` field in the registry. */
export type UiField = "maxVisibleAgents" | "toggleKey" | "inspectKey";

/** Resolve only OMPSS display preferences; relative XDG paths use the home fallback. */
export function displayPreferencesPath(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
	const xdg = env.XDG_CONFIG_HOME?.trim();
	// nosemgrep: AIK_ts_generic_path_traversal -- Trusted operator environment selects the config directory; filenames are constants. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
	return join(xdg && isAbsolute(xdg) ? xdg : join(home, ".config"), "pi-subagents", "config.json");
}

function checkLimit(key: keyof RunLimits, value: number): void {
	if (key !== "maxDepth" && key !== "maxConcurrentRuns") throw new Error("Unknown limit; reopen settings.");
	const minimum = key === "maxDepth" ? 0 : 1;
	if (!Number.isSafeInteger(value) || value < minimum) {
		throw new Error(`${key} must be a safe integer of at least ${minimum}. Enter a whole number.`);
	}
}

function checkVisible(value: unknown): asserts value is number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 256) {
		throw new Error("Visible agents must be a safe integer from 1 to 256. Enter a whole number.");
	}
}

export async function readSettingsText(path: string): Promise<string | undefined> {
	let file;
	try {
		// nosemgrep: AIK_ts_generic_path_traversal -- Private callers use the operator-selected registry or fixed display config, never model input. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
		file = await open(path, "r");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	try {
		const info = await file.stat();
		if (!info.isFile()) throw new Error("Settings destination must be a file. Fix it and reopen settings.");
		if (info.size > MAX_SETTINGS_BYTES) throw new Error("Settings file is too large. Reduce it and reopen settings.");
		const buffer = Buffer.alloc(MAX_SETTINGS_BYTES + 1);
		let total = 0;
		while (total < buffer.length) {
			const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
			if (!bytesRead) break;
			total += bytesRead;
		}
		if (total > MAX_SETTINGS_BYTES) throw new Error("Settings file is too large. Reduce it and reopen settings.");
		return buffer.subarray(0, total).toString("utf8");
	} finally {
		await file.close();
	}
}

export async function canonicalDestination(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		// nosemgrep: AIK_ts_generic_path_traversal -- Normalise a missing operator-selected settings filename; this expression reads no file. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
		return resolve(path);
	}
}

async function assertRevision(displayed: Revision): Promise<void> {
	if ((await readSettingsText(displayed.path)) !== displayed.text) {
		throw new Error(`Settings changed in ${displayed.path}. Reopen settings before saving.`);
	}
}

/** Load fresh limits using the same complete registry validation as launches. */
export async function readLimitSettings(path: string): Promise<LimitSettings> {
	const destination = await canonicalDestination(path);
	const text = await readSettingsText(destination);
	const { limits, agents } = await loadRegistry(destination);
	const displayed = Object.freeze({ path: destination, text, limits, agents, missing: text === undefined });
	await assertRevision(displayed);
	return displayed;
}

async function lockFile(path: string): Promise<() => Promise<void>> {
	const lock = `${path}.lock`;
	for (let attempt = 0; attempt < 100; attempt++) {
		try {
			// nosemgrep: AIK_ts_generic_path_traversal -- Sibling of the trusted settings destination; exclusive creation rejects existing links. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
			const file = await open(lock, "wx", 0o600);
			await file.close();
			return () => unlink(lock);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
			await delay(20);
		}
	}
	throw new Error(`Settings are busy at ${path}. Reopen settings and retry after the other save finishes.`);
}

async function replaceSettings(
	displayed: Revision,
	next: string,
	validate?: (temporary: string) => Promise<unknown>,
): Promise<void> {
	if (Buffer.byteLength(next) > MAX_SETTINGS_BYTES)
		throw new Error("Settings file is too large. Reduce it before saving.");
	await mkdir(dirname(displayed.path), { recursive: true, mode: 0o700 });
	const release = await lockFile(displayed.path);
	const temporary = `${displayed.path}.${randomUUID()}.tmp`;
	try {
		await assertRevision(displayed);
		// nosemgrep: AIK_ts_generic_path_traversal -- Random private sibling of the trusted settings destination, opened exclusively. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
		const file = await open(temporary, "wx", 0o600);
		try {
			await file.writeFile(next, "utf8");
			await file.sync();
		} finally {
			await file.close();
		}
		// A sibling temporary file keeps relative persona and resource validation unchanged.
		await validate?.(temporary);
		await assertRevision(displayed);
		await rename(temporary, displayed.path);
	} catch (error) {
		throw new Error(`Could not save ${displayed.path}: ${(error as Error).message}`, { cause: error });
	} finally {
		try {
			await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
				if (error.code !== "ENOENT") throw error;
			});
		} finally {
			await release();
		}
	}
}

/** Save one confirmed YAML limit without changing any admitted run. */
export async function saveLimitSetting(
	displayed: LimitSettings,
	key: keyof RunLimits,
	value: number,
	confirmCreation = false,
): Promise<void> {
	checkLimit(key, value);
	if (displayed.missing && !confirmCreation) throw new Error("Confirm registry creation before saving this limit.");
	const document = parseDocument(displayed.text ?? CREATION_TEMPLATE, {
		schema: "core",
		uniqueKeys: true,
	});
	if (document.errors.length) throw new Error("Fix the malformed YAML and reopen settings before saving.");
	document.setIn(["limits", key], value);
	await replaceSettings(displayed, document.toString(), loadRegistry);
}

/** Save one confirmed `ui` field without changing execution limits or any admitted run. */
export async function saveUiSetting(
	displayed: LimitSettings,
	field: UiField,
	value: number | string,
	confirmCreation = false,
): Promise<void> {
	if (field === "maxVisibleAgents") checkVisible(value);
	else checkUiKey(field, value);
	if (displayed.missing && !confirmCreation) throw new Error("Confirm registry creation before saving this setting.");
	const document = parseDocument(displayed.text ?? CREATION_TEMPLATE, {
		schema: "core",
		uniqueKeys: true,
	});
	if (document.errors.length) throw new Error("Fix the malformed YAML and reopen settings before saving.");
	document.setIn(["ui", field], value);
	// The temporary validation is the final net: bounds, unsafe keys and duplicate shortcuts reject here.
	await replaceSettings(displayed, document.toString(), loadRegistry);
}

/** Save a selected agent's related lists in one revision-checked, validated replacement. */
export async function saveCapabilityMapping(
	displayed: LimitSettings,
	agent: string,
	mapping: CapabilityMapping,
): Promise<void> {
	if (!displayed.agents.has(agent) || displayed.missing) throw new Error("Select an existing mapped agent.");
	const document = parseDocument(displayed.text!, { schema: "core", uniqueKeys: true });
	if (document.errors.length) throw new Error("Fix the malformed YAML and reopen settings before saving.");
	const existing = displayed.agents.get(agent)!;
	const rawAgent = (document.toJS() as { agents: Record<string, Partial<CapabilityMapping>> }).agents[agent];
	for (const field of ["tools", "extensions", "skills"] as const) {
		const original = rawAgent[field];
		const resolved = existing[field];
		const kept = (original ?? []).filter((_entry, index) => mapping[field].includes(resolved[index]));
		const added = mapping[field].filter((entry) => !resolved.includes(entry));
		const next = [...kept, ...added];
		if (original === undefined && next.length === 0) continue;
		if (JSON.stringify(original) !== JSON.stringify(next)) document.setIn(["agents", agent, field], next);
	}
	await replaceSettings(displayed, document.toString(), loadRegistry);
}
