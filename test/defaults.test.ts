// The package ships no agents, models or personal paths. The operator maps agents in their own Pi agent directory.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const sources = () => readdirSync(SRC).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

describe("nothing is hard-coded", () => {
	it("ships no mapping and no persona files", () => {
		for (const name of ["om-pi-subagents.yaml", "omps/config.yaml", "omps/personas", "personas", "ports", "pilot"])
			expect(existsSync(join(ROOT, name)), name).toBe(false);
	});

	it("names no model, provider or personal path in any extension source file", () => {
		expect(sources().length).toBeGreaterThan(5);
		for (const name of sources())
			expect(readFileSync(join(SRC, name), "utf8"), name).not.toMatch(
				/\b(zai|openai-codex|deepseek|anthropic|openai)\/|\bglm-\d|\bgpt-\d|~\/\.agents|\/Users\//,
			);
	});
});

describe("the shipped OMPS skill guides proactive task selection", () => {
	const path = "skills/om-pi-subagents/SKILL.md";
	const skill = readFileSync(join(ROOT, path), "utf8");
	const selection = /## Choose useful work proactively\n([\s\S]*?)(?=\n## |$)/.exec(skill)?.[1] ?? "";

	it("routes substantial separable work to proactive delegation", () => {
		const description = /^description: (.+)$/m.exec(skill)?.[1] ?? "";
		expect(description).toMatch(/proactive delegation.*substantial tasks.*separable investigation/i);
		expect(description).not.toMatch(/investigation or review/i);
	});

	it("delegates bounded work without reminders while keeping simple or restricted work local", () => {
		expect(selection).toMatch(
			/substantial tasks with separable work[\s\S]*proactively delegate[\s\S]*bounded investigation\./i,
		);
		expect(selection).toMatch(/delegate review, audit or security work only when the user asks for it/i);
		expect(selection).not.toMatch(/investigation or review/i);
		expect(selection).toMatch(/clear task and expected result/i);
		expect(selection).toMatch(/without waiting for a user reminder/i);
		expect(selection).toMatch(/keep simple tasks local/i);
		expect(selection).toMatch(/honour explicit user requests to avoid subagents/i);
		expect(selection).toMatch(
			/do not require discovery or a launch for every request, or a fixed number of subagents/i,
		);
	});

	it("keeps discovery, permissions, refusals and result assessment within existing boundaries", () => {
		expect(selection).toMatch(/fresh `omps list` output[\s\S]*approved tools/i);
		expect(selection).toMatch(/current-session `status` before adding runs/i);
		expect(selection).toMatch(/empty, invalid or unsuitable mapping[\s\S]*permitted local work/i);
		expect(selection).toMatch(/never invent agents, grant tools or change settings without permission/i);
		expect(selection).toMatch(/verify the working folder[\s\S]*shared-file conflicts/i);
		expect(selection).toMatch(/configured concurrency, inherited depth ceilings and cleanup blocks/i);
		expect(selection).toMatch(/without repeated launch attempts or unauthorised limit changes/i);
		expect(selection).toMatch(/wait for the separate result before relying on findings/i);
		expect(selection).toMatch(/assess[\s\S]*task and available evidence[\s\S]*failed or partial labels/i);
		expect(selection).toMatch(/parent owns the final answer and parent task updates/i);
		expect(selection).toMatch(/continue independent work while a child runs/i);
	});

	it("explains optional skill loading and the host-controlled limits of built-in guidance", () => {
		expect(selection).toMatch(/default system prompt[\s\S]*`omps` is active[\s\S]*host includes its guidance/i);
		expect(selection).toMatch(/without loading this skill/i);
		expect(selection).toMatch(/replacement prompts or omitted tool guidance[\s\S]*leave these rules out/i);
		expect(selection).toMatch(/guidance does not guarantee model compliance/i);
		expect(selection).toMatch(/starts no child or model request at session startup/i);
		expect(selection).toMatch(/loading this skill grants no tools/i);
	});

	it("keeps the skill and its local references packaged and portable", () => {
		const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
		expect(pkg.files).toContain(path);
		expect(pkg.pi.skills).toContain("./skills");
		const references = [...skill.matchAll(/\]\((\.{1,2}\/[^)#]+)(?:#[^)]*)?\)/g)];
		expect(references.length).toBeGreaterThan(0);
		for (const [, reference] of references) {
			const target = relative(ROOT, resolve(ROOT, dirname(path), reference));
			expect(existsSync(join(ROOT, target)), target).toBe(true);
			expect(pkg.files, target).toContain(target);
		}
		expect(selection).not.toMatch(/\/Users\/|\/home\/|~\/|\b(?:agent|model|provider):/);
	});
});

describe("README makes no legacy-compatibility claim", () => {
	const readme = readFileSync(join(ROOT, "README.md"), "utf8");
	const section = (title: string) => new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(readme)?.[1] ?? "";

	it("lists every unsupported legacy feature", () => {
		const unsupported = section("Not supported");
		for (const feature of [/subagent/i, /workflow/i, /council/i, /resum/i]) expect(unsupported).toMatch(feature);
		expect(unsupported).not.toMatch(/fleet commands/i);
		expect(readme).toContain("/omps fleet");
	});

	it("makes no drop-in or compatibility claim", () => {
		expect(readme).not.toMatch(/drop-in|fully compatible|backward[- ]compatible|compatible with `?pi-subagents/i);
	});
});
