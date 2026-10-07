import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const directory = "test/fixtures/skill-evals";
const cases = JSON.parse(await read(`${directory}/evals.json`));
const triggers: Array<{ query: string; should_trigger: boolean }> = JSON.parse(
	await read(`${directory}/trigger-eval.json`),
);
const evidence: Array<{ eval_id: number; file: string; test: string }> = JSON.parse(
	await read(`${directory}/evidence.json`),
);

describe("OMPS skill evaluation fixtures", () => {
	it("covers fleet navigation, optional capabilities and parent-owned results with real test references", async () => {
		expect(cases.skill_name).toBe("om-pi-subagents");
		expect(cases.evals).toHaveLength(8);
		expect(new Set(cases.evals.map((entry: { id: number }) => entry.id)).size).toBe(8);
		for (const entry of cases.evals) {
			expect(entry.prompt).toMatch(/OMPS/);
			expect(entry.expected_output.length).toBeGreaterThan(40);
			expect(entry.expectations.length).toBeGreaterThanOrEqual(3);
			expect(evidence.some((item) => item.eval_id === entry.id)).toBe(true);
		}
		for (const proof of evidence) {
			expect(cases.evals.some((entry: { id: number }) => entry.id === proof.eval_id)).toBe(true);
			expect(proof.file).toMatch(/^test\/[a-z0-9.-]+\.test\.ts$/);
			expect(await read(proof.file)).toContain(proof.test);
		}
		for (const [id, topic] of [
			[6, /fleet|descendant/i],
			[7, /memory|todo/i],
			[8, /parent|captur/i],
		] as const)
			expect(cases.evals.find((entry: { id: number }) => entry.id === id)?.expected_output).toMatch(topic);
	});

	it("keeps positive and unrelated trigger examples distinct without claiming model accuracy", async () => {
		expect(triggers.filter((entry) => entry.should_trigger)).toHaveLength(9);
		expect(triggers.filter((entry) => !entry.should_trigger)).toHaveLength(9);
		expect(new Set(triggers.map((entry) => entry.query)).size).toBe(triggers.length);
		for (const entry of triggers) {
			expect(typeof entry.should_trigger).toBe("boolean");
			expect(entry.query.length).toBeGreaterThan(20);
		}
		expect(await read(`${directory}/README.md`)).toContain(
			"Model-driven trigger evaluation and with-skill versus baseline trials have not been run.",
		);
	});
});
