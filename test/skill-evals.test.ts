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

describe("OMPSS skill evaluation fixtures", () => {
	it("covers parallel, nested, empty, cleanup and todo ownership requests with test evidence", async () => {
		expect(cases.skill_name).toBe("om-pi-subagents");
		expect(cases.evals).toHaveLength(5);
		expect(new Set(cases.evals.map((entry: { id: number }) => entry.id)).size).toBe(5);
		for (const entry of cases.evals) {
			expect(entry.prompt).toMatch(/OMPSS/);
			expect(entry.expected_output.length).toBeGreaterThan(40);
			expect(entry.expectations.length).toBeGreaterThanOrEqual(3);
			const proof = evidence.find((item) => item.eval_id === entry.id);
			expect(proof).toBeDefined();
			expect(await read(proof!.file)).toContain(proof!.test);
		}
	});

	it("keeps positive and unrelated trigger examples distinct without claiming model accuracy", async () => {
		expect(triggers.filter((entry) => entry.should_trigger)).toHaveLength(6);
		expect(triggers.filter((entry) => !entry.should_trigger)).toHaveLength(6);
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
