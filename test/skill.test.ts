import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { buildLaunch } from "../src/runner.ts";
import { VIOLATION_ENTRY } from "../src/protocol.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";
import { PI_AVAILABLE, PI_BIN, startPi } from "./fixtures/pi-rpc.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const skill = join(root, "skills", "om-pi-subagents", "SKILL.md");

describe("OMPSS skill resources", () => {
	it("has portable frontmatter, bounded instructions and real relative guide references", async () => {
		const text = await readFile(skill, "utf8");
		const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
		expect(match).not.toBeNull();
		const metadata = parse(match![1]);
		expect(metadata.name).toBe("om-pi-subagents");
		expect(metadata.description.length).toBeGreaterThan(30);
		expect(metadata.description.length).toBeLessThanOrEqual(1024);
		expect(metadata["allowed-tools"]).toBeUndefined();
		expect(text.split("\n").length).toBeLessThan(500);
		expect(text).not.toMatch(/\/Users\/|\/home\/|gpt-\d|glm-\d/);
		const references = [...text.matchAll(/\]\((\.\.\/\.\.\/docs\/[^)]+)\)/g)].map((reference) => reference[1]);
		expect(references.length).toBeGreaterThanOrEqual(2);
		for (const reference of references)
			expect(await readFile(resolve(dirname(skill), reference.split("#")[0]), "utf8")).not.toBe("");
	});

	it("declares exactly the packaged skill root and file", async () => {
		const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
		expect(manifest.pi.skills).toEqual(["./skills"]);
		expect(manifest.files).toContain("skills/om-pi-subagents/SKILL.md");
	});
});

describe.skipIf(!PI_AVAILABLE)("real Pi skill discovery", () => {
	it("discovers the package skill and expands its command into a model request", async () => {
		const fixture = await startPi({
			mcp: false,
			launch: ({ cwd }) => ({
				command: PI_BIN,
				cwd,
				env: process.env,
				args: [
					"--mode",
					"rpc",
					"--no-session",
					"--provider",
					"fake",
					"--model",
					"counter",
					"--no-extensions",
					"--no-prompt-templates",
					"--no-themes",
					"-e",
					root,
				],
			}),
		});
		try {
			const commands = (await fixture.send({ type: "get_commands" })).data.commands;
			expect(commands.some((command: { name: string }) => command.name === "skill:om-pi-subagents")).toBe(true);
			await fixture.send({ type: "prompt", message: "/skill:om-pi-subagents Check current mappings" });
			await fixture.waitFor((record) => record.type === "agent_settled");
			expect(JSON.stringify(fixture.model.requests)).toContain("# OMPSS operations");
			expect(JSON.stringify(fixture.model.requests)).toContain("Check current mappings");
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it.each([
		[true, true],
		[true, false],
		[false, true],
		[false, false],
	])("maps child skill %s with delegation approval %s", async (mapped, approved) => {
		const fixture = await startPi({
			mcp: false,
			seed: async ({ agentDir }) => {
				await writeFile(join(agentDir, "persona.md"), "Skill loading fixture");
				const ambient = join(agentDir, "skills", "ambient-skill");
				await mkdir(ambient, { recursive: true });
				await writeFile(
					join(ambient, "SKILL.md"),
					"---\nname: ambient-skill\ndescription: Must stay excluded.\n---\nAmbient instructions\n",
				);
			},
			launch: ({ cwd, agentDir }) =>
				buildLaunch({
					snapshot: {
						name: "child",
						personaPath: "unused",
						persona: "Skill loading fixture",
						tools: approved ? ["ompss"] : ["read"],
						thinking: "off",
						skills: mapped ? [skill] : [],
						extensions: [],
					},
					cwd,
					personaFile: join(agentDir, "persona.md"),
					guardPath: join(root, "src", "child-guard.ts"),
					runToken: "skill-token",
					lineage: fixtureLineage(join(agentDir, "om-pi-subagents.yaml")),
					piBin: PI_BIN,
					parentModel: "fake/counter",
				}),
		});
		try {
			const commands = (await fixture.send({ type: "get_commands" })).data.commands;
			expect(commands.some((command: { name: string }) => command.name === "skill:om-pi-subagents")).toBe(mapped);
			expect(commands.some((command: { name: string }) => command.name === "skill:ambient-skill")).toBe(false);
			expect(commands.some((command: { name: string }) => command.name === "ompss")).toBe(approved);
			if (!approved) {
				fixture.model.script = [
					{ tool: "ompss", args: { action: "run", agent: "unmapped", task: "Must be refused" } },
					{ text: "Skill grants no delegation" },
				];
				await fixture.send({ type: "prompt", message: "Try to delegate after loading the skill" });
				await fixture.waitFor((record) => record.type === "agent_settled");
				expect(
					fixture.records.some(
						(record) => record.entry?.customType === VIOLATION_ENTRY && record.entry.data.tool === "ompss",
					),
				).toBe(true);
			}
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});
});
