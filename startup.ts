// Child start-up gate: no task reaches a model until the child proves it is ready.

import type { ChildProcess } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { OwnedProcesses, type Proc } from "./processes.ts";
import { PREFLIGHT_COMMAND, READY_ENTRY, parseReadiness, type Readiness } from "./protocol.ts";
import {
	DEFAULT_STARTUP_DEADLINE_MS,
	buildLaunch,
	spawnChild,
	stopGroup,
	type LaunchInput,
	type LaunchPlan,
} from "./runner.ts";
import { RpcChannel } from "./rpc.ts";

/** The guard reports its own problems at the policy deadline. The parent waits a little longer, so the specific reason wins. */
const DEADLINE_SLACK_MS = 2000;

export class StartupError extends Error {
	/** True when the caller aborted the launch. */
	cancelled = false;
	/** The failed launch may have left descendants behind. */
	cleanupFailed = false;

	constructor(
		message: string,
		/** Tail of the child's stderr, kept for diagnosis. */
		readonly stderr = "",
		/** Process ID of the failed child, to check that it is gone. */
		readonly pid?: number,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "StartupError";
	}
}

export interface ReadyChild {
	child: ChildProcess;
	channel: RpcChannel;
	/** Descendants of the child, tracked so cleanup can confirm they are gone. */
	owned: OwnedProcesses;
	plan: LaunchPlan;
	readiness: Readiness;
}

async function assertWorkingDirectory(cwd: string): Promise<void> {
	if (!isAbsolute(cwd)) throw new StartupError(`working directory must be absolute: ${cwd}`);
	try {
		if (!(await stat(cwd)).isDirectory()) throw new Error("not a directory");
	} catch {
		throw new StartupError(`working directory does not exist or is not a directory: ${cwd}`);
	}
}

/**
 * Spawn the child and run the readiness gate. Resolves only when the guard, every approved tool, the
 * model and the working directory are confirmed and no model run has started. Any failure kills the
 * child's process group and rejects with a StartupError, having sent the task to no model.
 */
export interface LaunchOptions {
	/** Aborts the launch; the child is then stopped and the error has `cancelled` set. */
	signal?: AbortSignal;
	/** Called as soon as the child process exists, before it is ready. */
	onSpawn?: (child: ChildProcess) => void;
	/** Replaces the process-tree lookup. For fault injection in tests. */
	listProcesses?: (rootPid: number) => Promise<Proc[]>;
	/** Receives each stderr chunk of the child from the moment it exists. */
	onStderr?: (text: string) => void;
}

export async function launchChild(
	input: LaunchInput,
	{ signal, onSpawn, listProcesses, onStderr }: LaunchOptions = {},
): Promise<ReadyChild> {
	await assertWorkingDirectory(input.cwd);
	const plan = buildLaunch(input);
	const child = spawnChild(plan);
	onSpawn?.(child);
	const channel = new RpcChannel(child, { onStderr });
	const owned = new OwnedProcesses(child.pid!, listProcesses);
	owned.watch();
	const deadlineMs = (input.startupDeadlineMs ?? DEFAULT_STARTUP_DEADLINE_MS) + DEADLINE_SLACK_MS;
	const fail = (message: string) => {
		const broken = channel.records.find((record) => record.type === "protocol_error");
		return new StartupError(
			broken ? `${message} (protocol error: ${broken.reason})` : message,
			channel.stderr(),
			child.pid,
		);
	};

	const exitError = async () => {
		const { code, signal: exitSignal } = await channel.exited;
		return fail(`child exited before it was ready (${exitSignal ?? `code ${code}`})`);
	};
	const guarded = runGate(input, channel, deadlineMs, fail).catch(async (error: Error) => {
		if (error instanceof StartupError) throw error;
		throw error.message === "child exited" ? await exitError() : fail(error.message);
	});

	let timer: NodeJS.Timeout | undefined;
	let onAbort: (() => void) | undefined;
	try {
		const readiness = await Promise.race([
			guarded,
			new Promise<never>((_, reject) =>
				child.once("error", (error) => reject(fail(`cannot start ${plan.command}: ${error.message}`))),
			),
			exitError().then((error) => Promise.reject(error)),
			new Promise<never>(
				(_, reject) =>
					(timer = setTimeout(() => reject(fail(`child was not ready within ${deadlineMs} ms`)), deadlineMs)),
			),
			new Promise<never>((_, reject) => {
				onAbort = () => reject(Object.assign(fail("launch was cancelled"), { cancelled: true }));
				if (signal?.aborted) onAbort();
				else signal?.addEventListener("abort", onAbort, { once: true });
			}),
		]);
		return { child, channel, owned, plan, readiness };
	} catch (error) {
		const cleanupError = await stopGroup(child, channel.exited, undefined, owned);
		if (cleanupError) {
			const failure = new StartupError(
				`${error instanceof Error ? error.message : String(error)}; cleanup failed: ${cleanupError}`,
				channel.stderr(),
				child.pid,
				{ cause: error },
			);
			failure.cleanupFailed = true;
			failure.cancelled = error instanceof StartupError && error.cancelled;
			throw failure;
		}
		throw error;
	} finally {
		clearTimeout(timer);
		if (onAbort) signal?.removeEventListener("abort", onAbort);
	}
}

/** The readiness sequence, separate from process ownership so it can be tested with a fake channel. */
export async function runGate(
	input: LaunchInput,
	channel: RpcChannel,
	timeoutMs: number,
	fail: (message: string) => StartupError,
): Promise<Readiness> {
	const { data } = await channel.request({ type: "get_commands" }, timeoutMs);
	const guard = data.commands.find(
		(command: any) =>
			command.name === PREFLIGHT_COMMAND &&
			command.source === "extension" &&
			command.sourceInfo?.path === input.guardPath,
	);
	if (!guard) throw fail(`child guard is not loaded; command /${PREFLIGHT_COMMAND} is missing`);

	const response = await channel.request({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` }, timeoutMs);
	if (!response.success || response.data?.disposition !== "handled") {
		throw fail(`preflight was not handled: ${response.error ?? `disposition ${response.data?.disposition}`}`);
	}

	const entry = await channel.waitFor(
		(record) => record.type === "entry_appended" && record.entry?.customType === READY_ENTRY,
		timeoutMs,
	);
	const parsed = parseReadiness(entry.entry.data, input.runToken);
	if ("error" in parsed) throw fail(`malformed readiness: ${parsed.error}`);
	if (!parsed.readiness.ok) throw fail(`child is not ready: ${parsed.readiness.problems.join("; ")}`);
	for (const key of ["registryPath", "depth", "maxDepth", "rootSessionId", "runId", "parentRunId"] as const) {
		if (parsed.readiness.lineage?.[key] !== input.lineage[key]) throw fail(`child reports different lineage.${key}`);
	}

	if ((await realpath(parsed.readiness.cwd)) !== (await realpath(input.cwd))) {
		throw fail(`child reports working directory ${parsed.readiness.cwd}, expected ${input.cwd}`);
	}
	const broken = channel.records.find((record) => record.type === "agent_start" || record.type === "extension_error");
	if (broken)
		throw fail(
			broken.type === "agent_start"
				? "a model run started before readiness"
				: `extension error during start-up: ${broken.error ?? broken.message}`,
		);
	return parsed.readiness;
}
