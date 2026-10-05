import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRegistry } from "./config.ts";
import { PI_AVAILABLE, startPi } from "./test/fixtures/pi-rpc.ts";
import { editRpcSettings } from "./test/fixtures/settings.ts";

const index = new URL("./index.ts", import.meta.url).pathname;

describe.skipIf(!PI_AVAILABLE)("native RPC settings dialogs", () => {
	it("saves independent confirmed settings without any model turn", async () => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", index],
			seed: async ({ agentDir }) => {
				await writeFile(
					// nosemgrep: AIK_ts_generic_path_traversal -- agentDir is a disposable fixture directory, followed by a constant filename.
					join(agentDir, "om-pi-subagents.yaml"),
					"version: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\nagents: {}\n",
				);
			},
		});
		try {
			expect((await editRpcSettings(fixture, 0, "0")).data.disposition).toBe("handled");
			expect((await editRpcSettings(fixture, 1, "2")).data.disposition).toBe("handled");
			expect((await editRpcSettings(fixture, 2, "2")).data.disposition).toBe("handled");
			expect((await loadRegistry(join(fixture.agentDir, "om-pi-subagents.yaml"))).limits).toEqual({
				maxDepth: 0,
				maxConcurrentRuns: 2,
			});
			const display = join(fixture.root, "config", "pi-subagents", "config.json");
			expect(JSON.parse(await readFile(display, "utf8"))).toEqual({ maxVisibleAgents: 2 });
			expect(fixture.model.requests).toHaveLength(0);
			expect(fixture.records.filter((record) => record.type === "tool_execution_start")).toEqual([]);
			expect(fixture.records.filter((record) => record.entry?.customType?.includes("todo"))).toEqual([]);
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
			await expect(stat(join(fixture.agentDir, "om-pi-subagents.yaml"))).rejects.toMatchObject({ code: "ENOENT" });
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
