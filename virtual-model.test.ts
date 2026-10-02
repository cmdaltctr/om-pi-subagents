// A model that exists only because a provider extension registers it: ready with the extension, failed at readiness without it.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./test/fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import type { AgentSnapshot } from "./config.ts";
import { stopGroup } from "./runner.ts";
import { launchChild, StartupError, type ReadyChild } from "./startup.ts";
import { createWorkspace, PI_BIN, type Workspace } from "./test/fixtures/pi-rpc.ts";

const GUARD = new URL("./child-guard.ts", import.meta.url).pathname;
const PROVIDER = new URL("./test/fixtures/fake-provider-extension.ts", import.meta.url).pathname;

let workspace: Workspace | undefined;
let ready: ReadyChild | undefined;
afterEach(async () => {
	if (ready) await stopGroup(ready.child, ready.channel.exited, 1000, ready.owned);
	await workspace?.dispose();
	workspace = ready = undefined;
});

async function attempt(extensions: string[]): Promise<ReadyChild | StartupError> {
	workspace = await createWorkspace();
	await writeFile(join(workspace.root, "persona.md"), "Persona.");
	const snapshot: AgentSnapshot = {
		name: "builder",
		personaPath: "unused",
		persona: "Persona.",
		tools: ["read"],
		model: "virt/m",
		thinking: "off",
		skills: [],
		extensions,
	};
	const outcome = await launchChild({
		snapshot,
		cwd: workspace.cwd,
		personaFile: join(workspace.root, "persona.md"),
		guardPath: GUARD,
		runToken: "run-token",
		piBin: PI_BIN,
		startupDeadlineMs: 15_000,
		env: { ...process.env, ...workspace.isolationEnv, FAKE_MODEL_URL: workspace.model.baseUrl },
	}).catch((error: unknown) => error);
	if (outcome instanceof StartupError) return outcome;
	if (outcome instanceof Error) throw outcome;
	return (ready = outcome as ReadyChild);
}

describe("a model supplied by a provider extension", () => {
	it("is ready when the extension is listed, and reports the model", async () => {
		const result = await attempt([PROVIDER]);
		expect(result).not.toBeInstanceOf(StartupError);
		expect((result as ReadyChild).readiness).toMatchObject({ ok: true, model: "virt/m" });
		expect(workspace!.model.requests).toHaveLength(0);
	});

	it("fails at readiness when the extension is missing, and sends no task to any model", async () => {
		const result = await attempt([]);
		expect(result).toBeInstanceOf(StartupError);
		expect((result as StartupError).message).toMatch(/exited before it was ready|not ready|virt\/m/);
		expect(workspace!.model.requests).toHaveLength(0);
	});

	it("fails at readiness when the extension path is wrong", async () => {
		const result = await attempt(["/nonexistent/provider.ts"]);
		expect(result).toBeInstanceOf(StartupError);
		expect(workspace!.model.requests).toHaveLength(0);
	});
});
