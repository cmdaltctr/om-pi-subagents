import { resolve as resolvePath } from "node:path";
import {
	DEFAULT_FLEET_VIEW,
	DEFAULT_INSPECT_KEY,
	DEFAULT_MAX_VISIBLE_AGENTS,
	DEFAULT_SHOW_MANAGEMENT_LIST,
	DEFAULT_NAVIGATION_DOWN_KEY,
	DEFAULT_NAVIGATION_UP_KEY,
	DEFAULT_RESULT_KEY,
	DEFAULT_TOGGLE_KEY,
	loadRegistry,
	type UiSettings,
} from "./config.ts";
import { canonicalDestination, displayPreferencesPath, readSettingsText } from "./settings-persistence.ts";

/** Where the effective visible-agent count came from. */
export type VisibleAgentSource = "yaml" | "legacy" | "default";

/** One resolved UI settings read. `value` is effective; diagnostics explain any fallback. */
export interface UiSettingsState {
	readonly registryPath: string;
	readonly legacyPath: string;
	readonly value: UiSettings;
	readonly maxVisibleAgentsSource: VisibleAgentSource;
	readonly diagnostics: readonly string[];
}

/** A session-long cache. The `value` getter performs no file access. */
export interface UiSettingsCache {
	readonly registryPath: string;
	readonly legacyPath: string;
	readonly value: UiSettings;
	/** Load once per session; later calls reuse the first read. */
	ensureLoaded(): Promise<UiSettingsState>;
	/** Reload the registry and legacy fallback. A failed read keeps the retained cache. */
	refresh(): Promise<UiSettingsState>;
}

const DEFAULTS: UiSettings = Object.freeze({
	maxVisibleAgents: DEFAULT_MAX_VISIBLE_AGENTS,
	fleetView: DEFAULT_FLEET_VIEW,
	toggleKey: DEFAULT_TOGGLE_KEY,
	inspectKey: DEFAULT_INSPECT_KEY,
	showManagementList: DEFAULT_SHOW_MANAGEMENT_LIST,
	navigationDownKey: DEFAULT_NAVIGATION_DOWN_KEY,
	navigationUpKey: DEFAULT_NAVIGATION_UP_KEY,
	resultKey: DEFAULT_RESULT_KEY,
});

interface LegacyValue {
	readonly value?: number;
	readonly diagnostic?: string;
}

/** The old display JSON is a read-only compatibility input for visible rows. */
async function readLegacy(path: string): Promise<LegacyValue> {
	let text: string | undefined;
	try {
		// nosemgrep: AIK_ts_generic_path_traversal -- The fixed legacy OMPS display path, never model input.
		text = await readSettingsText(path);
	} catch (error) {
		return { diagnostic: `${path}: ${(error as Error).message} Using ${DEFAULT_MAX_VISIBLE_AGENTS} visible agents.` };
	}
	if (text === undefined) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return {
			diagnostic: `${path}: malformed legacy display settings. Using ${DEFAULT_MAX_VISIBLE_AGENTS} visible agents.`,
		};
	}
	const stored =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>).maxVisibleAgents
			: undefined;
	if (typeof stored !== "number" || !Number.isSafeInteger(stored) || stored < 1 || stored > 256) {
		return {
			diagnostic: `${path}: legacy maxVisibleAgents must be a safe integer from 1 to 256. Using ${DEFAULT_MAX_VISIBLE_AGENTS} visible agents.`,
		};
	}
	return { value: stored };
}

async function load(registryPath: string, legacyPath: string): Promise<UiSettingsState> {
	let snapshot;
	try {
		snapshot = await loadRegistry(registryPath);
	} catch (error) {
		// A bad registry blocks launches; presentation keeps defaults plus the reason.
		return {
			registryPath,
			legacyPath,
			value: DEFAULTS,
			maxVisibleAgentsSource: "default",
			diagnostics: [`${registryPath}: ${(error as Error).message}`],
		};
	}
	if (snapshot.uiDeclarations.maxVisibleAgents) {
		return { registryPath, legacyPath, value: snapshot.ui, maxVisibleAgentsSource: "yaml", diagnostics: [] };
	}
	const legacy = await readLegacy(legacyPath);
	if (legacy.value === undefined) {
		return {
			registryPath,
			legacyPath,
			value: snapshot.ui,
			maxVisibleAgentsSource: "default",
			diagnostics: legacy.diagnostic ? [legacy.diagnostic] : [],
		};
	}
	return {
		registryPath,
		legacyPath,
		value: Object.freeze({ ...snapshot.ui, maxVisibleAgents: legacy.value }),
		maxVisibleAgentsSource: "legacy",
		diagnostics: [],
	};
}

/**
 * Create the session cache for YAML UI settings. The legacy display JSON supplies visible rows
 * only while YAML omits `ui.maxVisibleAgents`; it is never written.
 */
export function createUiSettings(registryPath: string, legacyPath = displayPreferencesPath()): UiSettingsCache {
	// nosemgrep: AIK_ts_generic_path_traversal -- Trusted extension code selects these fixed destinations.
	const destination = resolvePath(registryPath);
	// nosemgrep: AIK_ts_generic_path_traversal -- Normalise the fixed operator legacy path; no file read. Evidence: docs/local-docs/final-pr-security-triage.md.
	const legacy = resolvePath(legacyPath);
	let value = DEFAULTS;
	let loaded: Promise<UiSettingsState> | undefined;
	const settle = async (state: UiSettingsState): Promise<UiSettingsState> => {
		// Keep the last renderable values when a read fails, so the retained UI stays usable.
		if (!state.diagnostics.length) value = state.value;
		return state;
	};
	const reload = async (): Promise<UiSettingsState> =>
		settle(await load(await canonicalDestination(destination), legacy));
	return {
		registryPath: destination,
		legacyPath: legacy,
		get value() {
			return value;
		},
		ensureLoaded() {
			loaded ??= reload();
			return loaded;
		},
		refresh() {
			loaded = reload();
			return loaded;
		},
	};
}
