// Follows the README's setup steps in a fresh copy of the extension: an empty registry first,
// then one custom mapping taken from the README itself. Uses a real parent Pi and a real child.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe as suite, expect, it } from "vitest";
import { PI_AVAILABLE } from "./fixtures/pi-rpc.ts";
const describe = suite.skipIf(!PI_AVAILABLE);
import type { Turn } from "./fixtures/fake-model.ts";
import { installExtension, type Installed } from "./fixtures/install.ts";
import type { PiFixture } from "./fixtures/pi-rpc.ts";

const README = await readFile(join(fileURLToPath(new URL("..", import.meta.url)), "README.md"), "utf8");

/** The code block that follows a `<!-- docs-test: name -->` marker. Blank lines in between are formatter noise. */
function block(name: string): string {
	const match = new RegExp(`<!-- docs-test: ${name} -->\\s*\`\`\`\\w*\\n([\\s\\S]*?)\`\`\``).exec(README);
	if (!match) throw new Error(`README has no docs-test block "${name}"`);
	return match[1];
}

afterEach(async () => {
	await installedHandle?.cleanup();
	installedHandle = undefined;
});

const waitFor = async (condition: () => boolean | Promise<boolean>, ms = 30_000) => {
	for (let waited = 0; !(await condition()); waited += 50) {
		if (waited > ms) throw new Error("condition not met in time");
		await new Promise((done) => setTimeout(done, 50));
	}
};

let installedHandle: Installed | undefined;
async function install() {
	installedHandle = await installExtension();
	return { installed: installedHandle.installed, fixture: installedHandle.fixture };
}

const notices = (fixture: PiFixture) =>
	fixture.records
		.filter((r) => r.type === "extension_ui_request" && r.method === "notify")
		.map((r) => r.message as string);

describe("README setup steps", () => {
	it("opens /omps-settings through native dialogs without starting a model request", async () => {
		const { fixture } = await install();
		const pending = fixture.send({ type: "prompt", message: "/omps-settings" });
		const dialog = await fixture.waitFor(
			(record) => record.type === "extension_ui_request" && record.method === "select",
		);
		expect(dialog.title).toMatch(/^OMPS settings/);
		fixture.child.stdin!.write(`${JSON.stringify({ type: "extension_ui_response", id: dialog.id, value: "Done" })}\n`);
		expect((await pending).data.disposition).toBe("handled");
		expect(fixture.model.requests).toHaveLength(0);
	});

	it("an empty registry lists no personas, then the README mapping makes `reader` available and runnable", async () => {
		const { fixture } = await install();

		// Step 4: a new install answers that nothing is mapped.
		expect((await fixture.send({ type: "prompt", message: "/omps list" })).data.disposition).toBe("handled");
		await waitFor(() => notices(fixture).includes("No personas mapped."));

		// "Add your first agent": the persona and mapping come straight from the README.
		await mkdir(join(fixture.agentDir, "omps", "personas"), { recursive: true });
		await writeFile(join(fixture.agentDir, "omps", "personas", "reader.md"), block("persona"));
		await writeFile(join(fixture.agentDir, "omps/config.yaml"), block("yaml"));

		await fixture.send({ type: "prompt", message: "/omps list" });
		await waitFor(() => notices(fixture).some((text) => /^reader: 4 tools \(read-only\)$/.test(text)));

		// Start a run, as the README says, and wait for the result.
		fixture.model.script = (body): Turn =>
			JSON.stringify(body).includes("You read files and answer") ? { text: "CHILD DONE" } : { text: "parent ok" };
		await fixture.send({ type: "prompt", message: "/omps run reader Summarise the README" });
		const runs = join(fixture.agentDir, "omps", "runs");
		const latest = async () => {
			const [session] = await readdir(runs).catch(() => []);
			const [run] = session ? await readdir(join(runs, session)) : [];
			return run ? join(runs, session, run) : undefined;
		};
		await waitFor(async () => {
			const directory = await latest();
			return (
				!!directory &&
				(await readFile(join(directory, "status.json"), "utf8").catch(() => "{}")).includes('"completed"')
			);
		});
		const directory = (await latest())!;
		expect(await readFile(join(directory, "output.md"), "utf8")).toBe("CHILD DONE");
		expect(await readFile(join(directory, "persona.md"), "utf8")).toBe(block("persona"));
	});

	it("a mapping that lists the obsolete `mcp` tool fails before the model sees the task", async () => {
		const { fixture } = await install();
		await mkdir(join(fixture.agentDir, "omps", "personas"), { recursive: true });
		await writeFile(join(fixture.agentDir, "omps", "personas", "reader.md"), block("persona"));
		await writeFile(
			join(fixture.agentDir, "omps/config.yaml"),
			block("yaml").replace("[read, grep, find, ls]", "[read, mcp]"),
		);
		await fixture.send({ type: "prompt", message: "/omps run reader go" });
		const runs = join(fixture.agentDir, "omps", "runs");
		await waitFor(async () => {
			const [session] = await readdir(runs).catch(() => []);
			const [run] = session ? await readdir(join(runs, session)) : [];
			return (
				!!run && (await readFile(join(runs, session, run, "status.json"), "utf8").catch(() => "")).includes('"failed"')
			);
		});
		const [session] = await readdir(runs);
		const [run] = await readdir(join(runs, session));
		expect(JSON.parse(await readFile(join(runs, session, run, "status.json"), "utf8")).error).toMatch(
			/obsolete MCP proxy.*mcp__<server>__<tool>/,
		);
		// The parent wakes for the failure notice. No request carries the child's persona or task.
		expect(
			fixture.model.requests.filter((request) => JSON.stringify(request).includes("You read files and answer")),
		).toEqual([]);
	});
});
