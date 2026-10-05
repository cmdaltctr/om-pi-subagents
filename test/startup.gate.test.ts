// The readiness sequence with a scripted channel. It reaches the parent checks that a real child cannot provoke.
import { describe, expect, it } from "vitest";
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../protocol.ts";
import type { LaunchInput } from "../runner.ts";
import type { RpcChannel, RpcRecord } from "../rpc.ts";
import { runGate, StartupError } from "../startup.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";

const GUARD = "/ext/child-guard.ts";
const input = { guardPath: GUARD, runToken: "tok", cwd: "/tmp", lineage: fixtureLineage() } as LaunchInput;
const fail = (message: string) => new StartupError(message);

const guardCommand = { name: PREFLIGHT_COMMAND, source: "extension", sourceInfo: { path: GUARD } };
const readyEntry = {
	type: "entry_appended",
	entry: {
		customType: READY_ENTRY,
		data: { token: "tok", ok: true, problems: [], tools: [], cwd: "/tmp", lineage: fixtureLineage() },
	},
};

/** A channel that answers get_commands and prompt from `script`, and serves `records` to waitFor. */
function scripted(script: { commands: unknown[]; prompt: RpcRecord }, records: RpcRecord[] = [readyEntry]): RpcChannel {
	return {
		records,
		request: async (command: RpcRecord) =>
			command.type === "get_commands" ? { success: true, data: { commands: script.commands } } : script.prompt,
		waitFor: async (predicate: (record: RpcRecord) => boolean) => records.find(predicate)!,
	} as unknown as RpcChannel;
}

const handled = { success: true, data: { disposition: "handled" } };

describe("runGate", () => {
	it("accepts a loaded guard, a handled preflight and a valid readiness entry", async () => {
		const readiness = await runGate(input, scripted({ commands: [guardCommand], prompt: handled }), 1000, fail);
		expect(readiness.ok).toBe(true);
	});

	it.each([
		["absent", []],
		["from another path", [{ ...guardCommand, sourceInfo: { path: "/other/guard.ts" } }]],
		["not an extension command", [{ ...guardCommand, source: "prompt" }]],
	])("rejects a guard command that is %s", async (_label, commands) => {
		await expect(runGate(input, scripted({ commands, prompt: handled }), 1000, fail)).rejects.toThrow(
			/child guard is not loaded/,
		);
	});

	it("rejects a preflight that Pi treated as a model prompt", async () => {
		const started = { success: true, data: { disposition: "started" } };
		await expect(runGate(input, scripted({ commands: [guardCommand], prompt: started }), 1000, fail)).rejects.toThrow(
			/preflight was not handled: disposition started/,
		);
	});

	it("rejects a failed preflight response and reports its error", async () => {
		const failed = { success: false, error: "boom" };
		await expect(runGate(input, scripted({ commands: [guardCommand], prompt: failed }), 1000, fail)).rejects.toThrow(
			/preflight was not handled: boom/,
		);
	});

	it("rejects an extension error seen during start-up", async () => {
		const records = [readyEntry, { type: "extension_error", error: "bad handler" }];
		await expect(
			runGate(input, scripted({ commands: [guardCommand], prompt: handled }, records), 1000, fail),
		).rejects.toThrow(/extension error during start-up: bad handler/);
	});
});
