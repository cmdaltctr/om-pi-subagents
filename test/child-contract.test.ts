// Contract tests against the real Pi 0.99.1 CLI in RPC mode. No live model and no real
// credentials: the model is a local counting server and the MCP server is a local fixture.
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../src/protocol.ts";
import { startPi, type PiFixture } from "./fixtures/pi-rpc.ts";

const GUARD = new URL("../src/child-guard.ts", import.meta.url).pathname;
const guardArgs = ["-e", "builtin:mcp", "-e", "builtin:tool-search", "-e", GUARD];

let pi: PiFixture | undefined;
afterEach(async () => {
	await pi?.dispose();
	pi = undefined;
});

const readyEntries = (fixture: PiFixture) =>
	fixture.records.filter((record) => record.type === "entry_appended" && record.entry?.customType === READY_ENTRY);

describe("preflight command", () => {
	it("is listed by get_commands before any prompt is sent", async () => {
		pi = await startPi({ args: guardArgs });
		const { data } = await pi.send({ type: "get_commands" });
		const command = data.commands.find((entry: { name: string }) => entry.name === PREFLIGHT_COMMAND);
		expect(command).toMatchObject({ source: "extension" });
		expect(command.sourceInfo.path).toBe(GUARD);
		expect(pi.model.requests).toHaveLength(0);
	});

	it("returns disposition `handled`, appends a private readiness entry and sends no model request", async () => {
		pi = await startPi({ args: guardArgs, env: { OMPSS_RUN_TOKEN: "token-123" } });
		const response = await pi.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });

		expect(response).toMatchObject({ success: true, data: { disposition: "handled" } });
		const [appended] = readyEntries(pi);
		expect(appended.entry.data).toMatchObject({ token: "token-123", model: "fake/counter" });
		const { data } = await pi.send({ type: "get_entries" });
		expect(data.entries.some((entry: { customType?: string }) => entry.customType === READY_ENTRY)).toBe(true);
		expect(pi.model.requests).toHaveLength(0);
		expect(pi.records.some((record) => record.type === "agent_start")).toBe(false);
	});

	it("is required: an unknown slash command reaches the model", async () => {
		pi = await startPi({ args: guardArgs });
		const response = await pi.send({ type: "prompt", message: "/no-such-command hello" });
		await pi.waitFor((record) => record.type === "agent_settled");

		expect(response.data.disposition).toBe("started");
		expect(pi.model.requests).toHaveLength(1);
	});
});

describe("native MCP registration", () => {
	const preflightTools = async (fixture: PiFixture): Promise<string[]> => {
		const before = readyEntries(fixture).length;
		await fixture.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
		return readyEntries(fixture)[before].entry.data.tools;
	};

	it("registers approved tools as mcp__<server>__<tool> shortly after start-up", async () => {
		pi = await startPi({ args: [...guardArgs, "--tools", "read,mcp__fixture__lookup"] });
		const deadline = Date.now() + 20_000;
		let tools = await preflightTools(pi);
		while (!tools.includes("mcp__fixture__lookup") && Date.now() < deadline) {
			await new Promise((done) => setTimeout(done, 250));
			tools = await preflightTools(pi);
		}
		expect(tools).toEqual(["read", "mcp__fixture__lookup"]);
		expect(pi.model.requests).toHaveLength(0);
	});

	it("never registers the obsolete `mcp` proxy tool", async () => {
		pi = await startPi({ args: guardArgs });
		expect(await preflightTools(pi)).not.toContain("mcp");
	});
});
