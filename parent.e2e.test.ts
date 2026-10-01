// A real parent Pi with the OMPSS extension loaded. One fake model plays the parent and the child;
// the persona marker tells the two apart.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./test/fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import type { Turn } from "./test/fixtures/fake-model.ts";
import { PI_BIN, startPi, type PiFixture } from "./test/fixtures/pi-rpc.ts";

const INDEX = new URL("./index.ts", import.meta.url).pathname;

let pi: PiFixture | undefined;
let extensionDir: string | undefined;
afterEach(async () => {
	await pi?.dispose();
	if (extensionDir) await rm(extensionDir, { recursive: true, force: true });
	pi = extensionDir = undefined;
});

interface Timing {
	childDelayMs?: number;
	parentAckDelayMs?: number;
}

/** Start a parent whose model launches a child with the ompss tool, then acknowledges the result. */
async function startParent(timing: Timing = {}): Promise<PiFixture> {
	extensionDir = await mkdtemp(join(tmpdir(), "ompss-parent-ext-"));
	await mkdir(join(extensionDir, "personas"));
	await writeFile(join(extensionDir, "personas/reader.md"), "CHILD-PERSONA: you read.");
	await writeFile(
		join(extensionDir, "om-pi-subagents.yaml"),
		"version: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [read]\n",
	);

	pi = await startPi({
		args: ["-e", INDEX],
		env: { OMPSS_REGISTRY: join(extensionDir, "om-pi-subagents.yaml"), OMPSS_PI_BIN: PI_BIN },
	});
	pi.model.script = (body): Turn => {
		const text = JSON.stringify(body);
		if (text.includes("CHILD-PERSONA")) return { text: "CHILD ANSWER", delayMs: timing.childDelayMs };
		if (text.includes("OMPSS run")) return { text: "acknowledged" };
		if (text.includes('"role":"tool"')) return { text: "launched", delayMs: timing.parentAckDelayMs };
		return { tool: "ompss", args: { action: "run", agent: "reader", task: "look around" } };
	};
	return pi;
}

const isParent = (request: unknown) => !JSON.stringify(request).includes("CHILD-PERSONA");
const settles = (fixture: PiFixture) => fixture.records.filter((record) => record.type === "agent_settled").length;
const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 30_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

describe("idle parent", () => {
	it("is woken by the child's result, which arrives once as a follow-up message", async () => {
		const fixture = await startParent({ childDelayMs: 1500 });
		await fixture.send({ type: "prompt", message: "start" });
		await waitFor(() => settles(fixture) === 1); // the parent has answered "launched" and is idle
		await waitFor(() => settles(fixture) === 2); // the result woke it again

		const parentRequests = fixture.model.requests.filter(isParent);
		expect(parentRequests).toHaveLength(3);
		const wake = JSON.stringify(parentRequests[2]);
		expect(wake).toContain("CHILD ANSWER");
		expect(wake.match(/OMPSS run [0-9a-f-]{36}/g)).toHaveLength(1);
		expect(wake).toMatch(/completed/);
	});

	it("shows the run in the status line while it lives, and clears it afterwards", async () => {
		const fixture = await startParent({ childDelayMs: 1500 });
		await fixture.send({ type: "prompt", message: "start" });
		await waitFor(() => settles(fixture) === 2);
		const statuses = fixture.records.filter(
			(record) =>
				record.type === "extension_ui_request" && record.method === "setStatus" && record.statusKey === "ompss",
		);
		expect(statuses.map((record) => record.statusText)).toEqual(
			expect.arrayContaining(["ompss: reader starting", "ompss: reader running"]),
		);
		expect(statuses.at(-1)!.statusText).toBeUndefined();
	});
});

describe("busy parent", () => {
	it("queues the result until its current turn is over, and interrupts nothing", async () => {
		const fixture = await startParent({ parentAckDelayMs: 3000 }); // the child finishes while the parent is still answering
		await fixture.send({ type: "prompt", message: "start" });
		await waitFor(() => fixture.model.requests.filter(isParent).length === 3);
		// A queued follow-up continues the same agent run, so the parent settles once, after the result turn.
		await waitFor(() => settles(fixture) >= 1);
		await new Promise((done) => setTimeout(done, 1500));

		const parentRequests = fixture.model.requests.filter(isParent);
		expect(parentRequests).toHaveLength(3);
		expect(JSON.stringify(parentRequests[1])).not.toContain("OMPSS run"); // not injected into the turn in progress
		expect(JSON.stringify(parentRequests[2])).toContain("CHILD ANSWER");
		expect(JSON.stringify(parentRequests[2]).match(/OMPSS run [0-9a-f-]{36}/g)).toHaveLength(1);
	});
});

describe("delivery record", () => {
	it("keeps the notification result apart from the run's status", async () => {
		const fixture = await startParent({ childDelayMs: 500 });
		await fixture.send({ type: "prompt", message: "start" });
		await waitFor(() => settles(fixture) === 2);

		const runs = join(fixture.agentDir, "ompss", "runs");
		const [session] = await readdir(runs);
		const [run] = await readdir(join(runs, session));
		const directory = join(runs, session, run);
		await waitFor(async () => (await readdir(directory)).includes("notification.json"));
		expect(JSON.parse(await readFile(join(directory, "notification.json"), "utf8"))).toEqual({ delivered: true });
		expect(JSON.parse(await readFile(join(directory, "status.json"), "utf8"))).toMatchObject({ state: "completed" });
	});
});
