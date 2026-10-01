// OMPSS child guard. Loaded only into OMPSS child Pi processes, never into the parent.
//
// Pi treats an unknown slash command as a model prompt. The parent therefore
// confirms this command through `get_commands` before it sends `/ompss-child-preflight`.
// Pi handles extension commands without a model request.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
	PREFLIGHT_COMMAND,
	READY_ENTRY,
	VIOLATION_ENTRY,
	type ChildPolicy,
	type Readiness,
	type Violation,
} from "./protocol.ts";

const POLL_MS = 100;
const MARGIN_MS = 1000;

const readPolicy = (): ChildPolicy | string => {
	try {
		const policy = JSON.parse(process.env.OMPSS_POLICY ?? "");
		if (Array.isArray(policy.tools) && typeof policy.startupDeadlineMs === "number") return policy;
	} catch {
		// fall through
	}
	return "OMPSS_POLICY is missing or invalid";
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Native MCP tool names are `mcp__<server>__<tool>`; the old `mcp` proxy no longer exists. */
const missingTool = (name: string) =>
	name === "mcp"
		? 'tool "mcp" does not exist; the obsolete MCP proxy was removed. Use native names such as mcp__<server>__<tool>'
		: `tool "${name}" is not registered`;

function modelProblems(ctx: ExtensionContext, expected: string | undefined): string[] {
	const model = ctx.model;
	if (!model) return ["no model is selected"];
	const selected = `${model.provider}/${model.id}`;
	const problems: string[] = [];
	if (expected && selected !== expected) problems.push(`model ${selected} differs from the expected ${expected}`);
	// Pi accepts an unknown id on a known provider as a "custom model"; the registry lookup rejects it.
	const registered = ctx.modelRegistry.find(model.provider, model.id);
	if (!registered) problems.push(`model ${selected} is not in the model registry`);
	else if (!ctx.modelRegistry.hasConfiguredAuth(registered))
		problems.push(`model ${selected} has no configured authentication`);
	return problems;
}

export default function childGuard(pi: ExtensionAPI): void {
	// Execution-time enforcement. A missing or invalid policy approves nothing.
	const approved = (tool: string) => {
		const policy = readPolicy();
		return typeof policy !== "string" && policy.tools.includes(tool);
	};
	const recorded = new Set<string>();
	const record = (toolCallId: string, tool: string) => {
		if (recorded.has(toolCallId)) return;
		recorded.add(toolCallId);
		const violation: Violation = { token: process.env.OMPSS_RUN_TOKEN ?? "", tool };
		pi.appendEntry(VIOLATION_ENTRY, violation);
	};

	// `tool_call` covers every call that can run, including nested ones (`parentToolCallId` set):
	// tools found by tool_search and tools called from codemode.
	pi.on("tool_call", (event) => {
		if (approved(event.toolName)) return undefined;
		record(event.toolCallId, event.toolName);
		return { block: true, reason: `OMPSS: tool "${event.toolName}" is not approved for this agent` };
	});

	// Pi rejects a call to an inactive tool before `tool_call`. The attempt is still evidence.
	pi.on("tool_execution_start", (event) => {
		if (!approved(event.toolName)) record(event.toolCallId, event.toolName);
	});

	pi.registerCommand(PREFLIGHT_COMMAND, {
		description: "OMPSS private readiness check",
		handler: async (_args, ctx) => {
			const token = process.env.OMPSS_RUN_TOKEN ?? "";
			const policy = readPolicy();
			const names = () => pi.getAllTools().map((tool) => tool.name);
			const problems: string[] = [];

			if (typeof policy === "string") {
				problems.push(policy);
			} else {
				// MCP tools register after start-up. Wait inside the deadline, never past it.
				const until = Date.now() + Math.max(0, policy.startupDeadlineMs - process.uptime() * 1000 - MARGIN_MS);
				while (policy.tools.some((tool) => !names().includes(tool)) && Date.now() < until) await sleep(POLL_MS);
				problems.push(
					...policy.tools.filter((tool) => !names().includes(tool)).map(missingTool),
					...modelProblems(ctx, policy.model),
				);
			}

			const readiness: Readiness = {
				token,
				ok: problems.length === 0,
				problems,
				tools: names(),
				model: ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined,
				cwd: ctx.cwd,
			};
			pi.appendEntry(READY_ENTRY, readiness);
		},
	});
}
