// OMPSS runner: how a child Pi process is launched and owned.

import { spawn, type ChildProcess } from "node:child_process";
import type { AgentSnapshot } from "./config.ts";
import type { OwnedProcesses } from "./processes.ts";
import type { ChildPolicy } from "./protocol.ts";

export const DEFAULT_STARTUP_DEADLINE_MS = 30_000;

export interface LaunchInput {
	snapshot: AgentSnapshot;
	/** Absolute, existing working directory. The caller validates it before launch. */
	cwd: string;
	/** Run-directory copy of the snapshot persona, appended to Pi's system prompt. */
	personaFile: string;
	/** Absolute path of child-guard.ts. */
	guardPath: string;
	runToken: string;
	/** Absolute path of the managed Pi CLI, resolved once per launch. */
	piBin: string;
	/** `provider/id` of the parent's model, used when the YAML sets none. */
	parentModel?: string;
	/** Time allowed from spawn until the child is ready. Default 30 seconds. */
	startupDeadlineMs?: number;
	/** Base environment, default `process.env`. */
	env?: NodeJS.ProcessEnv;
}

export interface LaunchPlan {
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
}

/**
 * Build the child command line. Nothing ambient loads: extensions, skills, prompt templates and
 * themes are all off, then only the approved resources are added back. The task is never part of
 * the arguments; it travels over RPC stdin.
 */
export function buildLaunch(input: LaunchInput): LaunchPlan {
	const { snapshot } = input;
	const tools = snapshot.tools;
	const needsSearch = tools.includes("tool_search");
	const needsMcp = needsSearch || tools.some((tool) => tool.startsWith("mcp__"));

	const builtins = [
		...(needsMcp ? ["builtin:mcp"] : []),
		...(needsSearch ? ["builtin:tool-search"] : []),
		...(tools.includes("codemode") ? ["builtin:codemode"] : []),
	];
	const model = snapshot.model ?? input.parentModel;

	const args = [
		"--mode",
		"rpc",
		"--no-session",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-themes",
		"--no-approve",
		...(model ? ["--model", model] : []),
		"--thinking",
		snapshot.thinking,
		...[...builtins, input.guardPath, ...snapshot.extensions].flatMap((extension) => ["-e", extension]),
		...snapshot.skills.flatMap((skill) => ["--skill", skill]),
		"--append-system-prompt",
		input.personaFile,
		...(tools.length > 0 ? ["--tools", tools.join(",")] : ["--no-tools"]),
	];

	const policy: ChildPolicy = {
		tools: [...tools],
		model,
		startupDeadlineMs: input.startupDeadlineMs ?? DEFAULT_STARTUP_DEADLINE_MS,
	};
	return {
		command: input.piBin,
		args,
		cwd: input.cwd,
		env: {
			...(input.env ?? process.env),
			OMPSS_CHILD: "1",
			OMPSS_RUN_TOKEN: input.runToken,
			OMPSS_POLICY: JSON.stringify(policy),
		},
	};
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** True while any process of the child's group exists. */
export function groupAlive(pid: number): boolean {
	try {
		process.kill(-pid, 0);
		return true;
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM";
	}
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
	try {
		process.kill(-pid, signal);
	} catch {
		// The group is already gone.
	}
}

/** Wait until the group is gone or `ms` pass. */
async function waitGroupGone(pid: number, ms: number): Promise<boolean> {
	for (let waited = 0; groupAlive(pid); waited += 25) {
		if (waited >= ms) return false;
		await sleep(25);
	}
	return true;
}

/**
 * Stop the child and everything it started. The whole process group gets SIGTERM, then SIGKILL after the
 * grace period. Descendants in other groups, such as MCP servers, are found through `owned` and stopped
 * the same way. Returns an error text when a process survives or the tree cannot be inspected, and
 * nothing once cleanup is confirmed. Safe to call again and from several places at once.
 */
export async function stopGroup(
	child: ChildProcess,
	exited: Promise<unknown>,
	graceMs = 2000,
	owned?: OwnedProcesses,
): Promise<string | undefined> {
	const pid = child.pid;
	if (pid === undefined) return undefined;
	try {
		await owned?.sample(); // a last look at the tree while the child still lives
	} catch (error) {
		owned?.unwatch();
		await stopGroup(child, exited, graceMs); // still stop what can be stopped, but ownership is uncertain
		return (error as Error).message;
	}
	child.stdin?.end();
	if (groupAlive(pid)) signalGroup(pid, "SIGTERM");
	await Promise.race([exited, sleep(graceMs)]);
	if (!(await waitGroupGone(pid, graceMs))) {
		signalGroup(pid, "SIGKILL");
		if (!(await waitGroupGone(pid, graceMs))) return `process group ${pid} still has running processes`;
	}
	await exited;
	owned?.unwatch();
	return owned?.reap(graceMs);
}

/** Start the child with an argument array, no shell, and its own process group. */
export function spawnChild(plan: LaunchPlan): ChildProcess {
	// nosemgrep: AIK_js_shell_injection_child_process -- The operator-selected Pi executable and argument array run with shell disabled.
	return spawn(plan.command, plan.args, {
		cwd: plan.cwd,
		env: plan.env,
		shell: false,
		detached: true,
		stdio: ["pipe", "pipe", "pipe"],
	});
}
