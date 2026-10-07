import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { RunManager } from "../src/runs.ts";
import { resolveRegistryPath } from "../src/index.ts";

const launch = vi.hoisted(() =>
	vi.fn(async (_input: unknown, _options: unknown) => {
		throw new Error("synthetic startup stop");
	}),
);
vi.mock("../src/startup.ts", () => ({ launchChild: launch }));
import { createSupervisor } from "../src/supervisor.ts";

const agent = {
	name: "reader",
	persona: "Read.",
	personaPath: "/persona.md",
	tools: ["read"],
	thinking: "off",
	skills: [],
	extensions: [],
};

describe("supervisor lineage registry", () => {
	it.each([undefined, "/custom/agents.yaml"])("uses the shared resolver with override %s", async (override) => {
		launch.mockClear();
		const env = { PI_CODING_AGENT_DIR: "/disposable-agent", OMPS_REGISTRY: override };
		const terminal = vi.fn();
		const supervisor = createSupervisor({
			piBin: "/bin/pi",
			guardPath: "/guard.ts",
			env,
			prepare: async () => ({ personaFile: "/persona.md" }),
			persist: async () => undefined,
		});
		const manager = new RunManager(supervisor, { onTerminal: terminal });
		manager.start("session-1", { agent, task: "Read.", cwd: "/work" });
		await vi.waitFor(() => expect(terminal).toHaveBeenCalledOnce());
		expect(launch).toHaveBeenCalledOnce();
		const input = launch.mock.calls[0][0] as unknown as { lineage: { registryPath: string } };
		expect(input.lineage.registryPath).toBe(resolve(resolveRegistryPath(env.PI_CODING_AGENT_DIR, env)));
		expect(input.lineage.registryPath).toBe(override ?? "/disposable-agent/omps/config.yaml");
	});
});
