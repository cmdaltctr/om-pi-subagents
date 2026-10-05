// A real Pi 0.99.1 child started by OMPSS's own launcher, in an agent directory full of ambient resources.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import { PREFLIGHT_COMMAND, READY_ENTRY } from "../src/protocol.ts";
import type { AgentSnapshot } from "../src/config.ts";
import { buildLaunch } from "../src/runner.ts";
import { PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";

import { fixtureLineage } from "./fixtures/lineage.ts";

const GUARD = new URL("../src/child-guard.ts", import.meta.url).pathname;

const AMBIENT_EXTENSION = `
export default function (pi) {
  for (const name of ["ambient_tool", "subagent", "ompss"]) {
    pi.registerTool({
      name, label: name, description: name, parameters: { type: "object", properties: {} },
      execute: async () => ({ content: [{ type: "text", text: name }], details: undefined }),
    });
  }
  for (const name of ["ambient-cmd", "ompss", "subagents"]) {
    pi.registerCommand(name, { description: name, handler: async () => {} });
  }
}
`;

const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture skill ${name}.\n---\n# ${name}\n`;

const snapshot: AgentSnapshot = {
	name: "reader",
	personaPath: "unused",
	persona: "PERSONA-MARKER-42",
	tools: ["read", "grep"],
	thinking: "off",
	skills: [],
	extensions: [],
};

let pi: PiFixture | undefined;
afterEach(async () => {
	await pi?.dispose();
	pi = undefined;
});

/** Start a child through buildLaunch. The skill the YAML selects lives outside the agent directory. */
async function startChild(overrides: Partial<AgentSnapshot> = {}): Promise<PiFixture> {
	let selectedSkill = "";
	return startPi({
		seed: async ({ cwd, agentDir }) => {
			const root = dirname(agentDir);
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			selectedSkill = join(root, "selected/SKILL.md");
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await mkdir(join(agentDir, "extensions"), { recursive: true });
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await writeFile(join(agentDir, "extensions/ambient.ts"), AMBIENT_EXTENSION);
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await mkdir(join(agentDir, "skills/ambient"), { recursive: true });
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await writeFile(join(agentDir, "skills/ambient/SKILL.md"), skill("ambient"));
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await mkdir(join(root, "selected"), { recursive: true });
			await writeFile(selectedSkill, skill("selected"));
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await writeFile(join(root, "persona.md"), "PERSONA-MARKER-42");
			// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
			await writeFile(join(cwd, "AGENTS.md"), "PROJECT-CONTEXT-MARKER-77");
		},
		launch: ({ cwd, agentDir }) =>
			buildLaunch({
				// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
				snapshot: { ...snapshot, skills: [join(dirname(agentDir), "selected/SKILL.md")], ...overrides },
				cwd,
				// nosemgrep: AIK_ts_generic_path_traversal -- Test fixture root is generated and appended path segments are fixed literals.
				personaFile: join(dirname(agentDir), "persona.md"),
				guardPath: GUARD,
				runToken: "token-9",
				lineage: fixtureLineage(join(agentDir, "om-pi-subagents.yaml")),
				piBin: PI_BIN,
				parentModel: "fake/counter",
			}),
	});
}

describe("child launched by OMPSS", () => {
	it("loads no ambient extension, legacy launcher, parent entry point or unselected skill", async () => {
		pi = await startChild();
		const { data } = await pi.send({ type: "get_commands" });
		const names: string[] = data.commands.map((command: { name: string }) => command.name);

		expect(names).toContain(PREFLIGHT_COMMAND);
		expect(names).toContain("skill:selected");
		for (const forbidden of ["ambient-cmd", "ompss", "subagents", "skill:ambient"]) {
			expect(names, forbidden).not.toContain(forbidden);
		}

		await pi.send({ type: "prompt", message: `/${PREFLIGHT_COMMAND}` });
		const ready = pi.records.find((record) => record.entry?.customType === READY_ENTRY);
		expect(ready!.entry.data).toMatchObject({ token: "token-9", tools: ["read", "grep"], model: "fake/counter" });
		expect(pi.model.requests).toHaveLength(0);
	});

	it("declares only the approved tools to the model and keeps persona and project context", async () => {
		pi = await startChild();
		await pi.send({ type: "prompt", message: "do the task" });
		await pi.waitFor((record) => record.type === "agent_settled");

		const [request] = pi.model.requests as Array<{ tools?: Array<{ function: { name: string } }> }>;
		expect(request.tools!.map((tool) => tool.function.name).sort()).toEqual(["grep", "read"]);
		const text = JSON.stringify(request);
		expect(text).toContain("PERSONA-MARKER-42");
		expect(text).toContain("PROJECT-CONTEXT-MARKER-77");
		expect(text).not.toContain("ambient_tool");
	});

	it("grants no tools for an empty tool list", async () => {
		pi = await startChild({ tools: [] });
		await pi.send({ type: "prompt", message: "do the task" });
		await pi.waitFor((record) => record.type === "agent_settled");
		const [request] = pi.model.requests as Array<{ tools?: unknown[] }>;
		expect(request.tools ?? []).toEqual([]);
	});
});
