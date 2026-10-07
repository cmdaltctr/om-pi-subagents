// Pi extension: OMPS (Opinionated Modular Pi Subagents).
//
// The factory only registers extension handlers. It starts no process and reads no file; the run table,
// the store and the supervisor are built on first use. A child is spawned only from a validated `run`.

import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TUI } from "@earendil-works/pi-tui";
import { ACK_MAX_AGENT_CHARS } from "./acknowledgement.ts";
import { createRegistryStore, type UiSettings } from "./config.ts";
import { FleetStrip } from "./fleet.ts";
import { editorOwnsFocus, handleFleetInput } from "./fleet-view.ts";
import { FleetWidget, LIST_KEY, TREE_KEY } from "./fleet-widget.ts";
import { createNotifier, type Messenger, type WidgetComponent } from "./notify.ts";
import { createPersistence } from "./persistence.ts";
import type { ObservationStore } from "./observation.ts";
import { ObservationRelay } from "./observation-relay.ts";
import { TransportObservationStore } from "./observation-transport.ts";
import { CLEANUP_ENTRY, OBSERVATION_ENTRY, type ChildLineage } from "./protocol.ts";
import { RunManager } from "./runs.ts";
import { createService, type OmpsService, type RunContext } from "./service.ts";
import { registerOmpsSettings } from "./settings.ts";
import { registerViewShortcuts } from "./shortcuts.ts";
import { RunStore } from "./store.ts";
import { createSupervisor } from "./supervisor.ts";
import { observationId } from "./observation-validation.ts";
import { createUiSettings, type UiSettingsCache } from "./ui-settings.ts";
import { RunViewer, TREE_ENTRY, type RunCardIdentity, type VisibleAgentsInput } from "./viewer.ts";

const GUARD_PATH = fileURLToPath(new URL("./child-guard.ts", import.meta.url));

const USAGE = "Usage: /omps list | run <agent> <task> | status [run-id] | cancel <run-id> | inspect [run-id] | fleet";

const acknowledgedRun = (text: string, owner: string): RunCardIdentity | undefined => {
	const match = /^Started run ([A-Za-z0-9._-]+) \((.+)\) in the background\./.exec(text);
	// The bounded agent label travels with the entry so historical sessions can render it without live evidence.
	return match && observationId(match[1])
		? { owner, runId: match[1], agent: match[2].slice(0, ACK_MAX_AGENT_CHARS) }
		: undefined;
};

/** Plain JSON Schema, the same shape TypeBox produces, so the extension needs no runtime import for it. */
const PARAMETERS = {
	type: "object",
	required: ["action"],
	properties: {
		action: {
			type: "string",
			enum: ["list", "run", "status", "cancel"],
			description: "list mapped agents, run one in the background, check a run, or cancel one.",
		},
		agent: { type: "string", description: "run: the mapped agent name." },
		task: { type: "string", description: "run: what the agent should do. It cannot start with a slash." },
		cwd: { type: "string", description: "run: absolute working directory. Defaults to the current directory." },
		runId: { type: "string", description: "status (optional) and cancel: the run id." },
	},
} as const;

interface ToolParams {
	action: "list" | "run" | "status" | "cancel";
	agent?: string;
	task?: string;
	cwd?: string;
	runId?: string;
}

/** What Pi tells us about the calling session. */
const sessionOf = (ctx: ExtensionContext) => ({
	owner: ctx.sessionManager.getSessionId(),
	context: {
		cwd: ctx.cwd,
		model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
	} satisfies RunContext,
});

/** The live session this extension instance belongs to. After it ends, nothing may reach a replacement session. */
export class SessionBinding {
	private ctx: ExtensionContext | undefined;
	private ended = false;

	bind(ctx: ExtensionContext): void {
		if (!this.ended) this.ctx = ctx;
	}

	get owner(): string | undefined {
		return this.ctx?.sessionManager.getSessionId();
	}

	/** Host mode: interactive hosts keep a live strip component, others receive plain lines. */
	get mode(): string | undefined {
		return this.ctx?.mode;
	}

	end(): void {
		if (this.ended) return;
		this.ended = true;
		const ctx = this.ctx;
		if (ctx?.hasUI) {
			try {
				ctx.ui.setStatus("omps", undefined);
			} catch {
				/* Clearing one display must not block the other. */
			}
			for (const key of [LIST_KEY, TREE_KEY])
				try {
					ctx.ui.setWidget(key, undefined);
				} catch {
					/* Detach even when the UI has gone. */
				}
		}
		this.ctx = undefined;
	}

	messenger(pi: ExtensionAPI, owner = this.owner): Messenger | undefined {
		const ctx = this.ctx;
		if (!ctx || this.ended || this.owner !== owner) return undefined;
		const live = () => !this.ended && this.ctx === ctx && this.owner === owner;
		return {
			send: async (message, options) => {
				// Reject so the notifier records a failed delivery rather than a silent success.
				if (!live()) throw new Error("the owning session has ended");
				pi.sendMessage(message, options);
			},
			setStatus: ctx.hasUI
				? (text) => {
						if (live()) ctx.ui.setStatus("omps", text);
					}
				: undefined,
			setWidget: ctx.hasUI
				? (content, placement, key = LIST_KEY) => {
						if (!live()) return;
						// Interactive hosts keep a live component with terminal facts; line hosts keep arrays.
						const options = { placement: placement ?? ("belowEditor" as const) };
						if (typeof content === "function")
							ctx.ui.setWidget(
								key,
								(tui: TUI, theme: Theme): WidgetComponent => {
									// The public focused-component accessor lives on the viewport TUI;
									// a host without it never reports editor focus, so navigation stays off.
									const viewport = tui as TUI & { getFocusedComponent?: () => unknown };
									return content({
										rows: tui.terminal.rows,
										requestRender: () => tui.requestRender(),
										theme,
										focus: {
											getFocusedComponent: () => viewport.getFocusedComponent?.() ?? null,
											hasOverlay: () => tui.hasOverlay(),
										},
									});
								},
								options,
							);
						else ctx.ui.setWidget(key, content, options);
					}
				: undefined,
		};
	}
}

/** The Pi executable for children: an explicit override, the managed launcher of this agent directory, or `pi` on the PATH. */
export function resolvePiBin(
	agentDir: string,
	env: NodeJS.ProcessEnv = process.env,
	exists: (path: string) => boolean = existsSync,
): string {
	if (env.OMPS_PI_BIN) return env.OMPS_PI_BIN;
	// nosemgrep: AIK_ts_generic_path_traversal -- The trusted agent directory is followed only by constant components.
	const managed = join(agentDir, "bin", "pi");
	return exists(managed) ? managed : "pi";
}

/** The operator's agent mapping: an explicit override, or a file in the agent directory that package updates never touch. */
export function resolveRegistryPath(agentDir: string, env: NodeJS.ProcessEnv = process.env): string {
	// nosemgrep: AIK_ts_generic_path_traversal -- The trusted agent directory is followed only by a constant file name.
	return env.OMPS_REGISTRY ?? join(agentDir, "om-pi-subagents.yaml");
}

export interface OmpsRuntime {
	service: OmpsService;
	manager: RunManager;
	observations: ObservationStore;
	viewer: RunViewer;
	/** The session-wide below-editor fleet strip. */
	fleet: FleetWidget;
	/** Detach display transport before stopping owned execution. */
	disposeObservations(): void;
}

/** Build the runtime once, on first use. Child lifecycle hooks share its local run manager. */
function createRuntime(
	pi: ExtensionAPI,
	binding: SessionBinding,
	preferences: VisibleAgentsInput,
	strip: FleetStrip,
	branch?: ChildLineage,
): OmpsRuntime {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const runRoot = join(agentDir, "omps", "runs");
	const store = new RunStore(runRoot);
	const persistence = createPersistence(store);
	const notifier = createNotifier({
		messenger: (owner) => binding.messenger(pi, owner),
		readOutput: persistence.readOutput,
		directoryFor: (run) => store.directoryFor(run.owner, run.id),
		recordDelivery: persistence.recordDelivery,
	});
	const observations = new TransportObservationStore();
	const relay = new ObservationRelay({
		observations,
		current: (run) => manager.status(run.owner, run.id),
		token: process.env.OMPS_RUN_TOKEN,
		publish: branch ? (envelope) => pi.appendEntry(OBSERVATION_ENTRY, envelope) : undefined,
	});
	const supervisor = createSupervisor({
		piBin: resolvePiBin(agentDir),
		guardPath: GUARD_PATH,
		prepare: persistence.prepare,
		persist: persistence.persist,
		onChild: persistence.onChild,
		onReady: (run, info) => {
			persistence.onReady(run, info);
			relay.onReady(run, info);
		},
		onProgress: (run, record) => {
			// Tool activity reaches the strip through validated observations, never a second panel.
			relay.onProgress(run, record);
		},
		onTask: (run, task) => relay.onTask(run, task),
		onObservation: (run, channel, token) => relay.connect(run, channel, token),
		onDisplayFailure: (run) => observations.markIncomplete({ owner: run.owner, runId: run.id }),
	});
	const manager = new RunManager(supervisor, {
		onChange: (view) => {
			persistence.onChange(view);
			relay.onChange(view);
			notifier.onChange(view);
			fleet.attach(view.owner);
			fleet.onChange(view);
			if (branch && view.cleanupFailed)
				pi.appendEntry(CLEANUP_ENTRY, {
					token: process.env.OMPS_RUN_TOKEN ?? "",
					runId: view.id,
					error: view.error ?? "descendant cleanup could not be confirmed",
				});
		},
		onTerminal: (view) => notifier.onTerminal(view),
	});
	const fleet = new FleetWidget({
		messenger: (owner) => binding.messenger(pi, owner),
		runs: (owner) => manager.list(owner),
		trees: (owner) => observations.trees(owner),
		toolUses: (runId) => relay.toolUses(runId),
		visibleAgents: () => preferences.value,
		strip,
		mode: () => binding.mode ?? "print",
		now: () => Date.now(),
	});
	const viewer = new RunViewer({
		observations,
		preferences,
		storeRoot: runRoot,
		owner: () => binding.owner,
		redraw: (owner) => fleet.repaint(owner),
	});
	return {
		manager,
		observations,
		viewer,
		fleet,
		disposeObservations: () => relay.dispose(),
		service: createService({
			registry: createRegistryStore(branch?.registryPath ?? resolveRegistryPath(agentDir)),
			branch,
			manager,
			directoryFor: (owner, runId) => store.directoryFor(owner, runId),
			flush: persistence.flush,
			deliveryOf: persistence.deliveryOf,
		}),
	};
}

/** Register the tool and the command over a service that may be built lazily. */
export function registerOmps(
	pi: ExtensionAPI,
	getService: () => OmpsService,
	binding?: SessionBinding,
	getViewer?: () => RunViewer | undefined,
	getFleet?: () => FleetWidget | undefined,
): void {
	pi.registerTool({
		name: "omps",
		label: "omps",
		description:
			"Run mapped subagents in the background within configured per-session limits, check progress, or cancel an owned subtree. Results arrive separately as follow-up messages.",
		promptSnippet: "omps: run a mapped subagent in the background (actions: list, run, status, cancel)",
		parameters: PARAMETERS as never,
		renderResult: (result, { expanded }, _theme, _context) => {
			const text = result.content
				.filter((block) => block.type === "text")
				.map((block) => block.text)
				.join("\n");
			// A list result shows one short line per agent until Ctrl+O reveals every tool name.
			const compact = (result.details as { compact?: unknown } | undefined)?.compact;
			if (typeof compact === "string") return new Text(expanded ? text : compact, 0, 0);
			const identity = result.details as RunCardIdentity | undefined;
			if (identity && observationId(identity.owner) && observationId(identity.runId)) {
				// Expansion reveals the acknowledgement text only; acknowledgements never become live trees.
				const component = getViewer?.()?.render(identity, expanded, text);
				if (component) return component;
			}
			return new Text(text, 0, 0);
		},
		execute: async (_id, params: ToolParams, _signal, _update, ctx) => {
			// The abort signal of this call is deliberately not passed on. The run outlives the call that started it.
			binding?.bind(ctx);
			const { owner, context } = sessionOf(ctx);
			const service = getService();
			let compact: string | undefined;
			const actions = {
				// The model keeps the full tool list; the transcript shows the compact form until expanded.
				list: async () => {
					const forms = await service.listForms();
					compact = forms.compact;
					return forms.full;
				},
				run: () => service.run(owner, { agent: params.agent ?? "", task: params.task ?? "", cwd: params.cwd }, context),
				status: async () => service.status(owner, params.runId),
				cancel: async () => service.cancel(owner, params.runId ?? ""),
			};
			if (!Object.hasOwn(actions, params.action))
				throw new Error(`unknown action "${params.action}"; use list, run, status or cancel`);
			const text = await actions[params.action]();
			if (compact !== undefined) return { content: [{ type: "text", text }], details: { compact } };
			const identity = params.action === "run" ? acknowledgedRun(text, owner) : undefined;
			if (identity) getViewer?.()?.activate(ctx);
			return { content: [{ type: "text", text }], details: identity };
		},
	});

	pi.registerEntryRenderer(TREE_ENTRY, (entry, { expanded }) => {
		const identity = entry.data as RunCardIdentity | undefined;
		const valid =
			identity &&
			observationId(identity.owner) &&
			observationId(identity.runId) &&
			(identity.agent === undefined || typeof identity.agent === "string");
		// Historical entries carry no launch text: expansion keeps the bounded labelled row.
		return valid
			? (getViewer?.()?.render(identity, expanded, undefined) ?? new Text("OMPS: observation unavailable", 0, 0))
			: new Text("OMPS: invalid tree identity", 0, 0);
	});

	pi.registerCommand("omps", {
		description:
			"OMPS subagents: /omps list | run <agent> <task> | status [run-id] | cancel <run-id> | inspect [run-id]",
		handler: async (args, ctx) => {
			binding?.bind(ctx);
			const { owner, context } = sessionOf(ctx);
			const input = args.trim();
			try {
				if (/^inspect(?:\s+\S+)?$/.test(input)) {
					const runId = input.split(/\s+/)[1];
					if (runId && !observationId(runId)) return void ctx.ui.notify(USAGE, "warning");
					const viewer = getViewer?.();
					if (viewer) await viewer.inspect(runId, ctx);
					else if (runId) throw new Error("Unknown or unowned run. Use /omps inspect without an id.");
					else ctx.ui.notify("No runs to inspect in this session.", "info");
					return;
				}
				if (input.startsWith("inspect")) return void ctx.ui.notify(USAGE, "warning");
				if (input === "fleet") {
					// View-only access: no service call, no process, no model request.
					const fleet = getFleet?.();
					fleet?.toggle();
					const lines = fleet ? [...fleet.treeLines(owner, 200), ...fleet.listLines(owner, 200)] : [];
					if (ctx.mode === "tui") {
						fleet?.attach(owner);
						fleet?.repaint(owner);
					}
					ctx.ui.notify(lines.length ? lines.join("\n") : "No runs in this session.", "info");
					return;
				}
				if (input.startsWith("fleet")) return void ctx.ui.notify(USAGE, "warning");
				const service = getService();
				let text: string;
				const run = /^run\s+(\S+)\s+([\s\S]+)$/.exec(input);
				if (input === "list") text = (await service.listForms()).compact;
				else if (run) {
					text = await service.run(owner, { agent: run[1], task: run[2] }, context);
					const identity = acknowledgedRun(text, owner);
					if (identity) {
						getViewer?.()?.activate(ctx);
						if (ctx.mode === "tui") pi.appendEntry(TREE_ENTRY, identity);
					}
				} else if (input === "" || /^status(\s+\S+)?$/.test(input)) text = service.status(owner, input.split(/\s+/)[1]);
				else if (/^cancel\s+\S+$/.test(input)) text = service.cancel(owner, input.split(/\s+/)[1]);
				else return void ctx.ui.notify(USAGE, "warning");
				ctx.ui.notify(text, "info");
			} catch (error) {
				ctx.ui.notify(`OMPS: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}

/** Register the same lazy runtime in a root or explicitly approved managed child. */
export function registerRuntime(pi: ExtensionAPI, branch?: ChildLineage): () => OmpsRuntime | undefined {
	const binding = new SessionBinding();
	let runtime: OmpsRuntime | undefined;
	const agentDir = () => process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	let ui: UiSettingsCache | undefined;
	// One cache per session: settings edits refresh the same values the fleet renders.
	const getUi = () => (ui ??= createUiSettings(branch?.registryPath ?? resolveRegistryPath(agentDir())));
	const visibleAgents: VisibleAgentsInput = {
		get value() {
			return getUi().value.maxVisibleAgents;
		},
		ensureLoaded: () => getUi().ensureLoaded(),
	};
	// The saved view comes from the cached registry; session toggles and selection never touch a file.
	const strip = new FleetStrip(() => getUi().value.fleetView);
	registerOmps(
		pi,
		() => (runtime ??= createRuntime(pi, binding, visibleAgents, strip, branch)).service,
		binding,
		() => runtime?.viewer,
		() => runtime?.fleet,
	);
	registerOmpsSettings(pi, () => ({
		registryPath: branch?.registryPath ?? resolveRegistryPath(agentDir()),
		ui: getUi(),
		activeKeys: () => activeKeys,
		// A saved view replaces any session toggle, so the operator sees the new setting at once.
		onFleetViewSaved: () => strip.resetView(),
		onDisplayChanged: (ctx) => {
			runtime?.viewer.activate(ctx);
			runtime?.viewer.redraw();
		},
	}));

	let activeKeys: UiSettings | undefined;
	let stopInput: (() => void) | undefined;
	pi.on("session_start", async (_event, ctx) => {
		binding.bind(ctx);
		if (ctx.mode !== "tui") return;
		// Refresh, then bind view shortcuts before the host snapshots editor bindings for this session.
		const state = await getUi().refresh();
		const registration = registerViewShortcuts(pi, state.value, {
			toggleFleet: () => {
				const owner = binding.owner;
				// An empty session still binds the strip; without runs it renders no lines.
				if (owner) runtime?.fleet.attach(owner);
				strip.toggle();
				if (owner) runtime?.fleet.repaint(owner);
			},
			openInspection: (view) => {
				// Inspection opens at the fleet's selected root, keeping one view controller.
				void runtime?.viewer.inspect(strip.selection(), view).catch(() => undefined);
			},
		});
		activeKeys = registration.keys;
		for (const diagnostic of registration.diagnostics) ctx.ui.notify(`OMPS shortcuts: ${diagnostic}`, "warning");
		// Down enters fleet selection only from an empty, focused editor while the expanded strip shows runs.
		stopInput?.();
		stopInput = ctx.ui.onTerminalInput((data) => {
			const owner = binding.owner;
			const current = runtime;
			if (!owner || !current) return undefined;
			const facts = current.fleet.factsOf(owner);
			return handleFleetInput(
				{
					strip,
					// Navigation moves through the rows the list shows, including briefly lingering finished runs.
					activeRunIds: () => current.fleet.listedRunIds(owner),
					editorText: () => {
						try {
							return ctx.ui.getEditorText();
						} catch {
							return " ";
						}
					},
					editorOwnsFocus: () => (facts?.focus ? editorOwnsFocus(facts.focus) : false),
					onViewChanged: () => current.viewer.redraw(owner),
					onInspect: (runId) => {
						void current.viewer.inspect(runId, ctx).catch(() => undefined);
					},
				},
				data,
			)
				? { consume: true }
				: undefined;
		});
	});
	// Finished runs age by parent turns, as in tintin's widget; aging needs no runtime before first use.
	pi.on("turn_start", async () => {
		const owner = binding.owner;
		if (owner) runtime?.fleet.onTurnStart(owner);
	});
	// Quit, reload and session replacement all end here: detach first so no message reaches a successor,
	// then stop the children and wait until their cleanup is confirmed.
	pi.on("session_shutdown", async () => {
		const owner = binding.owner;
		stopInput?.();
		stopInput = undefined;
		runtime?.viewer.dispose();
		if (owner) runtime?.fleet.clear(owner);
		binding.end();
		runtime?.disposeObservations();
		if (owner && runtime) await runtime.service.shutdown(owner);
	});
	return () => runtime;
}

export default function omps(pi: ExtensionAPI): void {
	// A marked child may use only the parent's explicitly loaded managed entry.
	if (process.env.OMPS_CHILD === "1") return;
	// A mixed-version child must never become an unguarded root launcher.
	if (process.env.OMPSS_CHILD === "1") throw new Error("Old child namespace detected. Stop children and restart Pi.");
	registerRuntime(pi);
}
