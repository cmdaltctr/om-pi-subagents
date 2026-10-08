import { CombinedAutocompleteProvider, type AutocompleteProvider } from "@earendil-works/pi-tui";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { wrapAtMentionProvider } from "../src/at-mention.ts";
import { createRegistryStore } from "../src/config.ts";
import { fixtureRegistryPath, writeFixturePersona, writeFixtureRegistry } from "./fixtures/registry.ts";

const options = () => ({ signal: new AbortController().signal });
const files = [
	{ value: "@z.md", label: "z.md" },
	{ value: "@a.md", label: "a.md" },
];
const own = { prefix: "@", items: files };
const hostProvider = (suggestions = own): AutocompleteProvider => ({
	triggerCharacters: ["#", "@"],
	getSuggestions: async () => suggestions,
	applyCompletion: (...args) => new CombinedAutocompleteProvider([], "/tmp").applyCompletion(...args),
	shouldTriggerFileCompletion: () => true,
});

describe("at-mention completion wrapper", () => {
	it("prepends names-only items and keeps Pi's file items in their original order", async () => {
		const next = hostProvider();
		const read = vi.fn(async () => ["reader", "researcher"]);
		const wrapped = wrapAtMentionProvider(next, read);
		const suggestions = await wrapped.getSuggestions(["@"], 0, 1, options());
		expect(suggestions).toEqual({
			prefix: "@",
			items: [{ value: "@reader", label: "reader" }, { value: "@researcher", label: "researcher" }, ...files],
		});
		expect(suggestions!.items.slice(2)[0]).toBe(files[0]);
		expect(read).toHaveBeenCalledOnce();
	});

	it("uses the same @a-ex prefix for agent and file replacement", async () => {
		const next = hostProvider({ prefix: "@a-ex", items: [{ value: "@a-ex.md", label: "a-ex.md" }] });
		const suggestions = await wrapAtMentionProvider(next, async () => ["a-explore", "reader"]).getSuggestions(
			["@a-ex"],
			0,
			5,
			options(),
		);
		expect(suggestions).toEqual({
			prefix: "@a-ex",
			items: [
				{ value: "@a-explore", label: "a-explore" },
				{ value: "@a-ex.md", label: "a-ex.md" },
			],
		});
	});

	it.each([
		[["prefix @"], 0, 8],
		[[" @"], 0, 2],
		[["first", "@"], 1, 1],
		[["@reader task"], 0, 9],
		[[""], 0, 0],
		[["ordinary"], 0, 8],
	])("passes other editor positions through without a registry read: %j", async (lines, line, col) => {
		const read = vi.fn(async () => ["reader"]);
		expect(
			await wrapAtMentionProvider(hostProvider(), read).getSuggestions(
				lines as string[],
				line as number,
				col as number,
				options(),
			),
		).toBe(own);
		expect(read).not.toHaveBeenCalled();
	});

	it("keeps an incompatible replacement prefix unchanged", async () => {
		const incompatible = { ...own, prefix: "different-prefix" };
		expect(
			await wrapAtMentionProvider(hostProvider(incompatible), async () => ["reader"]).getSuggestions(
				["@"],
				0,
				1,
				options(),
			),
		).toBe(incompatible);
	});

	it("offers agents when the native provider has no matching files", async () => {
		const next = { ...hostProvider(), getSuggestions: async () => null };
		expect(await wrapAtMentionProvider(next, async () => ["reader"]).getSuggestions(["@r"], 0, 2, options())).toEqual({
			prefix: "@r",
			items: [{ value: "@reader", label: "reader" }],
		});
		expect(
			await wrapAtMentionProvider(next, async () => ["reader"]).getSuggestions(["@x"], 0, 2, options()),
		).toBeNull();
	});

	it("delegates application and optional hooks with the native receiver and arguments", async () => {
		const next = hostProvider();
		const applied = vi.spyOn(next, "applyCompletion");
		next.shouldTriggerFileCompletion = function (lines, line, col) {
			expect(this).toBe(next);
			return lines[line].slice(0, col) === "@";
		};
		const suggest = vi.spyOn(next, "getSuggestions");
		const wrapped = wrapAtMentionProvider(next, async () => ["reader"]);
		expect(wrapped.triggerCharacters).toEqual(["#", "@"]);
		expect(wrapped.shouldTriggerFileCompletion!(["@"], 0, 1)).toBe(true);
		const request = options();
		const result = await wrapped.getSuggestions(["@"], 0, 1, request);
		expect(suggest).toHaveBeenCalledExactlyOnceWith(["@"], 0, 1, request);
		expect(suggest.mock.contexts[0]).toBe(next);
		const item = result!.items[1];
		expect(wrapped.applyCompletion(["@"], 0, 1, item, "@")).toEqual({
			lines: ["@z.md "],
			cursorLine: 0,
			cursorCol: 6,
		});
		expect(applied).toHaveBeenCalledExactlyOnceWith(["@"], 0, 1, item, "@");
		expect(applied.mock.contexts[0]).toBe(next);
	});

	it.each([" task", "   task", "\t task"])(
		"uses exactly one OMPS separator before an existing task: %j",
		async (suffix) => {
			const next = hostProvider({ prefix: "@r", items: [] });
			const applied = vi.spyOn(next, "applyCompletion");
			const wrapped = wrapAtMentionProvider(next, async () => ["reader"]);
			const lines = [`@r${suffix}`, "second   line"];
			const suggestions = await wrapped.getSuggestions(lines, 0, 2, options());
			const item = suggestions!.items[0];
			expect(wrapped.applyCompletion(lines, 0, 2, item, "@r")).toEqual({
				lines: ["@reader task", "second   line"],
				cursorLine: 0,
				cursorCol: 8,
			});
			expect(applied).not.toHaveBeenCalled();
			expect(lines).toEqual([`@r${suffix}`, "second   line"]);
		},
	);

	it.each([
		{ lines: ["@reader"], cursorCol: 2, expected: ["@reader "] },
		{ lines: ["@reader inspect src"], cursorCol: 2, expected: ["@reader inspect src"] },
		{ lines: ["@reader   \t inspect  src  "], cursorCol: 4, expected: ["@reader inspect  src  "] },
		{ lines: ["@reader", ""], cursorCol: 2, expected: ["@reader ", ""] },
		{
			lines: ["@reader", "  inspect src", "", "second   line"],
			cursorCol: 2,
			expected: ["@reader ", "  inspect src", "", "second   line"],
		},
		{
			lines: ["@reader inspect src", "  second   line", ""],
			cursorCol: 2,
			expected: ["@reader inspect src", "  second   line", ""],
		},
		{ lines: ["@reader task"], cursorCol: 1, expected: ["@reader task"] },
		{ lines: ["@rubbish task"], cursorCol: 2, expected: ["@reader task"] },
	])(
		"replaces the whole initial agent token with the pinned provider: $lines at $cursorCol",
		async ({ lines, cursorCol, expected }) => {
			const next = new CombinedAutocompleteProvider([], import.meta.dirname);
			const wrapped = wrapAtMentionProvider(next, async () => ["reader"]);
			const original = [...lines];
			const suggestions = await wrapped.getSuggestions(lines, 0, cursorCol, options());
			expect(suggestions!.prefix).toBe(lines[0].slice(0, cursorCol));
			const item = suggestions!.items[0];
			expect(item).toEqual({ value: "@reader", label: "reader" });
			expect(wrapped.applyCompletion(lines, 0, cursorCol, item, suggestions!.prefix)).toEqual({
				lines: expected,
				cursorLine: 0,
				cursorCol: 8,
			});
			expect(lines).toEqual(original);
		},
	);

	it("preserves native file application even when its value matches an OMPS item", async () => {
		const file = { value: "@reader", label: "reader" };
		const next = hostProvider({ prefix: "@r", items: [file] });
		const wrapped = wrapAtMentionProvider(next, async () => ["reader"]);
		const lines = ["@reader task", "second   line"];
		const suggestions = await wrapped.getSuggestions(lines, 0, 2, options());
		expect(suggestions!.items[1]).toBe(file);
		expect(wrapped.applyCompletion(lines, 0, 2, file, "@r")).toEqual(next.applyCompletion(lines, 0, 2, file, "@r"));
		expect(wrapped.applyCompletion(lines, 0, 2, file, "@r").lines).toEqual(["@reader eader task", "second   line"]);
	});

	it("keeps optional hooks absent when the wrapped provider has none", () => {
		const next = hostProvider();
		delete next.triggerCharacters;
		delete next.shouldTriggerFileCompletion;
		const wrapped = wrapAtMentionProvider(next, async () => []);
		expect(wrapped.triggerCharacters).toEqual(["@"]);
		expect(wrapped.shouldTriggerFileCompletion).toBeUndefined();
	});

	it("reads fresh mappings and drops OMPS items after invalid or missing configuration", async () => {
		const directory = await mkdtemp(join(tmpdir(), "omps-at-completion-"));
		vi.stubEnv("PI_CODING_AGENT_DIR", directory);
		try {
			await writeFixturePersona(directory, "reader.md", "disposable reader");
			const text = (name: string) =>
				`version: 1\nagents:\n  ${name}: { persona: ./personas/reader.md, tools: [read], thinking: off }\n`;
			await writeFixtureRegistry(directory, text("reader"));
			const store = createRegistryStore(fixtureRegistryPath(directory));
			const wrapped = wrapAtMentionProvider(hostProvider(), async () => [...(await store.refresh()).agents.keys()]);
			expect((await wrapped.getSuggestions(["@"], 0, 1, options()))!.items[0].label).toBe("reader");
			await writeFile(fixtureRegistryPath(directory), text("fresh-reader"));
			expect((await wrapped.getSuggestions(["@"], 0, 1, options()))!.items[0].label).toBe("fresh-reader");
			await writeFile(fixtureRegistryPath(directory), "version: 1\nagents: [invalid]\n");
			expect(await wrapped.getSuggestions(["@"], 0, 1, options())).toBe(own);
			const missing = wrapAtMentionProvider(hostProvider(), async () => [
				...(await createRegistryStore(join(directory, "missing.yaml")).refresh()).agents.keys(),
			]);
			expect(await missing.getSuggestions(["@"], 0, 1, options())).toBe(own);
		} finally {
			vi.unstubAllEnvs();
			await rm(directory, { recursive: true, force: true });
		}
	});
});
