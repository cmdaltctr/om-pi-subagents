import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installExtension, type Installed } from "./fixtures/install.ts";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";

let installed: Installed | undefined;
afterEach(async () => {
	await installed?.cleanup();
	installed = undefined;
});

describe.skipIf(!PI_AVAILABLE)("canonical run storage", () => {
	it.each([false, true])("creates private new evidence and preserves old storage (seeded: %s)", async (seeded) => {
		installed = await installExtension();
		const { fixture } = installed;
		const oldRoot = join(fixture.agentDir, "ompss", "runs");
		const oldFile = join(oldRoot, "old-session", "old-run", "status.json");
		const evidence = Buffer.from('{"directory":"/historical/ompss/runs/old-session/old-run"}\n');
		if (seeded) {
			await mkdir(join(oldRoot, "old-session", "old-run"), { recursive: true, mode: 0o700 });
			await writeFile(oldFile, evidence, { mode: 0o600 });
		}
		await writeFile(join(fixture.agentDir, "reader.md"), "Read only.");
		await writeFile(
			join(fixture.agentDir, "om-pi-subagents.yaml"),
			"version: 1\nagents:\n  reader:\n    persona: reader.md\n    tools: []\n    thinking: off\n",
		);
		fixture.model.script = [{ text: "SAVED ANSWER" }];
		await fixture.send({ type: "prompt", message: "/omps run reader Inspect storage" });
		const notice = await fixture.waitFor(
			(record) =>
				record.type === "extension_ui_request" && record.method === "notify" && /Started run/.test(record.message),
		);
		const root = join(fixture.agentDir, "omps", "runs");
		expect(notice.message).toContain(root);
		await fixture.waitFor((record) => record.type === "message_start" && record.message?.customType === "omps-result");
		const [session] = await readdir(root);
		const [run] = await readdir(join(root, session));
		const directory = join(root, session, run);
		expect(await readFile(join(directory, "output.md"), "utf8")).toBe("SAVED ANSWER");
		for (const path of [root, join(root, session), directory]) expect((await stat(path)).mode & 0o777).toBe(0o700);
		for (const file of await readdir(directory)) expect((await stat(join(directory, file))).mode & 0o777).toBe(0o600);
		if (seeded) {
			expect(await readFile(oldFile)).toEqual(evidence);
			expect(await readdir(oldRoot)).toEqual(["old-session"]);
		} else await expect(stat(oldRoot)).rejects.toMatchObject({ code: "ENOENT" });
	});
});
