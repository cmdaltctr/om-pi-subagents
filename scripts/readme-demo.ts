// Launch a real interactive Pi with this checkout's OMPS for the README recording (scripts/readme-demo.tape).
// Everything lives in a disposable home: a local fake model, synthetic agents and no real settings or
// credentials. The children are real Pi processes; their "work" is scripted tool calls and delays.
import { spawn } from "node:child_process";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { startFakeModel, type Turn } from "../test/fixtures/fake-model.ts";

const repo = resolve(import.meta.dirname, "..");
const pi = process.env.OMPS_PI_BIN ?? join(homedir(), ".pi", "agent", "bin", "pi");
// A fixed, neutral root keeps machine-specific temporary paths out of the recording.
const root = "/tmp/omps-demo";
await rm(root, { recursive: true, force: true });
await mkdir(root);
// The real path lets Pi shorten the working directory to ~ in its footer.
const home = join(await realpath(root), "home");
const agentDir = join(home, ".pi", "agent");
const cwd = join(home, "demo-project");
await mkdir(join(agentDir, "om-pi-subagents", "personas"), { recursive: true });
await mkdir(join(cwd, "src"), { recursive: true });
await mkdir(join(home, ".config"), { recursive: true });
for (const name of ["api.ts", "routes.ts", "README.md"]) await writeFile(join(cwd, "src", name), `// ${name}\n`);

// Each agent has a fixed plan: tool calls in order, then a final answer after a pause.
const plans: Record<string, { steps: Turn[]; answerAfterMs: number }> = {
	reviewer: {
		steps: [
			{ tool: "grep", args: { pattern: "export", path: "src" } },
			{ tool: "bash", args: { command: "sleep 3" } },
			{ tool: "read", args: { path: "src/api.ts" } },
		],
		answerAfterMs: 5000,
	},
	planner: { steps: [{ tool: "bash", args: { command: "sleep 4" } }], answerAfterMs: 4000 },
	explorer: {
		steps: [
			{ tool: "find", args: { pattern: "*.ts", path: "src" } },
			{ tool: "bash", args: { command: "sleep 2" } },
		],
		answerAfterMs: 2500,
	},
	writer: {
		steps: [
			{ tool: "read", args: { path: "src/README.md" } },
			{ tool: "bash", args: { command: "sleep 5" } },
			{ tool: "grep", args: { pattern: "TODO", path: "src" } },
		],
		answerAfterMs: 6000,
	},
};

const tasks: Record<string, string> = {
	reviewer: "Map the public API",
	planner: "Draft the rollout plan",
	explorer: "List TypeScript files",
	writer: "Update the README",
};

const model = await startFakeModel();
model.script = (body): Turn => {
	const text = JSON.stringify(body);
	const agent = Object.keys(plans).find((name) => text.includes(`You are the ${name} demo agent.`));
	if (!agent) {
		// The parent starts the four agents through the omps tool, one call per turn, then waits.
		const started = (body.messages as { role: string }[]).filter((message) => message.role === "tool").length;
		const next = Object.entries(tasks)[started];
		if (next) return { tool: "omps", args: { action: "run", agent: next[0], task: next[1] } };
		// A delivered result starts a parent turn; acknowledge it briefly.
		const last = JSON.stringify((body.messages as unknown[]).at(-1));
		return { text: last.includes("OMPS run") ? "Noted." : "Four agents are running in the background." };
	}
	const done = (body.messages as { role: string }[]).filter((message) => message.role === "tool").length;
	const plan = plans[agent];
	return plan.steps[done] ?? { text: `${agent} finished its synthetic task.`, delayMs: plan.answerAfterMs };
};

await writeFile(
	join(agentDir, "models.json"),
	JSON.stringify({
		providers: {
			demo: { baseUrl: model.baseUrl, api: "openai-completions", apiKey: "demo-key", models: [{ id: "demo-model" }] },
		},
	}),
);
await writeFile(
	join(agentDir, "settings.json"),
	JSON.stringify({ theme: "dark", quietStartup: true, defaultProvider: "demo", defaultModel: "demo-model" }),
);
const tools = "[read, grep, find, ls, bash]";
await writeFile(
	join(agentDir, "om-pi-subagents.yaml"),
	[
		"version: 1",
		"agents:",
		...Object.keys(plans).flatMap((name) => [
			`  ${name}:`,
			`    persona: ./om-pi-subagents/personas/${name}.md`,
			`    tools: ${tools}`,
			"    thinking: off",
		]),
		"limits:",
		"  maxConcurrentRuns: 4",
		"  maxDepth: 1",
		"",
	].join("\n"),
);
for (const name of Object.keys(plans))
	await writeFile(join(agentDir, "om-pi-subagents", "personas", `${name}.md`), `You are the ${name} demo agent.\n`);

const child = spawn(
	pi,
	["--extension", join(repo, "src", "index.ts"), "--provider", "demo", "--model", "demo-model", "--no-skills"],
	{
		cwd,
		stdio: "inherit",
		shell: false,
		env: {
			...process.env,
			HOME: home,
			XDG_CONFIG_HOME: join(home, ".config"),
			PI_CODING_AGENT_DIR: agentDir,
			PI_OFFLINE: "1",
			PI_SKIP_VERSION_CHECK: "1",
			OMPS_PI_BIN: pi,
		},
	},
);
const code = await new Promise<number>((done) => child.on("exit", (status) => done(status ?? 0)));
await model.close();
await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
process.exit(code);
