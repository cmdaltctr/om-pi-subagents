import { spawn } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorkspace, PI_AVAILABLE, PI_BIN, type Workspace } from "./fixtures/pi-rpc.ts";
import { writeFixturePersona, writeFixtureRegistry } from "./fixtures/registry.ts";
import type { Turn } from "./fixtures/fake-model.ts";

const modules = resolve(process.env.PI_HOST_MODULES ?? ".pi-host/node_modules");
const available = PI_AVAILABLE && existsSync(join(modules, "@earendil-works/pi-coding-agent/dist/index.js"));
const fixture = new URL("./fixtures/result-message-host.mjs", import.meta.url).pathname;
const answer = (name: string): string =>
	Array.from({ length: 20 }, (_, index) => `${name} result line ${String(index + 1).padStart(2, "0")}`).join("\n");
const isChild = (body: unknown): boolean => JSON.stringify(body).includes("RESULT-MESSAGE-CHILD");

interface HostResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

interface HostReport {
	verified: boolean;
	shutdownClearedHook: boolean;
	turnsBeforeKeys: number;
	turnsAfterKeys: number;
	messages: Array<{ content: string; details: { runId: string; directory: string } }>;
}

/** Run native Pi asynchronously so the local fake provider can serve parent and child requests. */
async function runHost(workspace: Workspace, scenario: string, source: string): Promise<HostResult> {
	const config = join(workspace.root, "host-tsconfig.json");
	await writeFile(
		config,
		JSON.stringify({
			compilerOptions: {
				baseUrl: workspace.root,
				paths: {
					yaml: [resolve("node_modules/yaml/dist/index.js")],
					"@earendil-works/pi-tui": [join(modules, "@earendil-works/pi-tui/dist/index.js")],
					"@earendil-works/pi-coding-agent": [join(modules, "@earendil-works/pi-coding-agent/dist/index.js")],
				},
			},
		}),
	);
	return new Promise((done, reject) => {
		const child = spawn("bun", ["--tsconfig-override", config, fixture, modules, scenario, source], {
			cwd: workspace.cwd,
			shell: false,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...Object.fromEntries(
					Object.entries(process.env).filter(([key]) => !key.startsWith("OMPS") && key !== "PI_SESSION_ID"),
				),
				...workspace.isolationEnv,
				OMPS_REGISTRY: join(workspace.agentDir, "omps/config.yaml"),
				OMPS_PI_BIN: PI_BIN,
				FAKE_MODEL_URL: workspace.model.baseUrl,
				// Keep host telemetry and checks away from external services.
				PI_TELEMETRY: "off",
			},
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => child.kill("SIGKILL"), 55_000);
		child.stdout.on("data", (data: Buffer) => (stdout += data.toString("utf8")));
		child.stderr.on("data", (data: Buffer) => (stderr += data.toString("utf8")));
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (status) => {
			clearTimeout(timer);
			done({ status, stdout, stderr });
		});
	});
}

async function prepare(scenario: string): Promise<Workspace> {
	const workspace = await createWorkspace({ mcp: false });
	await writeFixturePersona(workspace.agentDir, "reader.md", "RESULT-MESSAGE-CHILD: return the requested answer.");
	const setting = { remapped: "alt+r", off: "off", conflict: "ctrl+o" }[scenario as "remapped" | "off" | "conflict"];
	await writeFixtureRegistry(
		workspace.agentDir,
		`version: 1\n${setting ? `ui: { resultKey: ${setting} }\n` : ""}agents:\n  reader:\n    persona: ./personas/reader.md\n    tools: []\n    thinking: off\n    extensions: [${JSON.stringify(new URL("./fixtures/fake-provider-extension.ts", import.meta.url).pathname)}]\n`,
	);
	await writeFile(
		join(workspace.agentDir, "settings.json"),
		JSON.stringify({ quietStartup: true, theme: "dark", compaction: { enabled: false }, retry: { enabled: false } }),
	);
	if (scenario === "remapped")
		await writeFile(join(workspace.agentDir, "keybindings.json"), JSON.stringify({ "app.tools.expand": "ctrl+y" }));
	workspace.model.script = (body): Turn => {
		const text = JSON.stringify(body);
		if (isChild(body)) {
			const name = text.includes("result-three") ? "THREE" : text.includes("result-two") ? "TWO" : "ONE";
			return { text: answer(name) };
		}
		if (text.includes('"role":"tool"') || text.includes("OMPS run")) return { text: "Parent acknowledged." };
		return { tool: "result_fixture_tool", args: {} };
	};
	return workspace;
}

function report(result: HostResult): HostReport {
	expect(result.status, `${result.stderr}\n${result.stdout}`).toBe(0);
	const line = result.stdout.split("\n").find((entry) => entry.startsWith("RESULT_MESSAGE_REPORT "));
	expect(line, result.stdout).toBeDefined();
	return JSON.parse(line!.slice("RESULT_MESSAGE_REPORT ".length));
}

/** Check the actual provider request and durable run files, rather than a renderer's input alone. */
async function verifyDelivery(workspace: Workspace, result: HostReport): Promise<void> {
	const parents = workspace.model.requests.filter((body) => !isChild(body)) as Array<{
		messages: Array<{ content: string | Array<{ text?: string }> }>;
	}>;
	for (const [index, message] of result.messages.entries()) {
		const expected = answer(["ONE", "TWO", "THREE"][index]);
		expect(message.content).toBe(
			`OMPS run ${message.details.runId} (reader) completed.\nFiles: ${message.details.directory}\nResult:\n${expected}`,
		);
		expect(
			parents.some((request) =>
				request.messages.some((entry) =>
					typeof entry.content === "string"
						? entry.content.includes(message.content)
						: entry.content?.some((block) => block.text?.includes(message.content)),
				),
			),
			"the full delivered text must reach the real provider",
		).toBe(true);
		expect(await readFile(join(message.details.directory, "output.md"), "utf8")).toBe(expected);
		expect(JSON.parse(await readFile(join(message.details.directory, "notification.json"), "utf8"))).toEqual({
			delivered: true,
		});
		expect(JSON.parse(await readFile(join(message.details.directory, "status.json"), "utf8"))).toMatchObject({
			state: "completed",
		});
	}
}

describe.skipIf(!available)("result messages through real Pi rendering and dispatch", () => {
	for (const scenario of ["host", "kitty", "fullscreen", "nonkitty", "remapped", "off", "conflict", "historical"])
		it(`${scenario}: folds retained results, honours native input and preserves delivery`, async () => {
			const workspace = await prepare(scenario);
			try {
				const result = report(await runHost(workspace, scenario, resolve("src/index.ts")));
				expect(result.verified).toBe(true);
				expect(result.shutdownClearedHook).toBe(true);
				expect(result.turnsAfterKeys).toBe(result.turnsBeforeKeys);
				if (scenario === "historical") expect(workspace.model.requests).toHaveLength(0);
				else {
					await verifyDelivery(workspace, result);
					expect(workspace.model.requests.filter(isChild)).toHaveLength(result.messages.length);
					// One unrelated tool turn (two requests), then exactly one acknowledgement per delivered result.
					expect(workspace.model.requests.filter((body) => !isChild(body))).toHaveLength(2 + result.messages.length);
				}
			} finally {
				await workspace.dispose();
			}
		}, 65_000);

	const mutations = [
		{
			name: "fold",
			file: "result-render.ts",
			before: "RESULT_LINE_LIMIT = 8",
			after: "RESULT_LINE_LIMIT = 8000",
			scenario: "host",
			failure: "fold must hide ONE result line 20 in Pi's painted frame",
		},
		{
			name: "result shortcut",
			file: "result-message.ts",
			before: "this.expanded = !this.expanded;",
			after: "/* Disposable mutation: leave the OMPS state unchanged. */",
			scenario: "historical",
			failure: "native repaint must expand retained ONE",
		},
		{
			name: "shortcut registration",
			file: "shortcuts.ts",
			before: 'bind("resultKey", "Toggle OMPS result messages", actions.toggleResults);',
			after: "/* Disposable mutation: omit the result shortcut registration. */",
			scenario: "historical",
			failure: "real Pi must register ui.resultKey ctrl+shift+e",
		},
		{
			name: "shutdown cleanup",
			file: "index.ts",
			before: "results.dispose(ctx);",
			after: "/* Disposable mutation: leave the result hook attached. */",
			scenario: "historical",
			failure: "session_shutdown must detach the result redraw hook before host reset",
		},
	];
	for (const mutation of mutations)
		it(`mutation: removing ${mutation.name} fails through real Pi`, async () => {
			const workspace = await prepare(mutation.scenario);
			try {
				const source = join(workspace.root, "mutant-src");
				await cp(resolve("src"), source, { recursive: true });
				const file = join(source, mutation.file);
				const original = await readFile(file, "utf8");
				expect(original.split(mutation.before)).toHaveLength(2);
				await writeFile(file, original.replace(mutation.before, mutation.after));
				const result = await runHost(workspace, mutation.scenario, join(source, "index.ts"));
				expect(result.status).not.toBe(0);
				expect(result.stderr).toContain("AssertionError");
				expect(result.stderr).toContain(mutation.failure);
			} finally {
				await workspace.dispose();
			}
		}, 65_000);
});
