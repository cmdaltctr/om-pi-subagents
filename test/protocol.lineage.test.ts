import { describe, expect, it } from "vitest";
import { parseChildPolicy } from "../src/protocol.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";

const policy = (lineage: Record<string, unknown>) => ({
	tools: ["read", "omps"],
	startupDeadlineMs: 1000,
	lineage,
});

describe("lineage agent and delegation targets", () => {
	it("keeps the agent name and the captured target list", () => {
		const parsed = parseChildPolicy(policy({ ...fixtureLineage(), agent: "a-build", delegates: ["a-writer"] }));
		expect(parsed).toMatchObject({ lineage: { agent: "a-build", delegates: ["a-writer"] } });
		expect(Object.isFrozen((parsed as { lineage: { delegates: unknown } }).lineage.delegates)).toBe(true);
	});

	it("accepts a lineage without targets, for an agent that does not delegate", () => {
		const parsed = parseChildPolicy(policy({ ...fixtureLineage(), agent: "a-build" }));
		expect(parsed).toMatchObject({ lineage: { agent: "a-build" } });
		expect((parsed as unknown as { lineage: Record<string, unknown> }).lineage.delegates).toBeUndefined();
	});

	it.each([
		["missing", undefined],
		["not a string", 7],
		["not a valid name", "A Build"],
	])("rejects an agent that is %s", (_label, agent) => {
		const lineage: Record<string, unknown> = { ...fixtureLineage() };
		if (agent === undefined) delete lineage.agent;
		else lineage.agent = agent;
		expect(parseChildPolicy(policy(lineage))).toMatch(/lineage agent must be a valid agent name/);
	});

	it.each([
		["not a list", "a-writer"],
		["an empty list", []],
		["a list with an invalid name", ["a-writer", "Bad Name"]],
	])("rejects targets that are %s", (_label, delegates) => {
		expect(parseChildPolicy(policy({ ...fixtureLineage(), delegates }))).toMatch(
			/lineage delegates must be a non-empty list of valid agent names/,
		);
	});
});
