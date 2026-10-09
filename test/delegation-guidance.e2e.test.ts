// These checks prove prompt transport through real Pi, independently of the model's tool choices.
import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PI_AVAILABLE, PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";

const describePi = describe.skipIf(!PI_AVAILABLE);
const EXTENSION = new URL("../src/index.ts", import.meta.url).pathname;
const ORDINARY_TASK = "Explain how the parts of this small project fit together.";

interface Request {
	messages: Array<{ role: string; content: unknown }>;
	tools?: Array<{ function: { name: string } }>;
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

const promptText = (captured: Request) =>
	captured.messages
		.filter((message) => message.role === "system" || message.role === "developer")
		.map((message) => messageText(message.content))
		.join("\n");

function expectPolicy(text: string): void {
	for (const obligation of [
		/substantial tasks with separable work/,
		/fresh omps list/,
		/proactively delegate suitable bounded investigation\./,
		/Delegate review, audit or security work only when the user asks for it/,
		/clear task and expected result/,
		/Keep simple tasks local/,
		/Honour explicit user restrictions.*subagents/,
		/only freshly listed mappings.*approved tools/,
		/omps status.*current session.*more runs/,
		/empty, invalid or unsuitable mappings/,
		/continue permitted local work/,
		/change settings or grant tools without permission/,
		/Verify the working folder/,
		/parallel writers.*shared-file conflicts/,
		/configured concurrency.*inherited depth ceilings.*cleanup blocking/,
		/Honour launch refusals.*waiting or recovery guidance/,
		/never repeatedly retry or raise limits without permission/,
		/run id acknowledges launch.*not a result/,
		/Await the separately delivered result before relying/,
		/Assess findings against the task and available evidence/,
		/preserve failed or partial labels/,
		/parent remains responsible.*final answer.*parent task updates/,
		/Child completion alone.*OpenSpec task complete/,
		/Continue independent work while waiting/,
	])
		expect(text).toMatch(obligation);
}

let pi: PiFixture | undefined;
afterEach(async () => {
	await pi?.dispose();
	pi = undefined;
});

async function start(args: string[] = [], control?: string): Promise<PiFixture> {
	return startPi({
		mcp: false,
		args: [
			"--no-context-files",
			"--no-prompt-templates",
			"-e",
			EXTENSION,
			...(control ? ["-e", "./prompt-control.ts"] : []),
			...args,
		],
		seed: async ({ cwd, model }) => {
			model.script = [{ text: "fixture response" }];
			if (control) await writeFile(join(cwd, "prompt-control.ts"), control);
		},
	});
}

async function request(fixture: PiFixture, message = ORDINARY_TASK): Promise<Request> {
	const recordStart = fixture.records.length;
	const requestStart = fixture.model.requests.length;
	const response = await fixture.send({ type: "prompt", message });
	expect(response.success).toBe(true);
	await fixture.waitFor((record) => fixture.records.indexOf(record) >= recordStart && record.type === "agent_settled");
	expect(fixture.model.requests).toHaveLength(requestStart + 1);
	expect(fixture.records.filter((record) => record.type.startsWith("tool_execution_"))).toEqual([]);
	return fixture.model.requests[requestStart] as Request;
}

describePi("delegation guidance in real Pi requests", () => {
	it("supplies policy in the first default prompt without skills, user guidance or tool execution", async () => {
		pi = await start();
		const commands = await pi.send({ type: "get_commands" });
		expect(commands.data.commands.some((command: { name: string }) => command.name.startsWith("skill:"))).toBe(false);
		const first = await request(pi);
		expect(first.tools?.map((tool) => tool.function.name)).toContain("omps");
		expect(
			first.messages.filter((message) => message.role === "user").map((message) => messageText(message.content)),
		).toEqual([ORDINARY_TASK]);
		expect(first.messages.some((message) => message.role === "tool")).toBe(false);
		await expect(access(join(pi.agentDir, "omps", "runs"))).rejects.toMatchObject({ code: "ENOENT" });
		expectPolicy(promptText(first));
	});

	it("keeps the policy on a second ordinary request without duplicating it", async () => {
		pi = await start();
		const first = await request(pi);
		const second = await request(pi, "Explain which part I should inspect next.");
		for (const captured of [first, second]) {
			const text = promptText(captured);
			expectPolicy(text);
			expect(text.match(/For substantial tasks with separable work/g)).toHaveLength(1);
		}
		expect(pi.model.requests).toHaveLength(2);
	});

	it("omits policy when another extension deactivates omps without reactivating it", async () => {
		pi = await start(
			[],
			`export default function(pi) {
			pi.on("session_start", () => pi.setActiveTools(pi.getActiveTools().filter(name => name !== "omps")));
		}`,
		);
		const first = await request(pi);
		expect(first.tools?.map((tool) => tool.function.name)).not.toContain("omps");
		expect(promptText(first)).not.toMatch(
			/fresh omps list|For substantial tasks with separable work|Await the separately delivered result/,
		);
	});

	it("respects a CLI replacement system prompt", async () => {
		pi = await start(["--system-prompt", "REPLACEMENT-PROMPT-MARKER"]);
		const first = await request(pi);
		expect(first.tools?.map((tool) => tool.function.name)).toContain("omps");
		const text = promptText(first);
		expect(text).toContain("REPLACEMENT-PROMPT-MARKER");
		expect(text).not.toMatch(
			/fresh omps list|For substantial tasks with separable work|Await the separately delivered result/,
		);
	});

	it("respects an extension's replacement system prompt", async () => {
		pi = await start(
			[],
			`export default function(pi) {
			pi.on("before_agent_start", () => ({ systemPrompt: "EXTENSION-REPLACEMENT-MARKER" }));
		}`,
		);
		const first = await request(pi);
		expect(first.tools?.map((tool) => tool.function.name)).toContain("omps");
		expect(promptText(first)).toBe("EXTENSION-REPLACEMENT-MARKER");
	});

	it("distinguishes pinned-host hidden declarations from inactive tools", async () => {
		const version = execFileSync(PI_BIN, ["--version"], { encoding: "utf8" }).trim();
		pi = await start(
			[],
			`export default function(pi) {
			pi.registerTool({ name: "fixture_hider", label: "Fixture hider", description: "Fixture loadout control",
				parameters: { type: "object", properties: {} },
				prepareLoadout: () => ({ hiddenDeclarations: ["omps"] }),
				execute: async () => ({ content: [], details: undefined }) });
		}`,
		);
		const first = await request(pi);
		expect(first.tools?.map((tool) => tool.function.name)).not.toContain("omps");
		// Pi 0.99.1 hides the declaration but retains active-tool rules. Pi 1.1.0 omits both.
		if (version === "0.99.1") expectPolicy(promptText(first));
		else {
			expect(version).toBe("1.1.0");
			expect(promptText(first)).not.toContain("For substantial tasks with separable work");
		}
	});

	it("starts no run or model request during RPC startup", async () => {
		pi = await start();
		const commands = await pi.send({ type: "get_commands" });
		expect(commands.success).toBe(true);
		expect(commands.data.commands.some((command: { name: string }) => command.name === "omps")).toBe(true);
		const state = await pi.send({ type: "get_state" });
		expect(state.success).toBe(true);
		expect(state.data.isStreaming).toBe(false);
		expect(pi.model.requests).toEqual([]);
		expect(
			pi.records.filter((record) => record.type.startsWith("tool_execution_") || record.type === "agent_start"),
		).toEqual([]);
		await expect(access(join(pi.agentDir, "omps", "runs"))).rejects.toMatchObject({ code: "ENOENT" });
	});
});
