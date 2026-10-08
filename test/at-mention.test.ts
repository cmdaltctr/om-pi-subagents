import { describe, expect, it } from "vitest";
import { atMentionItems, parseAtMention } from "../src/at-mention.ts";

const names = ["reader", "a-explore", "README.md"];

describe("parseAtMention", () => {
	it.each([
		["@reader inspect src", { kind: "launch", agent: "reader", task: "inspect src" }],
		["@a-explore first line\nsecond   line", { kind: "launch", agent: "a-explore", task: "first line\nsecond   line" }],
		["@reader\t inspect src  ", { kind: "launch", agent: "reader", task: "inspect src" }],
		["@reader", { kind: "no-task", agent: "reader" }],
		["@reader ", { kind: "no-task", agent: "reader" }],
		["@reader \n\t  ", { kind: "no-task", agent: "reader" }],
		["@nobody do it", { kind: "unknown", name: "nobody" }],
		["@nobody", { kind: "unknown", name: "nobody" }],
		["@src/x.ts summarise this", { kind: "none" }],
		["@other.md summarise this", { kind: "none" }],
		[" @reader inspect src", { kind: "none" }],
		["@", { kind: "none" }],
		["", { kind: "none" }],
		["ordinary text", { kind: "none" }],
		["inspect @reader src", { kind: "none" }],
	])("parses %j", (text, expected) => {
		expect(parseAtMention(text, names)).toEqual(expected);
	});

	it("passes an unmapped README.md through as a file reference", () => {
		expect(parseAtMention("@README.md summarise this", ["reader"])).toEqual({ kind: "none" });
	});

	it("gives an exact mapping precedence over file-like spelling", () => {
		expect(parseAtMention("@README.md summarise this", names)).toEqual({
			kind: "launch",
			agent: "README.md",
			task: "summarise this",
		});
	});
});

describe("atMentionItems", () => {
	it("uses names as labels and leaves the trailing space to Pi", () => {
		expect(atMentionItems("@", names)).toEqual(names.map((name) => ({ value: `@${name}`, label: name })));
	});
	it("filters exact name prefixes and preserves registry order", () => {
		expect(atMentionItems("@a-ex", names)).toEqual([{ value: "@a-explore", label: "a-explore" }]);
		expect(atMentionItems("@unknown", names)).toEqual([]);
	});
});
