// What happens to a running child when its parent's session ends: replaced by a new session, or quit.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { groupAlive } from "../runner.ts";
import type { Turn } from "./fixtures/fake-model.ts";
import { PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";

const INDEX = new URL("../index.ts", import.meta.url).pathname;

let pi: PiFixture | undefined;
let extensionDir: string | undefined;
let childPid: number | undefined;
afterEach(async () => {
	if (childPid && groupAlive(childPid)) process.kill(-childPid, "SIGKILL");
	await pi?.dispose();
	if (extensionDir) await rm(extensionDir, { recursive: true, force: true });
	pi = extensionDir = childPid = undefined;
});

const isChild = (request: unknown) => JSON.stringify(request).includes("CHILD-PERSONA");
const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 30_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

/** A parent that launches a child whose model never answers, so the child is still running. */
async function startBusyChild(): Promise<{
	fixture: PiFixture;
	statusFile: () => Promise<any>;
	runDirectory: () => Promise<string>;
}> {
	extensionDir = await mkdtemp(join(tmpdir(), "ompss-life-"));
	await mkdir(join(extensionDir, "personas"));
	await writeFile(join(extensionDir, "personas/reader.md"), "CHILD-PERSONA: you read.");
	await writeFile(
		join(extensionDir, "om-pi-subagents.yaml"),
		"version: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n",
	);
	const fixture = await startPi({
		args: ["-e", INDEX],
		env: { OMPSS_REGISTRY: join(extensionDir, "om-pi-subagents.yaml"), OMPSS_PI_BIN: PI_BIN },
	});
	pi = fixture;
	fixture.model.script = (body): Turn => {
		const text = JSON.stringify(body);
		if (text.includes("CHILD-PERSONA")) return { hang: true };
		if (text.includes("OMPSS run")) return { text: "acknowledged" };
		if (text.includes('"role":"tool"')) return { text: "launched" };
		return { tool: "ompss", args: { action: "run", agent: "reader", task: "look around" } };
	};

	const runDirectory = async () => {
		const root = join(fixture.agentDir, "ompss", "runs");
		const [session] = await readdir(root).catch(() => []);
		const [run] = session ? await readdir(join(root, session)) : [];
		return join(root, session, run);
	};
	const statusFile = async () => JSON.parse(await readFile(join(await runDirectory(), "status.json"), "utf8"));

	await fixture.send({ type: "prompt", message: "start" });
	await waitFor(async () => (await statusFile().catch(() => ({}))).state === "running");
	await waitFor(() => fixture.model.requests.some(isChild));
	childPid = (await statusFile()).pid;
	expect(groupAlive(childPid!)).toBe(true);
	return { fixture, statusFile, runDirectory };
}

describe("session replacement", () => {
	it("stops the running child before the new session starts, and sends nothing into it", async () => {
		const { fixture, statusFile } = await startBusyChild();
		const before = fixture.model.requests.length;

		const response = await fixture.send({ type: "new_session" });
		expect(response.success).toBe(true);

		expect(groupAlive(childPid!)).toBe(false); // gone by the time the replacement is up
		await waitFor(async () => (await statusFile()).state === "cancelled");

		await new Promise((done) => setTimeout(done, 1500));
		const later = fixture.model.requests.slice(before);
		expect(later.some((request) => JSON.stringify(request).includes("OMPSS run"))).toBe(false);
	});

	it("still offers the tool in the new session, with a fresh run table", async () => {
		const { fixture } = await startBusyChild();
		await fixture.send({ type: "new_session" });
		fixture.model.script = (): Turn => ({ tool: "ompss", args: { action: "status" } });
		const before = fixture.model.requests.length;
		await fixture.send({ type: "prompt", message: "status?" });
		await waitFor(() => fixture.model.requests.length > before + 1);
		expect(JSON.stringify(fixture.model.requests.at(-1))).toContain("No runs in this session.");
	});
});

describe("quit", () => {
	it("stops the running child and records the run as cancelled before the parent exits", async () => {
		const { fixture, runDirectory } = await startBusyChild();
		const directory = await runDirectory();

		await fixture.exit(); // closes the parent's input: an orderly quit
		expect(groupAlive(childPid!)).toBe(false);
		expect(JSON.parse(await readFile(join(directory, "status.json"), "utf8"))).toMatchObject({ state: "cancelled" });
	});
});

describe("the launch call", () => {
	it("does not end the run when the call that started it finishes", async () => {
		const { fixture, statusFile } = await startBusyChild();
		// The tool call returned long ago and the parent is idle, yet the child lives on.
		await waitFor(() => fixture.records.some((record) => record.type === "agent_settled"));
		await new Promise((done) => setTimeout(done, 1000));
		expect((await statusFile()).state).toBe("running");
		expect(groupAlive(childPid!)).toBe(true);
	});
});
