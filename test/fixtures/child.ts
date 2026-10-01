import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentSnapshot } from "../../config.ts";
import { VIOLATION_ENTRY, type Violation } from "../../protocol.ts";
import { stopGroup } from "../../runner.ts";
import { launchChild, type ReadyChild } from "../../startup.ts";
import type { Turn } from "./fake-model.ts";
import { createWorkspace, PI_BIN, type Workspace, type WorkspaceOptions } from "./pi-rpc.ts";

const GUARD = new URL("../../child-guard.ts", import.meta.url).pathname;

export interface RunOptions {
	tools: string[];
	/** Turns for the scripted fake model; receives the working directory. */
	script?: (cwd: string) => Turn[];
	/** Files to create in the working directory before the run. */
	files?: Record<string, string>;
	/** Extra environment for the child. */
	env?: Record<string, string>;
	/** MCP servers for the workspace; see WorkspaceOptions. */
	mcpServers?: WorkspaceOptions["mcpServers"];
	/** Plant files in the workspace before start-up. */
	seed?: WorkspaceOptions["seed"];
	/** Trusted extension paths the YAML would list. */
	extensions?: string[];
	/** Wait until Pi has listed the MCP fixture's tools before sending the task. */
	waitForMcp?: boolean;
}

export interface Outcome {
	workspace: Workspace;
	child: ReadyChild;
	violations: Violation[];
	/** Tool names the MCP fixture server actually received, in order. */
	mcpCalls: string[];
	/** Text of every tool result the model was shown. */
	toolResults: string[];
}

/** Starts OMPSS children through the real gate and cleans them up. */
export function childHarness() {
	let workspace: Workspace | undefined;
	let child: ReadyChild | undefined;

	return {
		/** Launch a ready child, send one task, and wait until Pi settles. */
		async run(options: RunOptions): Promise<Outcome> {
			workspace = await createWorkspace({ mcpServers: options.mcpServers, seed: options.seed });
			for (const [name, content] of Object.entries(options.files ?? {}))
				await writeFile(join(workspace.cwd, name), content);
			await writeFile(join(workspace.root, "persona.md"), "Persona.");
			const snapshot: AgentSnapshot = {
				name: "agent",
				personaPath: "unused",
				persona: "Persona.",
				tools: options.tools,
				skills: [],
				extensions: options.extensions ?? [],
			};
			workspace.model.script = options.script?.(workspace.cwd) ?? [{ text: "done" }];

			child = await launchChild({
				snapshot,
				cwd: workspace.cwd,
				personaFile: join(workspace.root, "persona.md"),
				guardPath: GUARD,
				runToken: "run-token",
				piBin: PI_BIN,
				parentModel: "fake/counter",
				env: { ...process.env, ...workspace.isolationEnv, ...options.env },
			});
			for (let waited = 0; options.waitForMcp && !existsSync(workspace.mcpReadyFile); waited += 100) {
				if (waited > 20_000) throw new Error("MCP fixture never connected");
				await new Promise((done) => setTimeout(done, 100));
			}
			await child.channel.request({ type: "prompt", message: "go" }, 20_000);
			await child.channel.waitFor((record) => record.type === "agent_settled", 40_000);

			const violations = child.channel.records
				.filter((record) => record.type === "entry_appended" && record.entry?.customType === VIOLATION_ENTRY)
				.map((record) => record.entry.data as Violation);
			const log = await readFile(workspace.mcpCallLog, "utf8").catch(() => "");
			const toolResults = (workspace.model.requests as Array<{ messages: Array<{ role: string; content: unknown }> }>)
				.flatMap((request) => request.messages)
				.filter((message) => message.role === "tool")
				.map((message) => JSON.stringify(message.content));
			return { workspace, child, violations, mcpCalls: log.split("\n").filter(Boolean), toolResults };
		},

		async cleanup(): Promise<void> {
			if (child) await stopGroup(child.child, child.channel.exited);
			await workspace?.dispose();
			child = undefined;
			workspace = undefined;
		},
	};
}
