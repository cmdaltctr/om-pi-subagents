import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	checkUiKey,
	checkDistinctUiKeys,
	FLEET_VIEWS,
	UI_KEY_FIELDS,
	RegistryError,
	type UiKeyField,
	type UiSettings,
} from "./config.ts";
import { capabilityEdit, inspectCapability, selectPublishedPackage, type Capability } from "./capabilities.ts";
import {
	readLimitSettings,
	saveCapabilityMapping,
	saveLimitSetting,
	saveUiSetting,
	type LimitSettings,
} from "./settings-persistence.ts";
import type { UiSettingsCache, UiSettingsState } from "./ui-settings.ts";

export interface SettingsResources {
	readonly registryPath: string;
	readonly ui: UiSettingsCache;
	/** Keys actually bound in this session; undefined until shortcut registration runs. */
	activeKeys?(): UiSettings | undefined;
	onDisplayChanged?(ctx: ExtensionCommandContext): void;
	/** Drop the session fleet toggle after a saved `ui.fleetView` change. */
	onFleetViewSaved?(): void;
}

const sourceLabel: Record<UiSettingsState["maxVisibleAgentsSource"], string> = {
	yaml: "YAML",
	legacy: "legacy",
	default: "default",
};

function wholeNumber(answer: string, minimum: number, maximum?: number): number {
	const text = answer.trim();
	const value = /^\d+$/.test(text) ? Number(text) : Number.NaN;
	const cap = maximum === undefined ? Number.MAX_SAFE_INTEGER : maximum;
	if (!Number.isSafeInteger(value) || value < minimum || value > cap) {
		throw new Error(
			maximum === undefined
				? `This limit must be a whole number of at least ${minimum}. Enter a valid value.`
				: `Visible agents must be a whole number from ${minimum} to ${maximum}. Enter a valid value.`,
		);
	}
	return value;
}

function shortcutItem(label: string, saved: string, active: UiSettings | undefined, field: keyof UiSettings): string {
	const bound = active?.[field];
	const suffix =
		bound !== undefined && bound !== saved && (bound !== "off" || saved !== "off")
			? ` (active ${bound}; /reload to apply)`
			: "";
	return `${label}: ${saved}${suffix}`;
}

function menuItems(limits: LimitSettings, ui: UiSettingsState, active: UiSettings | undefined): string[] {
	const items = [
		`Maximum nesting depth: ${limits.limits.maxDepth} (root depth 0)`,
		`Parallel direct children per parent: ${limits.limits.maxConcurrentRuns}`,
		`Visible agents: ${ui.value.maxVisibleAgents} (${sourceLabel[ui.maxVisibleAgentsSource]})`,
		`Fleet view: ${ui.value.fleetView}`,
		shortcutItem("Fleet view shortcut", ui.value.toggleKey, active, "toggleKey"),
		shortcutItem("Inspection shortcut", ui.value.inspectKey, active, "inspectKey"),
		`Management list: ${ui.value.showManagementList ? "Show" : "Hide"}`,
		shortcutItem("Management next / enter key", ui.value.navigationDownKey, active, "navigationDownKey"),
		shortcutItem("Management previous key", ui.value.navigationUpKey, active, "navigationUpKey"),
	];
	if (ui.maxVisibleAgentsSource === "legacy")
		items.push(`Import legacy visible agents (${ui.value.maxVisibleAgents}) into YAML`);
	items.push("Agent capabilities", "Done");
	return items;
}

async function repaint(resources: SettingsResources, ctx: ExtensionCommandContext): Promise<void> {
	try {
		resources.onDisplayChanged?.(ctx);
	} catch {
		/* A repaint cannot block the operator's dialogs. */
	}
}

async function showSettings(ctx: ExtensionCommandContext, resources: SettingsResources): Promise<void> {
	let limits: LimitSettings;
	try {
		limits = await readLimitSettings(resources.registryPath);
	} catch (error) {
		throw new Error(`Fix the selected registry and reopen settings: ${(error as Error).message}`, { cause: error });
	}
	let ui = await resources.ui.refresh();
	await repaint(resources, ctx);
	for (const diagnostic of ui.diagnostics) ctx.ui.notify(diagnostic, "error");
	for (;;) {
		const active = resources.activeKeys?.();
		const items = menuItems(limits, ui, active);
		const choice = await ctx.ui.select(
			`OMPS settings\nRegistry: ${limits.path}\nLegacy display input: ${resources.ui.legacyPath}`,
			items,
		);
		if (choice === undefined || choice === "Done") return;
		const index = items.indexOf(choice);
		if (index < 2) {
			await editLimit(ctx, limits, index, choice);
			limits = await readLimitSettings(resources.registryPath);
			continue;
		}
		if (index === 2) {
			await editVisibleAgents(ctx, resources, limits, ui, choice);
			limits = await readLimitSettings(resources.registryPath);
			ui = await resources.ui.refresh();
			continue;
		}
		if (index === 3) {
			const saved = await editFleetView(ctx, limits, ui);
			limits = await readLimitSettings(resources.registryPath);
			ui = await resources.ui.refresh();
			if (saved) {
				resources.onFleetViewSaved?.();
				await repaint(resources, ctx);
			}
			continue;
		}
		if (index === 6) {
			const saved = await editManagementList(ctx, limits, ui);
			limits = await readLimitSettings(resources.registryPath);
			ui = await resources.ui.refresh();
			if (saved) await repaint(resources, ctx);
			continue;
		}
		if ([4, 5, 7, 8].includes(index)) {
			const field = UI_KEY_FIELDS[[4, 5, 7, 8].indexOf(index)];
			await editShortcut(ctx, resources, limits, ui, field, choice);
			limits = await readLimitSettings(resources.registryPath);
			ui = await resources.ui.refresh();
			continue;
		}
		if (choice === "Agent capabilities") {
			await showCapabilities(ctx, limits);
			limits = await readLimitSettings(resources.registryPath);
			continue;
		}
		if (choice.includes("Import legacy")) {
			await importLegacy(ctx, resources, limits, ui, choice);
			limits = await readLimitSettings(resources.registryPath);
			ui = await resources.ui.refresh();
		}
	}
}

async function editLimit(
	ctx: ExtensionCommandContext,
	limits: LimitSettings,
	index: number,
	label: string,
): Promise<void> {
	const key = index === 0 ? "maxDepth" : "maxConcurrentRuns";
	const minimum = index === 0 ? 0 : 1;
	const current = index === 0 ? limits.limits.maxDepth : limits.limits.maxConcurrentRuns;
	const answer = await ctx.ui.input(label, String(current));
	if (answer === undefined) return;
	let value: number;
	try {
		value = wholeNumber(answer, minimum);
	} catch (error) {
		ctx.ui.notify((error as Error).message, "error");
		return;
	}
	const creation = limits.missing ? "Create the missing version-one registry with no mapped agents.\n" : "";
	const warning = "\nNested branching can multiply process and provider load. Admitted runs continue unchanged.";
	if (
		!(await ctx.ui.confirm(
			"Save this subagent setting?",
			`${creation}${label.split(":")[0]} → ${value}\nSave to: ${limits.path}${warning}`,
		))
	)
		return;
	await saveLimitSetting(limits, key, value, limits.missing);
	ctx.ui.notify(`Subagent setting saved to ${limits.path}.`, "info");
}

async function editVisibleAgents(
	ctx: ExtensionCommandContext,
	resources: SettingsResources,
	limits: LimitSettings,
	ui: UiSettingsState,
	label: string,
): Promise<void> {
	const answer = await ctx.ui.input(label.split(" (")[0], String(ui.value.maxVisibleAgents));
	if (answer === undefined) return;
	let value: number;
	try {
		value = wholeNumber(answer, 1, 256);
	} catch (error) {
		ctx.ui.notify((error as Error).message, "error");
		return;
	}
	const creation = limits.missing ? "Create the missing version-one registry with no mapped agents.\n" : "";
	if (
		!(await ctx.ui.confirm(
			"Save this subagent setting?",
			`${creation}Visible agents → ${value}\nSave to: ${limits.path}\nThe fleet repaints immediately.`,
		))
	)
		return;
	await saveUiSetting(limits, "maxVisibleAgents", value, limits.missing);
	await repaint(resources, ctx);
	ctx.ui.notify(`Subagent setting saved to ${limits.path}.`, "info");
}

async function editFleetView(
	ctx: ExtensionCommandContext,
	limits: LimitSettings,
	ui: UiSettingsState,
): Promise<boolean> {
	const value = await ctx.ui.select(`Fleet view (now ${ui.value.fleetView})`, [...FLEET_VIEWS]);
	if (value === undefined || !FLEET_VIEWS.includes(value as UiSettings["fleetView"])) return false;
	const creation = limits.missing ? "Create the missing version-one registry with no mapped agents.\n" : "";
	if (
		!(await ctx.ui.confirm(
			"Save this subagent setting?",
			`${creation}Fleet view → ${value}\nSave to: ${limits.path}\nThe fleet repaints immediately.`,
		))
	)
		return false;
	await saveUiSetting(limits, "fleetView", value, limits.missing);
	ctx.ui.notify(`Subagent setting saved to ${limits.path}.`, "info");
	return true;
}

async function editManagementList(
	ctx: ExtensionCommandContext,
	limits: LimitSettings,
	ui: UiSettingsState,
): Promise<boolean> {
	const choice = await ctx.ui.select(`Management list (now ${ui.value.showManagementList ? "Show" : "Hide"})`, [
		"Show",
		"Hide",
	]);
	if (choice !== "Show" && choice !== "Hide") return false;
	const creation = limits.missing ? "Create the missing version-one registry with no mapped agents.\n" : "";
	if (
		!(await ctx.ui.confirm(
			"Save this subagent setting?",
			`${creation}Management list → ${choice}\nSave to: ${limits.path}\nThe fleet repaints immediately.`,
		))
	)
		return false;
	await saveUiSetting(limits, "showManagementList", choice === "Show", limits.missing);
	ctx.ui.notify(`Subagent setting saved to ${limits.path}.`, "info");
	return true;
}

async function editShortcut(
	ctx: ExtensionCommandContext,
	resources: SettingsResources,
	limits: LimitSettings,
	ui: UiSettingsState,
	field: UiKeyField,
	label: string,
): Promise<void> {
	const answer = await ctx.ui.input(label.split(" (")[0], ui.value[field]);
	if (answer === undefined) return;
	const value = answer.trim();
	try {
		checkUiKey(field, value);
		checkDistinctUiKeys({ ...ui.value, [field]: value });
	} catch (error) {
		ctx.ui.notify((error as RegistryError).message, "error");
		return;
	}
	const creation = limits.missing ? "Create the missing version-one registry with no mapped agents.\n" : "";
	if (
		!(await ctx.ui.confirm(
			"Save this subagent setting?",
			`${creation}${label.split(" (")[0]} → ${value}\nSave to: ${limits.path}\nShortcut changes take effect after /reload.`,
		))
	)
		return;
	await saveUiSetting(limits, field, value, limits.missing);
	ctx.ui.notify(`Subagent setting saved to ${limits.path}. Press /reload to activate.`, "info");
}

async function importLegacy(
	ctx: ExtensionCommandContext,
	resources: SettingsResources,
	limits: LimitSettings,
	ui: UiSettingsState,
	label: string,
): Promise<void> {
	const value = ui.value.maxVisibleAgents;
	if (
		!(await ctx.ui.confirm(
			"Import the legacy display setting?",
			`${label}\nWrite ui.maxVisibleAgents: ${value} to: ${limits.path}\nThe legacy file is left untouched.`,
		))
	)
		return;
	await saveUiSetting(limits, "maxVisibleAgents", value, limits.missing);
	await repaint(resources, ctx);
	ctx.ui.notify(`Legacy visible agents saved to ${limits.path}.`, "info");
}

async function showCapabilities(ctx: ExtensionCommandContext, limits: LimitSettings): Promise<void> {
	const names = [...limits.agents.keys()];
	if (names.length === 0) {
		ctx.ui.notify("Map an agent in the registry before changing child capabilities.", "info");
		return;
	}
	const name = await ctx.ui.select("Select an existing agent for Memory and Todo settings", [...names, "Back"]);
	if (!name || name === "Back" || !limits.agents.has(name)) return;
	const agent = limits.agents.get(name)!;
	const memory = await inspectCapability(agent, "Memory");
	const todo = await inspectCapability(agent, "Todo");
	const choice = await ctx.ui.select(
		`Agent ${name}: Off excludes sibling hooks. Partial needs correction in YAML or a confirmed edit.`,
		[`Memory: ${memory.state}`, `Todo: ${todo.state}`, "Back"],
	);
	if (!choice || choice === "Back") return;
	const capability: Capability = choice.startsWith("Memory:") ? "Memory" : "Todo";
	const state = capability === "Memory" ? memory : todo;
	const action = await ctx.ui.select(
		`${name} ${capability}: ${state.state}. On means configured, not a healthy backend. Partial mappings need correction.`,
		["Enable", ...(capability === "Memory" ? ["Enable with shipped skill"] : []), "Disable", "Back"],
	);
	if (!action || action === "Back") return;
	try {
		const enabled = action.startsWith("Enable");
		const includeSkill = action === "Enable with shipped skill";
		const path = enabled
			? await ctx.ui.input(`Installed ${capability} package folder or published Pi extension entry path`, "")
			: undefined;
		if (enabled && !path?.trim()) return;
		const resource = enabled ? await selectPublishedPackage(path!, capability) : undefined;
		if (includeSkill && !resource?.skill)
			throw new Error(`Installed ${capability} package has no shipped skill. Select another package.`);
		const mapping = await capabilityEdit(agent, capability, enabled, resource, includeSkill);
		const changes = (["tools", "extensions", "skills"] as const).flatMap((field) => {
			const added = mapping[field].filter((entry) => !agent[field].includes(entry));
			const removed = agent[field].filter((entry) => !mapping[field].includes(entry));
			return [...added.map((entry) => `${field}: + ${entry}`), ...removed.map((entry) => `${field}: - ${entry}`)];
		});
		if (changes.length === 0) {
			ctx.ui.notify(`${name} ${capability} is already configured as requested.`, "info");
			return;
		}
		const permission =
			capability === "Memory" && enabled
				? "\nMemory approval covers the whole tool, including write and portability modes."
				: "";
		if (
			!(await ctx.ui.confirm(
				`Save ${name} ${capability} for future children?`,
				`Agent: ${name}\nSave to: ${limits.path}\n${changes.join("\n")}${permission}\nActive children and parent extensions stay unchanged.`,
			))
		)
			return;
		await saveCapabilityMapping(limits, name, mapping);
		ctx.ui.notify(`${name} ${capability} saved to ${limits.path}. New launches use the edited mapping.`, "info");
	} catch (error) {
		ctx.ui.notify(`OMPS capability settings: ${(error as Error).message}`, "error");
	}
}

/** Register only native operator dialogs. File access starts after syntax and UI checks. */
export function registerOmpsSettings(pi: ExtensionAPI, getResources: () => SettingsResources): void {
	const handler = async (args: string, ctx: ExtensionCommandContext) => {
		if (args.trim()) return void ctx.ui.notify("Usage: /omps-settings (alias: /subagents-settings)", "warning");
		if (!ctx.hasUI) {
			ctx.ui.notify(
				"/omps-settings requires supported UI dialogs. Use interactive Pi or a client with RPC dialogs.",
				"error",
			);
			return;
		}
		try {
			await showSettings(ctx, getResources());
		} catch (error) {
			ctx.ui.notify(`OMPS settings: ${(error as Error).message}`, "error");
		}
	};
	pi.registerCommand("omps-settings", {
		description: "Set subagent limits, fleet shortcuts and optional per-agent capabilities",
		handler,
	});
	pi.registerCommand("subagents-settings", {
		description: "Alias of /omps-settings",
		handler,
	});
}
