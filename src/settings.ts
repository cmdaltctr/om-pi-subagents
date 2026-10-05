import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	readLimitSettings,
	saveLimitSetting,
	type DisplayPreferences,
	type DisplaySettings,
	type LimitSettings,
} from "./settings-persistence.ts";

export interface SettingsResources {
	readonly registryPath: string;
	readonly preferences: DisplayPreferences;
	onDisplayChanged?(ctx: ExtensionCommandContext): void;
}

const labels = (limits: LimitSettings, display: DisplaySettings) => [
	`Maximum nesting depth: ${limits.limits.maxDepth} (root depth 0)`,
	`Parallel direct children per parent: ${limits.limits.maxConcurrentRuns}`,
	`Visible agents: ${display.value}`,
	"Done",
];

function wholeNumber(answer: string, index: number): number {
	const text = answer.trim();
	const value = /^\d+$/.test(text) ? Number(text) : Number.NaN;
	const minimum = index === 0 ? 0 : 1;
	if (!Number.isSafeInteger(value) || value < minimum || (index === 2 && value > 256)) {
		throw new Error(
			index === 2
				? "Visible agents must be a whole number from 1 to 256. Enter a valid value."
				: `This limit must be a whole number of at least ${minimum}. Enter a valid value.`,
		);
	}
	return value;
}

async function showSettings(ctx: ExtensionCommandContext, resources: SettingsResources): Promise<void> {
	const { preferences } = resources;
	let limits: LimitSettings;
	try {
		limits = await readLimitSettings(resources.registryPath);
	} catch (error) {
		throw new Error(`Fix the selected registry and reopen settings: ${(error as Error).message}`, { cause: error });
	}
	let display = await preferences.refresh();
	try {
		resources.onDisplayChanged?.(ctx);
	} catch {
		/* A repaint cannot block the operator's dialogs. */
	}
	for (const diagnostic of display.diagnostics) ctx.ui.notify(diagnostic, "error");
	for (;;) {
		const items = labels(limits, display);
		const choice = await ctx.ui.select(
			`Subagent settings\nExecution limits: ${limits.path}\nDisplay: ${display.path}`,
			items,
		);
		const index = choice === undefined ? -1 : items.indexOf(choice);
		if (index < 0 || index === 3) return;
		const current =
			index === 0 ? limits.limits.maxDepth : index === 1 ? limits.limits.maxConcurrentRuns : display.value;
		const answer = await ctx.ui.input(items[index], String(current));
		if (answer === undefined) continue;
		let value: number;
		try {
			value = wholeNumber(answer, index);
		} catch (error) {
			ctx.ui.notify((error as Error).message, "error");
			continue;
		}
		const destination = index === 2 ? display.path : limits.path;
		const creation =
			index !== 2 && limits.missing ? "Create the missing version-one registry with no mapped agents.\n" : "";
		const warning =
			index === 2 ? "" : "\nNested branching can multiply process and provider load. Admitted runs continue unchanged.";
		if (
			!(await ctx.ui.confirm(
				"Save this subagent setting?",
				`${creation}${items[index]} → ${value}\nSave to: ${destination}${warning}`,
			))
		)
			continue;
		if (index === 2) {
			await preferences.save(display, value);
			display = await preferences.refresh();
			try {
				resources.onDisplayChanged?.(ctx);
			} catch {
				/* The confirmed save remains successful. */
			}
		} else {
			await saveLimitSetting(limits, index === 0 ? "maxDepth" : "maxConcurrentRuns", value, limits.missing);
			limits = await readLimitSettings(resources.registryPath);
		}
		ctx.ui.notify(`Subagent setting saved to ${destination}.`, "info");
	}
}

/** Register only native operator dialogs. File access starts after syntax and UI checks. */
export function registerSubagentsSettings(pi: ExtensionAPI, getResources: () => SettingsResources): void {
	pi.registerCommand("subagents-settings", {
		description: "Set subagent nesting depth, parallel direct children per parent and visible agents",
		handler: async (args, ctx) => {
			if (args.trim()) return void ctx.ui.notify("Usage: /subagents-settings", "warning");
			if (!ctx.hasUI) {
				ctx.ui.notify(
					"/subagents-settings requires supported UI dialogs. Use interactive Pi or a client with RPC dialogs.",
					"error",
				);
				return;
			}
			try {
				await showSettings(ctx, getResources());
			} catch (error) {
				ctx.ui.notify(`OMPSS settings: ${(error as Error).message}`, "error");
			}
		},
	});
}
