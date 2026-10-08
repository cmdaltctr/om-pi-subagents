import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Public guides must keep command access visible when operators hide management navigation.
describe("fleet refinement guidance", () => {
	it.each(["README.md", "docs/SETUP.md", "docs/USAGE.md", "skills/om-pi-subagents/SKILL.md"])(
		"documents independent list visibility and effective keys in %s",
		async (path) => {
			const text = await read(path);
			for (const field of ["showManagementList", "navigationDownKey", "navigationUpKey"])
				expect(text, field).toContain(field);
			expect(text).toContain("/omps inspect");
			expect(text).toContain("Fleet view shortcut");
			expect(text).toMatch(/Management list/);
			expect(text).toContain("/reload");
		},
	);

	it.each(["docs/SETUP.md", "docs/USAGE.md", "skills/om-pi-subagents/SKILL.md"])(
		"names fullscreen conflicts and preserves manual remapping in %s",
		async (path) => {
			const text = await read(path);
			for (const action of ["tui.altScreen.previousPrompt", "tui.altScreen.nextPrompt"]) expect(text).toContain(action);
			expect(text).toContain("Ctrl+Shift");
			expect(text).toMatch(/terminal/i);
			expect(text).toMatch(/never (?:rewrites|writes|changes).*keybindings/i);
		},
	);

	it("provides a synthetic tree-only example and valid manual Pi bindings", async () => {
		const text = await read("docs/SETUP.md");
		const examples = [...text.matchAll(/```yaml\n([\s\S]*?)```/g)].map((match) => parse(match[1]));
		const example = examples.find((entry) => entry?.ui?.showManagementList === false);
		expect(example?.ui).toMatchObject({
			fleetView: "expanded",
			showManagementList: false,
			navigationDownKey: "ctrl+shift+down",
			navigationUpKey: "ctrl+shift+up",
		});
		const remapping = [...text.matchAll(/```json\n([\s\S]*?)```/g)]
			.map((match) => JSON.parse(match[1]))
			.find((entry) => entry["tui.altScreen.previousPrompt"]);
		expect(remapping).toEqual({
			"tui.altScreen.previousPrompt": ["ctrl+up"],
			"tui.altScreen.nextPrompt": ["ctrl+down"],
		});
	});

	it.each(["README.md", "docs/USAGE.md", "skills/om-pi-subagents/SKILL.md"])(
		"describes picker/detail controls and provisional limits in %s",
		async (path) => {
			const text = await read(path);
			expect(text).toMatch(/picker/i);
			// Margins replace the former full-width layout without adding another column.
			expect(text).toMatch(/single-column|one column/);
			for (const key of ["PageUp", "PageDown", "Home", "End"]) expect(text, key).toContain(key);
			expect(text).toMatch(/wheel/i);
			expect(text).toMatch(/provisional/i);
			expect(text).toContain("4 KiB");
			expect(text).toMatch(/regular mode/i);
		},
	);
});
