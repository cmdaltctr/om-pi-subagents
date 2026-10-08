import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRegistryStore, loadRegistry } from "../src/config.ts";

let root: string;
let path: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), "omps-navigation-config-"));
	path = join(root, "config.yaml");
});
afterEach(async () => rm(root, { recursive: true, force: true }));
const writeUi = (value: string) => writeFile(path, `version: 1\nagents: {}\nui: ${value}\n`);

describe("management configuration", () => {
	it("defaults and freezes visibility, navigation and declarations independently", async () => {
		await writeUi("{}");
		const first = await loadRegistry(path);
		expect(first.ui).toMatchObject({ showManagementList: true, navigationDownKey: "down", navigationUpKey: "up" });
		expect(first.uiDeclarations).toMatchObject({
			showManagementList: false,
			navigationDownKey: false,
			navigationUpKey: false,
		});
		await writeUi("{ showManagementList: false, navigationDownKey: off, navigationUpKey: ctrl+shift+up }");
		const second = await loadRegistry(path);
		expect(second.ui).toMatchObject({
			showManagementList: false,
			navigationDownKey: "off",
			navigationUpKey: "ctrl+shift+up",
		});
		expect(second.uiDeclarations).toMatchObject({
			showManagementList: true,
			navigationDownKey: true,
			navigationUpKey: true,
		});
		expect(Object.isFrozen(second.ui)).toBe(true);
		expect(Object.isFrozen(second.uiDeclarations)).toBe(true);
		expect(first.ui.showManagementList).toBe(true);
	});

	it.each(['"false"', "0", "null", "[]", "{}"])("requires boolean visibility: %s", async (value) => {
		await writeUi(`{ showManagementList: ${value} }`);
		await expect(loadRegistry(path)).rejects.toThrow(/ui\.showManagementList.*boolean/);
	});

	it("drops launch configuration after an invalid visibility refresh", async () => {
		await writeUi("{}");
		const store = createRegistryStore(path);
		await store.refresh();
		await writeUi('{ showManagementList: "false" }');
		await expect(store.refresh()).rejects.toThrow(/boolean/);
		expect(() => store.list()).toThrow(/showManagementList/);
	});

	it.each(["navigationDownKey", "navigationUpKey"] as const)("validates %s", async (field) => {
		for (const key of ["off", "ctrl+shift+down", "shift+ctrl+up", "alt+p", "f2"]) {
			await writeUi(`{ ${field}: ${key} }`);
			expect((await loadRegistry(path)).ui[field]).toBe(key);
		}
		for (const key of ["tab", "ctrl+i", "Ctrl+P", "ctrl+ctrl+p", "invalid", "12", "null", "[]"]) {
			await writeUi(`{ ${field}: ${key} }`);
			await expect(loadRegistry(path)).rejects.toThrow(new RegExp(`ui\\.${field}.*key|ui\\.${field}.*unsafe`));
		}
	});

	const fields = ["toggleKey", "inspectKey", "navigationDownKey", "navigationUpKey"];
	it.each(fields.flatMap((a, i) => fields.slice(i + 1).map((b) => [a, b])))(
		"rejects normalised duplicates %s/%s",
		async (a, b) => {
			await writeUi(`{ ${a}: ctrl+alt+p, ${b}: alt+ctrl+p }`);
			await expect(loadRegistry(path)).rejects.toThrow(new RegExp(`ui\\.${b}.*duplicate.*ui\\.${a}`));
		},
	);

	it("checks keys against omitted arrow defaults", async () => {
		await writeUi("{ toggleKey: down }");
		await expect(loadRegistry(path)).rejects.toThrow(/navigationDownKey.*duplicate.*toggleKey/);
	});
});
