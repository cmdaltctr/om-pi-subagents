// A real parent Pi with the OMPS extension loaded. One fake model plays the parent and the child;
// the persona marker tells the two apart.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import type { Turn } from "./fixtures/fake-model.ts";
import { PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";

const INDEX = new URL("../src/index.ts", import.meta.url).pathname;

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
	slowTool?: boolean;
}

/** Start a parent whose model launches a child with the omps tool, then acknowledges the result. */
async function startParent(timing: Timing = {}): Promise<PiFixture> {
	extensionDir = await mkdtemp(join(tmpdir(), "omps-parent-ext-"));
	await mkdir(join(extensionDir, "personas"));
	await writeFile(join(extensionDir, "personas/reader.md"), "CHILD-PERSONA: you read.");
	await writeFile(
		join(extensionDir, "om-pi-subagents.yaml"),
		`version: 1\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [${timing.slowTool ? "bash" : "read"}]\n    thinking: off\n`,
	);

	pi = await startPi({
		args: ["-e", INDEX],
		env: { OMPS_REGISTRY: join(extensionDir, "om-pi-subagents.yaml"), OMPS_PI_BIN: PI_BIN },
	});
	pi.model.script = (body): Turn => {
		const text = JSON.stringify(body);
		if (text.includes("CHILD-PERSONA")) {
			if (timing.slowTool && !text.includes('"role":"tool"'))
				return { tool: "bash", args: { command: "sleep 2; printf 'PRIVATE TOOL RESULT'" } };
			return { text: "CHILD ANSWER", delayMs: timing.childDelayMs };
		}
		if (text.includes("OMPS run")) return { text: "acknowledged" };
		if (text.includes('"role":"tool"')) return { text: "launched", delayMs: timing.parentAckDelayMs };
		return { tool: "omps", args: { action: "run", agent: "reader", task: "look around" } };
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
		expect(wake.match(/OMPS run [0-9a-f-]{36}/g)).toHaveLength(1);
		expect(wake).toMatch(/completed/);
	});

	it("shows the run in the status line while it lives, and clears it afterwards", async () => {
		const fixture = await startParent({ childDelayMs: 1500 });
		await fixture.send({ type: "prompt", message: "start" });
		await waitFor(() => settles(fixture) === 2);
		const statuses = fixture.records.filter(
			(record) =>
				record.type === "extension_ui_request" && record.method === "setStatus" && record.statusKey === "omps",
		);
		expect(statuses.map((record) => record.statusText)).toEqual(
			expect.arrayContaining(["omps: reader starting", "omps: reader running"]),
		);
		expect(statuses.at(-1)!.statusText).toBeUndefined();
	});
});

describe("live fleet strip on real Pi", () => {
	it("reports the run below the editor and never exposes tool bodies", async () => {
		const fixture = await startParent({ slowTool: true });
		await fixture.send({ type: "prompt", message: "start" });
		const active = await fixture.waitFor(
			(record) =>
				record.type === "extension_ui_request" &&
				record.method === "setWidget" &&
				record.widgetKey === "omps" &&
				/Agents: 1 active \| 0 observed descendants/.test(record.widgetLines?.join("\n") ?? ""),
		);
		expect(active.widgetPlacement).toBe("belowEditor");
		await waitFor(() => settles(fixture) === 2);
		const widgets = fixture.records.filter(
			(record) =>
				record.type === "extension_ui_request" && record.method === "setWidget" && record.widgetKey === "omps",
		);
		// The strip keeps one compact idle summary; previews belong to inspection, not the strip.
		expect(widgets.at(-1)!.widgetLines).toEqual(["Agents: idle | last reader completed | alt+o list | alt+i inspect"]);
		for (const record of widgets) {
			expect(record.widgetLines.join("\n")).not.toMatch(/PRIVATE TOOL RESULT|sleep 2|printf|Tools:/);
		}
		expect(JSON.stringify(fixture.model.requests.filter(isParent))).toContain("CHILD ANSWER");
	});
});
