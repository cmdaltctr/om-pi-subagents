// The package ships no agents, models or personal paths. The operator maps agents in their own Pi agent directory.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const sources = () => readdirSync(SRC).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));

describe("nothing is hard-coded", () => {
	it("ships no mapping and no persona files", () => {
		for (const name of ["om-pi-subagents.yaml", "personas", "ports", "pilot"])
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

describe("README makes no legacy-compatibility claim", () => {
	const readme = readFileSync(join(ROOT, "README.md"), "utf8");
	const section = (title: string) => new RegExp(`## ${title}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(readme)?.[1] ?? "";

	it("lists every unsupported legacy feature", () => {
		const unsupported = section("Not supported");
		for (const feature of [/subagent/i, /workflow/i, /fleet/i, /council/i, /resum/i])
			expect(unsupported).toMatch(feature);
	});

	it("makes no drop-in or compatibility claim", () => {
		expect(readme).not.toMatch(/drop-in|fully compatible|backward[- ]compatible|compatible with `?pi-subagents/i);
	});
});
