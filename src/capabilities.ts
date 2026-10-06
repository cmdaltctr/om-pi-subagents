import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AgentSnapshot } from "./config.ts";

export type Capability = "Memory" | "Todo";
export type CapabilityState = "Off" | "On (configured)" | "Partial";

const packages: Record<Capability, { name: string; tool: string; skill?: string }> = {
	Memory: { name: "om-memory-system", tool: "memory", skill: "omms-memory" },
	Todo: { name: "om-pi-todo", tool: "todo" },
};

type PublishedPackage = {
	root: string;
	entry: string;
	skill?: string;
};

export interface CapabilityMapping {
	readonly tools: string[];
	readonly extensions: string[];
	readonly skills: string[];
}

function inside(root: string, path: string): boolean {
	const suffix = relative(root, path);
	return (
		suffix === "" ||
		(suffix !== ".." && !suffix.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(suffix))
	);
}

async function published(path: string, capability: Capability): Promise<PublishedPackage | undefined> {
	let location: string;
	try {
		location = await realpath(path);
	} catch {
		return undefined;
	}
	let directory = (await stat(location)).isDirectory() ? location : dirname(location);
	for (;;) {
		let manifest: unknown;
		try {
			manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
		} catch {
			// A selected entry can sit beneath an installed package directory.
		}
		if (manifest && typeof manifest === "object") {
			const data = manifest as { name?: unknown; pi?: { extensions?: unknown; skills?: unknown } };
			if (data.name !== packages[capability].name) return undefined;
			const extensions = data.pi?.extensions;
			if (!Array.isArray(extensions) || extensions.length !== 1 || typeof extensions[0] !== "string") return undefined;
			const entry = await realpath(resolve(directory, extensions[0])).catch(() => undefined);
			if (!entry || !inside(directory, entry)) return undefined;
			const entryInfo = await stat(entry);
			if (!entryInfo.isFile() && !entryInfo.isDirectory()) return undefined;
			const folder = data.pi?.skills;
			const skillName = packages[capability].skill;
			let skill: string | undefined;
			if (skillName && Array.isArray(folder)) {
				for (const item of folder) {
					if (typeof item !== "string") continue;
					const candidate = await realpath(resolve(directory, item, skillName, "SKILL.md")).catch(() => undefined);
					if (candidate && inside(directory, candidate) && (await stat(candidate)).isFile()) {
						skill = candidate;
						break;
					}
				}
			}
			return { root: directory, entry, skill };
		}
		const parent = dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

/** Inspect only declared paths and package metadata; never import or execute a sibling extension. */
export async function inspectCapability(
	agent: AgentSnapshot,
	capability: Capability,
): Promise<{
	state: CapabilityState;
	entries: string[];
	skills: string[];
}> {
	const { tool, skill } = packages[capability];
	const entries: string[] = [];
	const skills: string[] = [];
	for (const path of agent.extensions) {
		const resource = await published(path, capability);
		if (resource && (await realpath(path)) === resource.entry) entries.push(path);
	}
	for (const path of agent.skills) {
		const resource = await published(path, capability);
		if (resource?.skill && skill && (await realpath(path)) === resource.skill) skills.push(path);
	}
	const approved = agent.tools.includes(tool);
	const state: CapabilityState =
		approved && entries.length === 1
			? "On (configured)"
			: approved || entries.length || skills.length
				? "Partial"
				: "Off";
	return { state, entries, skills };
}

/** Validate the operator's selected installed package folder or published extension entry. */
export async function selectPublishedPackage(path: string, capability: Capability): Promise<PublishedPackage> {
	const resource = await published(path, capability);
	const canonical = await realpath(path).catch(() => undefined);
	if (!resource || (canonical !== resource.root && canonical !== resource.entry))
		throw new Error(
			`Install ${packages[capability].name} and select its installed package folder or published Pi extension entry path.`,
		);
	return resource;
}

async function addResource(values: readonly string[], target: string): Promise<string[]> {
	const result: string[] = [];
	let found = false;
	for (const path of values) {
		if ((await realpath(path)) !== target) {
			result.push(path);
			continue;
		}
		if (!found) result.push(path);
		found = true;
	}
	if (!found) result.push(target);
	return result;
}

/** Build one agent-only list edit. Unrecognised wrappers stay untouched and need operator correction. */
export async function capabilityEdit(
	agent: AgentSnapshot,
	capability: Capability,
	enabled: boolean,
	selected?: PublishedPackage,
	includeSkill = false,
): Promise<CapabilityMapping> {
	const current = await inspectCapability(agent, capability);
	const tool = packages[capability].tool;
	if (enabled && current.entries.length > 1)
		throw new Error(`Multiple ${capability} entries are mapped. Correct the agent YAML before enabling.`);
	if (!enabled && (agent.tools.includes(tool) || current.entries.length || current.skills.length)) {
		const unknown = agent.extensions.filter((path) => !current.entries.includes(path));
		if (
			unknown.some((path) => path.includes(packages[capability].name)) ||
			(current.entries.length === 0 && agent.tools.includes(tool) && unknown.length > 0)
		)
			throw new Error(`Unrecognised ${capability} wrapper. Correct the agent YAML explicitly before disabling.`);
	}
	if (enabled && !selected) throw new Error(`Select an installed ${packages[capability].name} package first.`);
	const remove = (path: string, entries: string[]) => !entries.includes(path);
	const tools = enabled
		? [
				...agent.tools.filter((name, index) => name !== tool || agent.tools.indexOf(name) === index),
				...(agent.tools.includes(tool) ? [] : [tool]),
			]
		: agent.tools.filter((name) => name !== tool);
	const extensions = enabled
		? await addResource(agent.extensions, selected!.entry)
		: agent.extensions.filter((path) => remove(path, current.entries));
	const skills =
		enabled && includeSkill && selected!.skill
			? await addResource(agent.skills, selected!.skill)
			: enabled
				? [...agent.skills]
				: agent.skills.filter((path) => remove(path, current.skills));
	return { tools, extensions, skills };
}
