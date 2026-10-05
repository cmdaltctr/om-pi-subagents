// Pi extension: OMPSS (Opinionated Modular Pi Subagents System).
//
// The factory only registers a tool and a command. It starts no process and reads no file; the run table,
// the store and the supervisor are built on first use. A child is spawned only from a validated `run`.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRegistryStore } from "./config.ts";
import { createNotifier, type Messenger } from "./notify.ts";
import { createPersistence } from "./persistence.ts";
import { CLEANUP_ENTRY, type ChildLineage } from "./protocol.ts";
import { RunManager } from "./runs.ts";
import { createService, type OmpssService, type RunContext } from "./service.ts";
import { RunStore } from "./store.ts";
import { createSupervisor } from "./supervisor.ts";

const GUARD_PATH = fileURLToPath(new URL("./child-guard.ts", import.meta.url));

const USAGE = "Usage: /ompss list | run <agent> <task> | status [run-id] | cancel <run-id>";

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

	end(): void {
		if (this.ended) return;
		this.ended = true;
		const ctx = this.ctx;
		if (ctx?.hasUI) {
			try {
				ctx.ui.setStatus("ompss", undefined);
			} catch {
				/* Clearing one display must not block the other. */
			}
			try {
				ctx.ui.setWidget("ompss", undefined);
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
						if (live()) ctx.ui.setStatus("ompss", text);
					}
				: undefined,
			setWidget: ctx.hasUI
				? (lines) => {
						if (live()) ctx.ui.setWidget("ompss", lines, { placement: "aboveEditor" });
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
	if (env.OMPSS_PI_BIN) return env.OMPSS_PI_BIN;
	// nosemgrep: AIK_ts_generic_path_traversal -- The trusted agent directory is followed only by constant components.
	const managed = join(agentDir, "bin", "pi");
	return exists(managed) ? managed : "pi";
}

/** The operator's agent mapping: an explicit override, or a file in the agent directory that package updates never touch. */
export function resolveRegistryPath(agentDir: string, env: NodeJS.ProcessEnv = process.env): string {
	// nosemgrep: AIK_ts_generic_path_traversal -- The trusted agent directory is followed only by a constant file name.
	return env.OMPSS_REGISTRY ?? join(agentDir, "om-pi-subagents.yaml");
}

export interface OmpssRuntime {
	service: OmpssService;
	manager: RunManager;
}

/** Build the runtime once, on first use. Child lifecycle hooks share its local run manager. */
function createRuntime(pi: ExtensionAPI, binding: SessionBinding, branch?: ChildLineage): OmpssRuntime {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const store = new RunStore(join(agentDir, "ompss", "runs"));
	const persistence = createPersistence(store);
	const notifier = createNotifier({
		messenger: (owner) => binding.messenger(pi, owner),
		readOutput: persistence.readOutput,
		directoryFor: (run) => store.directoryFor(run.owner, run.id),
		recordDelivery: persistence.recordDelivery,
	});
	const supervisor = createSupervisor({
		piBin: resolvePiBin(agentDir),
		guardPath: GUARD_PATH,
		prepare: persistence.prepare,
		persist: persistence.persist,
		onChild: persistence.onChild,
		onReady: persistence.onReady,
		onProgress: notifier.onProgress,
	});
	const manager = new RunManager(supervisor, {
		onChange: (view) => {
			persistence.onChange(view);
			notifier.onChange(view);
			if (branch && view.cleanupFailed)
				pi.appendEntry(CLEANUP_ENTRY, {
					token: process.env.OMPSS_RUN_TOKEN ?? "",
					runId: view.id,
					error: view.error ?? "descendant cleanup could not be confirmed",
				});
		},
		onTerminal: (view) => notifier.onTerminal(view),
	});
	return {
		manager,
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
export function registerOmpss(pi: ExtensionAPI, getService: () => OmpssService, binding?: SessionBinding): void {
	pi.registerTool({
		name: "ompss",
		label: "ompss",
		description:
			"Run mapped subagents in the background within configured per-session limits, check progress, or cancel an owned subtree. Results arrive separately as follow-up messages.",
		promptSnippet: "ompss: run a mapped subagent in the background (actions: list, run, status, cancel)",
		parameters: PARAMETERS as never,
		execute: async (_id, params: ToolParams, _signal, _update, ctx) => {
			// The abort signal of this call is deliberately not passed on. The run outlives the call that started it.
			binding?.bind(ctx);
			const { owner, context } = sessionOf(ctx);
			const service = getService();
			const actions = {
				list: () => service.list(),
				run: () => service.run(owner, { agent: params.agent ?? "", task: params.task ?? "", cwd: params.cwd }, context),
				status: async () => service.status(owner, params.runId),
				cancel: async () => service.cancel(owner, params.runId ?? ""),
			};
			if (!Object.hasOwn(actions, params.action))
				throw new Error(`unknown action "${params.action}"; use list, run, status or cancel`);
			const text = await actions[params.action]();
			return { content: [{ type: "text", text }], details: undefined };
		},
	});

	pi.registerCommand("ompss", {
		description: "OMPSS subagents: /ompss list | run <agent> <task> | status [run-id] | cancel <run-id>",
		handler: async (args, ctx) => {
			binding?.bind(ctx);
			const { owner, context } = sessionOf(ctx);
			const service = getService();
			const input = args.trim();
			try {
				let text: string;
				const run = /^run\s+(\S+)\s+([\s\S]+)$/.exec(input);
				if (input === "list") text = await service.list();
				else if (run) text = await service.run(owner, { agent: run[1], task: run[2] }, context);
				else if (input === "" || /^status(\s+\S+)?$/.test(input)) text = service.status(owner, input.split(/\s+/)[1]);
				else if (/^cancel\s+\S+$/.test(input)) text = service.cancel(owner, input.split(/\s+/)[1]);
				else return void ctx.ui.notify(USAGE, "warning");
				ctx.ui.notify(text, "info");
			} catch (error) {
				ctx.ui.notify(`OMPSS: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}

/** Register the same lazy runtime in a root or explicitly approved managed child. */
export function registerRuntime(pi: ExtensionAPI, branch?: ChildLineage): () => OmpssRuntime | undefined {
	const binding = new SessionBinding();
	let runtime: OmpssRuntime | undefined;
	registerOmpss(pi, () => (runtime ??= createRuntime(pi, binding, branch)).service, binding);

	pi.on("session_start", (_event, ctx) => binding.bind(ctx));
	// Quit, reload and session replacement all end here: detach first so no message reaches a successor,
	// then stop the children and wait until their cleanup is confirmed.
	pi.on("session_shutdown", async () => {
		const owner = binding.owner;
		binding.end();
		if (owner && runtime) await runtime.service.shutdown(owner);
	});
	return () => runtime;
}

export default function ompss(pi: ExtensionAPI): void {
	// A marked child may use only the parent's explicitly loaded managed entry.
	if (process.env.OMPSS_CHILD === "1") return;
	registerRuntime(pi);
}
