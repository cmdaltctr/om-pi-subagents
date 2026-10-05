import { randomUUID } from "node:crypto";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseDocument } from "yaml";
import { loadRegistry, type RunLimits } from "./config.ts";

const MAX_SETTINGS_BYTES = 256 * 1024;
const DEFAULT_VISIBLE_AGENTS = 4;

type Revision = Readonly<{ path: string; text: string | undefined }>;

export interface LimitSettings extends Revision {
	readonly limits: RunLimits;
	readonly missing: boolean;
}

export interface DisplaySettings extends Revision {
	readonly value: number;
	readonly diagnostics: readonly string[];
}

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

async function readText(path: string): Promise<string | undefined> {
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

async function canonicalDestination(path: string): Promise<string> {
	try {
		return await realpath(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		// nosemgrep: AIK_ts_generic_path_traversal -- Normalise a missing operator-selected settings filename; this expression reads no file. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
		return resolve(path);
	}
}

async function assertRevision(displayed: Revision): Promise<void> {
	if ((await readText(displayed.path)) !== displayed.text) {
		throw new Error(`Settings changed in ${displayed.path}. Reopen settings before saving.`);
	}
}

/** Load fresh limits using the same complete registry validation as launches. */
export async function readLimitSettings(path: string): Promise<LimitSettings> {
	const destination = await canonicalDestination(path);
	const text = await readText(destination);
	const { limits } = await loadRegistry(destination);
	const displayed = Object.freeze({ path: destination, text, limits, missing: text === undefined });
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
	const document = parseDocument(
		displayed.text ?? "version: 1\nlimits:\n  maxDepth: 1\n  maxConcurrentRuns: 1\nagents: {}\n",
		{
			schema: "core",
			uniqueKeys: true,
		},
	);
	if (document.errors.length) throw new Error("Fix the malformed YAML and reopen settings before saving.");
	document.setIn(["limits", key], value);
	await replaceSettings(displayed, document.toString(), loadRegistry);
}

function parseDisplay(text: string | undefined): { value: number; raw: Record<string, unknown> } {
	const raw: unknown = text === undefined ? {} : JSON.parse(text);
	if (!raw || typeof raw !== "object" || Array.isArray(raw))
		throw new Error("Display settings must contain a JSON object.");
	const stored = (raw as Record<string, unknown>).maxVisibleAgents;
	const value = stored === undefined ? DEFAULT_VISIBLE_AGENTS : stored;
	checkVisible(value);
	return { value, raw: raw as Record<string, unknown> };
}

export interface DisplayPreferences {
	readonly path: string;
	readonly value: number;
	refresh(): Promise<DisplaySettings>;
	ensureLoaded(): Promise<DisplaySettings>;
	save(displayed: DisplaySettings, value: number): Promise<void>;
}

/** Create a lazy cache. Rendering reads value; it performs no file access. */
export function createDisplayPreferences(path = displayPreferencesPath()): DisplayPreferences {
	let value = DEFAULT_VISIBLE_AGENTS;
	let loaded: Promise<DisplaySettings> | undefined;
	const refresh = async (): Promise<DisplaySettings> => {
		let text: string | undefined;
		// nosemgrep: AIK_ts_generic_path_traversal -- The factory receives the fixed OMPSS display path from trusted code, never model input. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
		let destination = resolve(path);
		try {
			destination = await canonicalDestination(path);
			text = await readText(destination);
			const parsed = parseDisplay(text);
			const displayed = Object.freeze({ path: destination, text, value: parsed.value, diagnostics: [] });
			await assertRevision(displayed);
			value = parsed.value;
			return displayed;
		} catch (error) {
			value = DEFAULT_VISIBLE_AGENTS;
			return Object.freeze({
				path: destination,
				text,
				value,
				diagnostics: [
					`${destination}: ${(error as Error).message} Fix the display config before saving; using four visible agents.`,
				],
			});
		}
	};
	return {
		// nosemgrep: AIK_ts_generic_path_traversal -- Cache the fixed OMPSS display destination from trusted extension code. Evidence: docs/local-docs/agent-tree-viewer-settings-evidence.md.
		path: resolve(path),
		get value() {
			return value;
		},
		refresh() {
			loaded = refresh();
			return loaded;
		},
		ensureLoaded() {
			loaded ??= refresh();
			return loaded;
		},
		async save(displayed, nextValue) {
			checkVisible(nextValue);
			if (displayed.diagnostics.length) throw new Error(displayed.diagnostics.join("\n"));
			const { raw } = parseDisplay(displayed.text);
			await replaceSettings(displayed, `${JSON.stringify({ ...raw, maxVisibleAgents: nextValue }, null, 2)}\n`);
			value = nextValue;
			loaded = undefined;
		},
	};
}
