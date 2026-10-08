import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRegistry, UI_KEY_FIELDS } from "../src/config.ts";

let root: string;
let path: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-result-key-"));
	path = join(root, "config.yaml");
});
afterEach(async () => rm(root, { recursive: true, force: true }));
const writeUi = (ui: string) => writeFile(path, `version: 1\nagents: {}\n${ui}`);

describe("result shortcut configuration", () => {
	it.each(["missing", "omitted", "empty"])("defaults to ctrl+shift+e with %s UI", async (kind) => {
		if (kind !== "missing") await writeUi(kind === "empty" ? "ui: {}\n" : "");
		const snapshot = await loadRegistry(path);
		expect(snapshot.ui.resultKey).toBe("ctrl+shift+e");
		expect(snapshot.uiDeclarations.resultKey).toBe(false);
		expect(Object.isFrozen(snapshot.ui)).toBe(true);
	});

	it("appends resultKey after the existing key fields", () => {
		expect(UI_KEY_FIELDS).toEqual(["toggleKey", "inspectKey", "navigationDownKey", "navigationUpKey", "resultKey"]);
	});

	it.each(["off", "ctrl+shift+e", "shift+ctrl+r", "alt+r", "f2"])("accepts explicit %s", async (key) => {
		await writeUi(`ui: { resultKey: ${key} }\n`);
		const snapshot = await loadRegistry(path);
		expect(snapshot.ui.resultKey).toBe(key);
		expect(snapshot.uiDeclarations.resultKey).toBe(true);
	});

	it.each(["tab", "ctrl+i", "Ctrl+E", "ctrl+ctrl+e", "disabled", "12", "null", "[]"])(
		"rejects unsafe or invalid resultKey %s",
		async (key) => {
			await writeUi(`ui: { resultKey: ${key} }\n`);
			await expect(loadRegistry(path)).rejects.toThrow(/ui\.resultKey.*(?:unsafe|specification)/);
		},
	);

	it.each(["toggleKey", "inspectKey", "navigationDownKey", "navigationUpKey"])(
		"rejects a normalised duplicate of %s",
		async (field) => {
			await writeUi(`ui: { ${field}: ctrl+alt+r, resultKey: alt+ctrl+r }\n`);
			await expect(loadRegistry(path)).rejects.toThrow(new RegExp(`ui\\.resultKey.*duplicate.*ui\\.${field}`));
		},
	);

	it("checks other keys against the omitted result default", async () => {
		await writeUi("ui: { inspectKey: shift+ctrl+e }\n");
		await expect(loadRegistry(path)).rejects.toThrow(/ui\.resultKey.*duplicate.*ui\.inspectKey/);
	});
});
