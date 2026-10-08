import { writeFixtureRegistry } from "./fixtures/registry.ts";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "../src/config.ts";
import { PI_AVAILABLE, startPi } from "./fixtures/pi-rpc.ts";
import { editRpcSettings } from "./fixtures/settings.ts";

const index = new URL("../src/index.ts", import.meta.url).pathname;

describe.skipIf(!PI_AVAILABLE)("native RPC settings dialogs", () => {
	it("saves independent confirmed settings to YAML without any model turn", async () => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", index],
			seed: async ({ agentDir }) => {
				await writeFixtureRegistry(agentDir, "version: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\nagents: {}\n");
			},
		});
		try {
			expect((await editRpcSettings(fixture, 0, "0")).data.disposition).toBe("handled");
			expect((await editRpcSettings(fixture, 1, "2")).data.disposition).toBe("handled");
			expect((await editRpcSettings(fixture, 2, "2")).data.disposition).toBe("handled");
			const registry = join(fixture.agentDir, "omps/config.yaml");
			const saved = await loadRegistry(registry);
			expect(saved.limits).toEqual({ maxDepth: 0, maxConcurrentRuns: 2 });
			expect(saved.ui.maxVisibleAgents).toBe(2);
			// The legacy display JSON is a read-only input and is never created.
			const display = join(fixture.root, "config", "pi-subagents", "config.json");
			await expect(stat(display)).rejects.toMatchObject({ code: "ENOENT" });
			expect(fixture.model.requests).toHaveLength(0);
			expect(fixture.records.filter((record) => record.type === "tool_execution_start")).toEqual([]);
			expect(fixture.records.filter((record) => record.entry?.customType?.includes("todo"))).toEqual([]);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("saves view shortcuts through the alias command", async () => {
		const fixture = await startPi({ mcp: false, args: ["-e", index] });
		try {
			expect((await editRpcSettings(fixture, 4, "alt+p", true, "/subagents-settings")).data.disposition).toBe(
				"handled",
			);
			const saved = await loadRegistry(join(fixture.agentDir, "omps/config.yaml"));
			expect(saved.ui.toggleKey).toBe("alt+p");
			expect(fixture.model.requests).toHaveLength(0);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("confirms management visibility and navigation keys through native dialogs without model work", async () => {
		const fixture = await startPi({ mcp: false, args: ["-e", index] });
		try {
			const registry = join(fixture.agentDir, "omps/config.yaml");
			await editRpcSettings(fixture, 6, "Hide", false);
			await expect(stat(registry)).rejects.toMatchObject({ code: "ENOENT" });
			await editRpcSettings(fixture, 6, "Hide");
			await editRpcSettings(fixture, 7, "Control + 1");
			await editRpcSettings(fixture, 8, "off", true, "/subagents-settings");
			expect((await loadRegistry(registry)).ui).toMatchObject({
				fleetView: "expanded",
				showManagementList: false,
				navigationDownKey: "ctrl+1",
				navigationUpKey: "off",
			});
			await editRpcSettings(fixture, 6, "Show");
			expect((await loadRegistry(registry)).ui.showManagementList).toBe(true);
			expect(fixture.model.requests).toHaveLength(0);
			expect(fixture.records.filter((record) => record.type === "tool_execution_start")).toEqual([]);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});

	it("leaves missing files absent after declined confirmations", async () => {
		const fixture = await startPi({ mcp: false, args: ["-e", index] });
		try {
			await editRpcSettings(fixture, 0, "2", false);
			await editRpcSettings(fixture, 2, "8", false);
			await expect(stat(join(fixture.agentDir, "omps/config.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
			await expect(stat(join(fixture.root, "config", "pi-subagents", "config.json"))).rejects.toMatchObject({
				code: "ENOENT",
			});
			expect(fixture.model.requests).toHaveLength(0);
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
