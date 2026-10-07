import { existsSync } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { isAlias, parseDocument, visit } from "yaml";
import { registryMigrationMessage, resolveAgentDir } from "./registry-path.ts";

/** Immutable launch inputs for one agent: persona text plus validated settings. */
export interface AgentSnapshot {
	readonly name: string;
	readonly personaPath: string;
	readonly persona: string;
	readonly tools: readonly string[];
	readonly model?: string;
	readonly thinking: string;
	readonly skills: readonly string[];
	readonly extensions: readonly string[];
}

export type Registry = ReadonlyMap<string, AgentSnapshot>;

export interface RunLimits {
	readonly maxConcurrentRuns: number;
	readonly maxDepth: number;
}

/** How the fleet first appears: the agent tree, one summary row, or no widget. */
export type FleetView = "expanded" | "collapsed" | "off";

/** Presentation settings from the optional `ui` mapping. Key values are Pi key specifications or `off`. */
export interface UiSettings {
	readonly maxVisibleAgents: number;
	readonly fleetView: FleetView;
	readonly showManagementList: boolean;
	readonly toggleKey: string;
	readonly inspectKey: string;
	readonly navigationDownKey: string;
	readonly navigationUpKey: string;
}

/** Which `ui` fields this YAML declares. Undeclared fields use defaults; only visible rows have a legacy fallback. */
export type UiDeclarations = Readonly<Record<keyof UiSettings, boolean>>;

/** One coherent file revision, retained by its launch caller across later refreshes. */
export interface ConfigurationSnapshot {
	readonly registryPath: string;
	readonly limits: RunLimits;
	readonly ui: UiSettings;
	readonly uiDeclarations: UiDeclarations;
	readonly agents: Registry;
}

/** A configuration problem. `field` names the YAML path, for example `agents.reader.tools`. */
export class RegistryError extends Error {
	constructor(
		readonly field: string,
		problem: string,
		options?: ErrorOptions,
	) {
		super(`${field}: ${problem}`, options);
		this.name = "RegistryError";
	}
}

const SUPPORTED_VERSION = 1;
export const DEFAULT_MAX_VISIBLE_AGENTS = 5;
export const DEFAULT_FLEET_VIEW: FleetView = "expanded";
// macOS terminals type "ø" for Option+O unless Option sends Alt, so no modifier key ships enabled.
export const DEFAULT_TOGGLE_KEY = "off";
export const DEFAULT_INSPECT_KEY = "off";
export const DEFAULT_SHOW_MANAGEMENT_LIST = true;
export const DEFAULT_NAVIGATION_DOWN_KEY = "down";
export const DEFAULT_NAVIGATION_UP_KEY = "up";
export const UI_KEY_FIELDS = ["toggleKey", "inspectKey", "navigationDownKey", "navigationUpKey"] as const;
export type UiKeyField = (typeof UI_KEY_FIELDS)[number];
export type NavigationKeys = Pick<UiSettings, "navigationDownKey" | "navigationUpKey">;
export const FLEET_VIEWS: readonly FleetView[] = ["expanded", "collapsed", "off"];
const MAX_FILE_BYTES = 256 * 1024;
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const TOOL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const AGENT_FIELDS = ["persona", "tools", "model", "thinking", "skills", "extensions"];
const UI_FIELDS: readonly (keyof UiSettings)[] = [
	"maxVisibleAgents",
	"fleetView",
	"showManagementList",
	...UI_KEY_FIELDS,
];
/** Pi key specifications are lowercase `modifier+base` pairs; `pageUp` and `pageDown` keep their capitals. */
const SPECIAL_KEYS = [
	"escape",
	"esc",
	"enter",
	"return",
	"space",
	"backspace",
	"delete",
	"insert",
	"clear",
	"home",
	"end",
	"pageUp",
	"pageDown",
	"up",
	"down",
	"left",
	"right",
	"f1",
	"f2",
	"f3",
	"f4",
	"f5",
	"f6",
	"f7",
	"f8",
	"f9",
	"f10",
	"f11",
	"f12",
];
const SYMBOL_KEYS = "`-=[]\\;',./!@#$%^&*()_+|~{}:<>?";
const KEY_SPEC_PATTERN = new RegExp(
	`^(?:(?:ctrl|shift|alt|super)\\+)*(?:[a-z0-9]|${SPECIAL_KEYS.join("|")}|[${SYMBOL_KEYS.replace(/[\\\]^-]/g, "\\$&")}])$`,
);
/** Legacy terminals send one byte for both Tab and Ctrl+I, so neither can own a distinct action. */
const UNSAFE_KEYS = new Set(["tab", "ctrl+i"]);
const FRONTMATTER = /^﻿?---[ \t]*(\r?\n|$)/;

type Plain = Record<string, unknown>;

const isPlain = (value: unknown): value is Plain =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Read the YAML and every mapped persona afresh. Each call returns new snapshots. */
export async function loadRegistry(yamlPath: string): Promise<ConfigurationSnapshot> {
	// No file yet means the operator has mapped no agents. The package ships none.
	if (!existsSync(yamlPath)) {
		const migration = await registryMigrationMessage(yamlPath);
		if (migration) throw new RegistryError("config.yaml", migration);
		// nosemgrep: AIK_ts_generic_path_traversal -- Normalise the missing operator-selected filename; no file read. Evidence: docs/local-docs/move-config-into-omps-folder-security-triage.md.
		return configurationSnapshot(new Map(), validateLimits(undefined), validateUi(undefined), resolve(yamlPath));
	}
	const data = parseYaml(await readBounded("config.yaml", yamlPath));
	const unknownTop = Object.keys(data).find((key) => !["version", "agents", "limits", "ui"].includes(key));
	if (unknownTop) throw new RegistryError(unknownTop, "unknown field");
	if (data.version === undefined) throw new RegistryError("version", "required");
	if (data.version !== SUPPORTED_VERSION) {
		throw new RegistryError("version", `unsupported ${JSON.stringify(data.version)}; expected ${SUPPORTED_VERSION}`);
	}
	if (!isPlain(data.agents)) throw new RegistryError("agents", "required mapping (use {} for no agents)");

	const limits = validateLimits(data.limits);
	const ui = validateUi(data.ui);
	const yamlDir = dirname(yamlPath);
	const registry = new Map<string, AgentSnapshot>();
	for (const [name, raw] of Object.entries(data.agents)) {
		registry.set(name, await buildSnapshot(name, raw, yamlDir));
	}
	return configurationSnapshot(registry, limits, ui, await realpath(yamlPath));
}

function validateLimits(value: unknown): RunLimits {
	if (value !== undefined && !isPlain(value)) throw new RegistryError("limits", "must be a mapping");
	const raw = (value ?? {}) as Plain;
	const unknown = Object.keys(raw).find((key) => !["maxConcurrentRuns", "maxDepth"].includes(key));
	if (unknown) throw new RegistryError(`limits.${unknown}`, "unknown field");
	const number = (key: string, minimum: number): number => {
		const setting = raw[key] === undefined ? 1 : raw[key];
		if (typeof setting !== "number" || !Number.isSafeInteger(setting) || setting < minimum)
			throw new RegistryError(`limits.${key}`, `must be a safe integer of at least ${minimum}`);
		return setting;
	};
	return Object.freeze({ maxConcurrentRuns: number("maxConcurrentRuns", 1), maxDepth: number("maxDepth", 0) });
}

function validateUi(value: unknown): { settings: UiSettings; declarations: UiDeclarations } {
	if (value !== undefined && !isPlain(value)) throw new RegistryError("ui", "must be a mapping");
	const raw = (value ?? {}) as Plain;
	const unknown = Object.keys(raw).find((key) => !UI_FIELDS.includes(key as keyof UiSettings));
	if (unknown) throw new RegistryError(`ui.${unknown}`, "unknown field");

	const visible = raw.maxVisibleAgents;
	if (
		visible !== undefined &&
		(typeof visible !== "number" || !Number.isSafeInteger(visible) || visible < 1 || visible > 256)
	)
		throw new RegistryError("ui.maxVisibleAgents", "must be a safe integer from 1 to 256");
	const view = raw.fleetView === undefined ? undefined : checkFleetView(raw.fleetView);
	const toggle = raw.toggleKey === undefined ? undefined : checkUiKey("toggleKey", raw.toggleKey);
	const inspect = raw.inspectKey === undefined ? undefined : checkUiKey("inspectKey", raw.inspectKey);
	const show =
		raw.showManagementList === undefined ? DEFAULT_SHOW_MANAGEMENT_LIST : checkManagementList(raw.showManagementList);
	const down =
		raw.navigationDownKey === undefined
			? DEFAULT_NAVIGATION_DOWN_KEY
			: checkUiKey("navigationDownKey", raw.navigationDownKey);
	const up =
		raw.navigationUpKey === undefined ? DEFAULT_NAVIGATION_UP_KEY : checkUiKey("navigationUpKey", raw.navigationUpKey);
	const settings: UiSettings = Object.freeze({
		maxVisibleAgents: visible ?? DEFAULT_MAX_VISIBLE_AGENTS,
		fleetView: view ?? DEFAULT_FLEET_VIEW,
		toggleKey: toggle ?? DEFAULT_TOGGLE_KEY,
		inspectKey: inspect ?? DEFAULT_INSPECT_KEY,
		showManagementList: show,
		navigationDownKey: down,
		navigationUpKey: up,
	});
	checkDistinctUiKeys(settings);
	return {
		settings,
		declarations: Object.freeze({
			maxVisibleAgents: visible !== undefined,
			fleetView: view !== undefined,
			toggleKey: toggle !== undefined,
			inspectKey: inspect !== undefined,
			showManagementList: raw.showManagementList !== undefined,
			navigationDownKey: raw.navigationDownKey !== undefined,
			navigationUpKey: raw.navigationUpKey !== undefined,
		}),
	};
}

const MODIFIER_ORDER = ["ctrl", "shift", "alt", "super"];

/**
 * One spelling per key: Pi parses `shift+ctrl+o` and `ctrl+shift+o` as the same key, so conflict
 * checks compare modifiers in a fixed order with the base key last.
 */
export function normaliseKey(key: string): string {
	const match = /^((?:(?:ctrl|shift|alt|super)\+)*)(.+)$/.exec(key);
	if (!match) return key;
	const modifiers = match[1].split("+").filter(Boolean);
	modifiers.sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
	return [...modifiers, match[2]].join("+");
}

/** Validate one fleet view outside a full registry load. Throws a RegistryError naming `ui.fleetView`. */
export function checkFleetView(value: unknown): FleetView {
	if (!FLEET_VIEWS.includes(value as FleetView))
		throw new RegistryError("ui.fleetView", 'must be "expanded", "collapsed" or "off"');
	return value as FleetView;
}

/** Validate one shortcut value outside a full registry load. Throws a RegistryError naming `ui.<field>`. */
export function checkUiKey(field: UiKeyField, value: unknown): string {
	const key = (name: string, setting: unknown): string => {
		if (typeof setting !== "string" || setting === "")
			throw new RegistryError(`ui.${name}`, 'must be a Pi key specification (for example alt+o) or "off"');
		if (UNSAFE_KEYS.has(setting))
			throw new RegistryError(
				`ui.${name}`,
				`${setting} is unsafe: legacy terminals read it the same as Tab; choose another key`,
			);
		const modifiers = setting.split("+").slice(0, -1);
		if (setting !== "off" && (!KEY_SPEC_PATTERN.test(setting) || new Set(modifiers).size !== modifiers.length))
			throw new RegistryError(
				`ui.${name}`,
				'must be a lowercase Pi key specification (for example alt+o, ctrl+alt+p) or "off"',
			);
		return setting;
	};
	return key(field, value);
}

/** Validate visibility in registry loads and confirmed settings saves. */
export function checkManagementList(value: unknown): boolean {
	if (typeof value !== "boolean") throw new RegistryError("ui.showManagementList", "must be a boolean (true or false)");
	return value;
}

/** Reject equivalent keys across all OMPS actions, including omitted defaults. */
export function checkDistinctUiKeys(settings: Pick<UiSettings, UiKeyField>): void {
	const seen = new Map<string, UiKeyField>();
	for (const field of UI_KEY_FIELDS) {
		const value = settings[field];
		if (value === "off") continue;
		const key = normaliseKey(value);
		const other = seen.get(key);
		if (other) throw new RegistryError(`ui.${field}`, `duplicate of ui.${other} (${value}); choose distinct keys`);
		seen.set(key, field);
	}
}

function configurationSnapshot(
	registry: Map<string, AgentSnapshot>,
	limits: RunLimits,
	ui: { settings: UiSettings; declarations: UiDeclarations },
	registryPath: string,
): ConfigurationSnapshot {
	// A frozen Map still exposes set/delete. This view exposes only read operations.
	const agents: Registry = Object.freeze({
		size: registry.size,
		get: registry.get.bind(registry),
		has: registry.has.bind(registry),
		keys: registry.keys.bind(registry),
		values: registry.values.bind(registry),
		entries: registry.entries.bind(registry),
		[Symbol.iterator]: registry[Symbol.iterator].bind(registry),
		forEach(callback: (value: AgentSnapshot, key: string, map: Registry) => void, thisArg?: unknown) {
			registry.forEach((value, key) => callback.call(thisArg, value, key, agents));
		},
	});
	return Object.freeze({ agents, limits, registryPath, ui: ui.settings, uiDeclarations: ui.declarations });
}

export interface RegistryStore {
	/** Reload the YAML. On failure the current registry is dropped, so no launch runs on stale settings. */
	refresh(): Promise<ConfigurationSnapshot>;
	list(): string[];
	get(name: string): AgentSnapshot;
}

/** Holds the active registry. Snapshots already handed out stay unchanged across refreshes. */
export function createRegistryStore(yamlPath: string): RegistryStore {
	let state: { snapshot: ConfigurationSnapshot } | { error: RegistryError } | undefined;
	const current = (): Registry => {
		if (!state) throw new RegistryError("config.yaml", "not loaded; refresh first");
		if ("error" in state) throw state.error;
		return state.snapshot.agents;
	};
	return {
		async refresh() {
			try {
				const snapshot = await loadRegistry(yamlPath);
				state = { snapshot };
				return snapshot;
			} catch (error) {
				const failure =
					error instanceof RegistryError
						? error
						: new RegistryError("config.yaml", "cannot read configuration; check its files and retry", {
								cause: error,
							});
				state = { error: failure };
				throw failure;
			}
		},
		list: () => [...current().keys()],
		get(name) {
			const agent = current().get(name);
			if (!agent) throw new RegistryError(`agents.${name}`, "unknown agent");
			return agent;
		},
	};
}

async function readBounded(label: string, path: string): Promise<string> {
	if ((await stat(path)).size > MAX_FILE_BYTES) throw new RegistryError(label, `larger than ${MAX_FILE_BYTES} bytes`);
	// nosemgrep: AIK_ts_generic_path_traversal -- Callers supply the operator registry or a contained canonical persona.
	return readFile(path, "utf8");
}

function parseYaml(text: string): Plain {
	const document = parseDocument(text, { schema: "core", uniqueKeys: true });
	const [first] = document.errors;
	if (first) {
		const problem =
			first.code === "DUPLICATE_KEY" ? "duplicate key" : `malformed YAML (${first.message.split("\n")[0]})`;
		throw new RegistryError("config.yaml", problem);
	}
	visit(document, {
		Node(_key, node) {
			if (isAlias(node)) throw new RegistryError("config.yaml", "aliases are not allowed");
			if (node.tag) throw new RegistryError("config.yaml", `custom tag ${node.tag} is not allowed`);
		},
	});
	const data: unknown = document.toJS() ?? {};
	if (!isPlain(data)) throw new RegistryError("config.yaml", "top level must be a mapping");
	return data;
}

async function buildSnapshot(name: string, raw: unknown, yamlDir: string): Promise<AgentSnapshot> {
	const at = `agents.${name}`;
	if (!NAME_PATTERN.test(name)) throw new RegistryError(at, "invalid name; use [a-z][a-z0-9-]{0,63}");
	if (!isPlain(raw)) throw new RegistryError(at, "must be a mapping");
	const unknown = Object.keys(raw).find((key) => !AGENT_FIELDS.includes(key));
	if (unknown) throw new RegistryError(`${at}.${unknown}`, "unknown field");

	const { persona, tools, model, thinking } = raw;
	if (typeof persona !== "string" || persona === "") throw new RegistryError(`${at}.persona`, "required path");
	if (model !== undefined && (typeof model !== "string" || model.trim() === "")) {
		throw new RegistryError(`${at}.model`, "must be a non-empty string");
	}
	if (thinking === undefined) {
		throw new RegistryError(`${at}.thinking`, `required; set one of ${THINKING_LEVELS.join(", ")}`);
	}
	if (typeof thinking !== "string" || !THINKING_LEVELS.includes(thinking)) {
		throw new RegistryError(`${at}.thinking`, `must be one of ${THINKING_LEVELS.join(", ")}`);
	}
	const personaFile = await readPersona(`${at}.persona`, persona, yamlDir);
	return Object.freeze({
		name,
		personaPath: personaFile.path,
		persona: personaFile.text,
		tools: Object.freeze(validateTools(`${at}.tools`, tools)),
		model: model as string | undefined,
		thinking,
		skills: Object.freeze(await resolveResources(`${at}.skills`, raw.skills, yamlDir, "file")),
		extensions: Object.freeze(await resolveResources(`${at}.extensions`, raw.extensions, yamlDir, "any")),
	});
}

function validateTools(field: string, tools: unknown): string[] {
	if (tools === undefined) throw new RegistryError(field, "required (use [] for no tools)");
	if (!Array.isArray(tools)) throw new RegistryError(field, "must be a list of tool names");
	for (const tool of tools) {
		if (typeof tool !== "string" || !TOOL_PATTERN.test(tool)) {
			throw new RegistryError(field, `${JSON.stringify(tool)} is not an exact tool name (no wildcards or selectors)`);
		}
	}
	return [...tools];
}

function isInside(root: string, path: string): boolean {
	const fromRoot = relative(root, path);
	return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

async function readPersona(field: string, persona: string, yamlDir: string): Promise<{ path: string; text: string }> {
	let canonical: string;
	try {
		// nosemgrep: AIK_ts_generic_path_traversal -- Resolve operator YAML paths, then reject escapes before reading contents.
		canonical = await realpath(resolve(yamlDir, persona));
	} catch {
		throw new RegistryError(field, `cannot read ${persona}`);
	}
	const root = await realpath(yamlDir);
	if (!isInside(root, canonical)) {
		throw new RegistryError(field, `${persona} resolves outside the extension directory`);
	}
	const runRoot = await realpath(resolve(resolveAgentDir(), "omps", "runs")).catch((error: NodeJS.ErrnoException) => {
		if (error.code === "ENOENT") return undefined;
		throw error;
	});
	if (runRoot && isInside(root, runRoot) && isInside(runRoot, canonical)) {
		throw new RegistryError(field, `${persona} resolves inside the OMPS run folder`);
	}
	let text: string;
	try {
		if (!(await stat(canonical)).isFile()) throw new Error("not a file");
		text = await readBounded(field, canonical);
	} catch (error) {
		if (error instanceof RegistryError) throw error;
		throw new RegistryError(field, `cannot read ${persona} as a file`);
	}
	if (text.trim() === "") throw new RegistryError(field, `${persona} is empty`);
	if (FRONTMATTER.test(text)) throw new RegistryError(field, `${persona} has frontmatter; put settings in config.yaml`);
	return { path: canonical, text };
}

async function resolveResources(
	field: string,
	value: unknown,
	yamlDir: string,
	kind: "file" | "any",
): Promise<string[]> {
	if (value === undefined) return [];
	if (!Array.isArray(value)) throw new RegistryError(field, "must be a list of paths");
	const resolved: string[] = [];
	for (const [index, entry] of value.entries()) {
		const at = `${field}[${index}]`;
		if (typeof entry !== "string" || entry === "") throw new RegistryError(at, "must be a path");
		// nosemgrep: AIK_ts_generic_path_traversal -- Operator-selected skills and trusted extensions may live outside this directory.
		const path = entry.startsWith("~/") ? resolve(homedir(), entry.slice(2)) : resolve(yamlDir, entry);
		try {
			const info = await stat(path);
			if (kind === "file" && !info.isFile()) throw new Error("not a file");
		} catch {
			throw new RegistryError(at, `cannot read ${entry}`);
		}
		resolved.push(path);
	}
	return resolved;
}
