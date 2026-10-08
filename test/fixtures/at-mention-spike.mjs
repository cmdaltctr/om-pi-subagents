import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { createWorkspace } from "./pi-rpc.ts";
import { createAtMentionHost } from "./at-mention-host.mjs";

const modules = resolve(process.argv[2]);
const sdk = await import(pathToFileURL(join(modules, "@earendil-works/pi-coding-agent/dist/index.js")).href);
const workspace = await createWorkspace({ mcp: false });
Object.assign(process.env, workspace.isolationEnv);
let native;
let session;
const evidence = {};
try {
	await writeFile(join(workspace.cwd, "reader.md"), "fixture file");
	await writeFile(join(workspace.cwd, "README.md"), "fixture readme");
	const settingsManager = sdk.SettingsManager.inMemory({ enableSkillCommands: false });
	const resourceLoader = new sdk.DefaultResourceLoader({
		cwd: workspace.cwd,
		agentDir: workspace.agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noThemes: true,
		noPromptTemplates: true,
		noContextFiles: true,
		extensionFactories: [
			(pi) =>
				pi.on("session_start", (_event, ctx) => {
					assert.equal(ctx.mode, "tui");
					ctx.ui.addAutocompleteProvider((next) => ({
						triggerCharacters: ["@"],
						async getSuggestions(lines, line, col, options) {
							const own = await next.getSuggestions(lines, line, col, options);
							const prefix = lines[line].slice(0, col);
							if (line !== 0 || !/^@\S*$/.test(prefix) || (own && own.prefix !== prefix)) return own;
							return { prefix, items: [{ value: "@reader", label: "reader" }, ...(own?.items ?? [])] };
						},
						applyCompletion: (...args) => next.applyCompletion(...args),
						shouldTriggerFileCompletion: (...args) => next.shouldTriggerFileCompletion?.(...args) ?? false,
					}));
				}),
		],
	});
	await resourceLoader.reload();
	({ session } = await sdk.createAgentSession({
		cwd: workspace.cwd,
		agentDir: workspace.agentDir,
		settingsManager,
		resourceLoader,
		sessionManager: sdk.SessionManager.inMemory(workspace.cwd),
		thinkingLevel: "off",
		tools: [],
	}));
	native = await createAtMentionHost(modules, session, workspace.cwd);
	const options = { signal: new AbortController().signal };
	const base = await native.host.autocompleteProvider.getSuggestions(["@"], 0, 1, options);
	assert(base?.items.length >= 2, "real file items must exist before the wrapper");
	await session.bindExtensions({ uiContext: native.host.createExtensionUIContext(), mode: "tui" });
	const merged = await native.host.autocompleteProvider.getSuggestions(["@"], 0, 1, options);
	assert.equal(merged.prefix, base.prefix);
	assert.deepEqual(merged.items.slice(1), base.items);
	evidence.fileOrder = base.items.map((item) => item.value);
	evidence.mergedLabels = merged.items.map((item) => item.label);
	native.terminal.input("@");
	// Await the native editor's asynchronous completion query before selecting with Tab.
	for (let attempts = 0; !native.editor.isShowingAutocomplete(); attempts++) {
		assert(attempts < 200, "native completion menu must appear");
		await new Promise((done) => setTimeout(done, 10));
	}
	native.terminal.input("\t");
	assert.equal(native.editor.getText(), "@reader ");
	assert.equal(native.editor.getCursor().col, 8);
	evidence.applied = { text: native.editor.getText(), cursor: native.editor.getCursor() };
	await native.submit(" @reader inspect this ");
	assert.equal(native.submitted.at(-1), "@reader inspect this");
	evidence.submitted = native.submitted.at(-1);
	evidence.version = JSON.parse(
		await (
			await import("node:fs/promises")
		).readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8"),
	).version;
	console.log(JSON.stringify(evidence));
} finally {
	native?.stop();
	session?.dispose();
	await workspace.dispose();
}
