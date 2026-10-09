import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import fakeProvider from "./fake-provider-extension.ts";

const [hostModules, scenario, source] = process.argv.slice(2);
const modules = resolve(hostModules);
const load = (name, file) => import(pathToFileURL(join(modules, name, file)).href);
const sdk = await load("@earendil-works/pi-coding-agent", "dist/index.js");
const tui = await load("@earendil-works/pi-tui", "dist/index.js");
const themeState = await load("@earendil-works/pi-coding-agent", "dist/modes/interactive/theme/theme.js");
const { InteractiveMode } = await load("@earendil-works/pi-coding-agent", "dist/modes/interactive/interactive-mode.js");
const { default: omps } = await import(pathToFileURL(source).href);

// Same disposable Terminal contract as interactive-host/interactive-shortcuts.
// All session, extension, component, repaint and editor dispatch code belongs to real Pi.
class MemoryTerminal {
	columns = 240;
	rows = 180;
	kittyProtocolActive = scenario !== "nonkitty";
	writes = [];
	start(input, resize) {
		this.input = input;
		this.resize = resize;
		tui.setKittyProtocolActive(this.kittyProtocolActive);
	}
	stop() {}
	async drainInput() {}
	write(data) {
		this.writes.push(data);
	}
	moveBy() {}
	hideCursor() {}
	showCursor() {}
	clearLine() {}
	clearFromCursor() {}
	clearScreen() {}
	setTitle() {}
	setProgress() {}
	setProgramStatus() {}
}

const cwd = process.cwd();
const agentDir = process.env.PI_CODING_AGENT_DIR;
const terminal = new MemoryTerminal();
const sessionManager = sdk.SessionManager.inMemory(cwd);
const resultContent = (name) =>
	`OMPS run history-${name} (reader) completed.\nFiles: /disposable/history-${name}\nResult:\n` +
	Array.from({ length: 20 }, (_, index) => `${name} result line ${String(index + 1).padStart(2, "0")}`).join("\n");
if (scenario === "historical")
	for (const name of ["ONE", "TWO"]) sessionManager.appendCustomMessageEntry("omps-result", resultContent(name), true);

const services = await sdk.createAgentSessionServices({
	cwd,
	agentDir,
	resourceLoaderOptions: {
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		extensionFactories: [
			omps,
			fakeProvider,
			(pi) => {
				pi.registerTool({
					name: "result_fixture_tool",
					label: "Unrelated tool",
					description: "Return unrelated long output for native host expansion checks.",
					parameters: { type: "object", properties: {} },
					execute: async () => ({
						content: [
							{ type: "text", text: Array.from({ length: 15 }, (_, i) => `UNRELATED line ${i + 1}`).join("\n") },
						],
						details: undefined,
					}),
				});
			},
		],
	},
});
assert.deepEqual(services.resourceLoader.getExtensions().errors, [], "real extension loading must succeed");
assert(!services.diagnostics.some((item) => item.type === "error"), JSON.stringify(services.diagnostics));
const created = await sdk.createAgentSessionFromServices({
	services,
	sessionManager,
	model: services.modelRuntime.getModel("virt", "m"),
	thinkingLevel: "off",
	tools: ["omps", "result_fixture_tool"],
});
const runtime = new sdk.AgentSessionRuntime(created.session, services, async () => {
	throw new Error("this fixture never replaces its session");
});
const host = new InteractiveMode(runtime, { terminal, tuiMode: scenario === "fullscreen" ? "fullscreen" : "regular" });
const session = runtime.session;
let turns = 0;
let settled = 0;
const unsubscribe = session.subscribe((event) => {
	if (event.type === "agent_start") turns++;
	if (event.type === "agent_settled") settled++;
});
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const paintedRows = () => host.renderer.previousLines ?? host.renderer.previousScreen;
const frame = () => paintedRows().map(stripVTControlCharacters).join("\n");
const messages = () =>
	session.messages.filter((message) => message.role === "custom" && message.customType === "omps-result");
const waitFor = async (condition, description) => {
	for (let elapsed = 0; !condition(); elapsed += 25) {
		assert(elapsed < 25_000, `${description}; painted frame:\n${frame()}`);
		await sleep(25);
	}
};
const cards = () => host.chatContainer.children.filter((component) => component.message?.customType === "omps-result");
const hookPresent = () =>
	host.extensionWidgetsAbove.has("omps-result-render") || host.extensionWidgetsBelow.has("omps-result-render");
const styled = () => {
	const rows = paintedRows().filter((row) => /OMPS run |result line \d/.test(stripVTControlCharacters(row)));
	assert(rows.length > 0, "result rows must be present for colour checks");
	for (const row of rows) {
		assert(
			row.includes(themeState.theme.getBgAnsi("customMessageBg")),
			"result rows must use the custom-message background",
		);
		assert(!row.includes(themeState.theme.getFgAnsi("warning")), "the result body must not inherit the hint colour");
	}
	for (const row of paintedRows().filter((line) => line.includes("12 more lines"))) {
		const hint = stripVTControlCharacters(row).trim();
		assert(row.includes(themeState.theme.getBgAnsi("customMessageBg")), "fold hints must keep the panel background");
		assert(
			row.includes(`${themeState.theme.getFgAnsi("warning")}${hint}\x1b[39m`),
			"the entire fold hint must use the warning foreground",
		);
	}
};
const folded = (names) => {
	const painted = frame();
	for (const name of names) {
		assert(
			painted.includes(`${name} result line 01`),
			`the first result line stays visible (${name}); messages: ${JSON.stringify(messages())}; frame:\n${painted}`,
		);
		assert(painted.includes(`${name} result line 08`), "the collapsed preview contains eight result lines");
		assert(!painted.includes(`${name} result line 20`), `fold must hide ${name} result line 20 in Pi's painted frame`);
	}
	assert.equal(
		(painted.match(/12 more lines/g) ?? []).length,
		names.length,
		"each retained result needs its own fold hint",
	);
	styled();
};
const expanded = (names) => {
	for (const name of names)
		assert(frame().includes(`${name} result line 20`), `native repaint must expand retained ${name}`);
	assert(!frame().includes("12 more lines"), "expanded results must remove their fold hint");
	styled();
};
const key = async (data) => {
	terminal.input(data);
	// Let the real requestRender scheduler paint. Never invalidate or force renderNow here.
	await sleep(160);
};
const run = async (task, count) => {
	const nextSettled = settled + 1;
	await session.prompt(`/omps run reader ${task}`);
	await waitFor(
		() => messages().length === count && settled >= nextSettled && session.isIdle,
		"real OMPS child must finish and deliver",
	);
	await sleep(100);
	const message = messages().at(-1);
	assert.equal(
		message.details.state,
		"completed",
		`child must complete: ${message.content}; stderr: ${await readFile(join(message.details.directory, "stderr.log"), "utf8")}`,
	);
};
let disposed = false;
let shutdownClearedHook = false;
// Observe the real runtime boundary before the host's automatic UI reset can hide a leaked hook.
const resetUI = runtime.beforeSessionInvalidate;
runtime.setBeforeSessionInvalidate(() => {
	assert(!hookPresent(), "session_shutdown must detach the result redraw hook before host reset");
	shutdownClearedHook = true;
	resetUI?.();
});
let report;
try {
	await host.init();
	await sleep(160);
	if (scenario !== "historical") {
		await session.prompt("UNRELATED TOOL PLEASE");
		await run("result-one", 1);
		await run("result-two", 2);
	}
	folded(["ONE", "TWO"]);
	for (const message of messages()) {
		assert(frame().includes(message.content.split("\n")[0]), "the result heading must be painted");
		assert(frame().includes(message.content.split("\n")[1]), "the result file location must be painted");
	}
	const hostKey = scenario === "remapped" ? "\x19" : "\x0f";
	const resultKey = scenario === "remapped" ? "alt+r" : "ctrl+shift+e";
	const sequence = scenario === "remapped" ? "\x1b[114;3u" : scenario === "nonkitty" ? "\x1b[27;6;69~" : "\x1b[101;6u";
	const hostHint = scenario === "remapped" ? "ctrl+y" : "ctrl+o";
	assert(frame().toLowerCase().includes(hostHint), "the hint must name Pi's effective host expansion key");
	const retained = cards();
	assert.equal(retained.length, 2, "native CustomMessageComponents must retain both results");
	if (scenario === "historical") {
		const oldBackground = themeState.theme.getBgAnsi("customMessageBg");
		const oldWarning = themeState.theme.getFgAnsi("warning");
		assert(themeState.setTheme("light").success, "the host must load its light theme");
		await sleep(160);
		folded(["ONE", "TWO"]);
		assert.notEqual(themeState.theme.getBgAnsi("customMessageBg"), oldBackground);
		assert.notEqual(themeState.theme.getFgAnsi("warning"), oldWarning);
		for (const row of paintedRows().filter((line) => line.includes("12 more lines"))) {
			assert(!row.includes(oldBackground), "theme redraw must remove the old panel background");
			assert(!row.includes(oldWarning), "theme redraw must remove the old hint foreground");
		}
		for (const card of cards()) {
			const rows = card.render(24);
			const start = rows.findIndex((row) => stripVTControlCharacters(row).includes("…"));
			assert(start >= 0, "narrow results must retain a fold hint");
			const hintRows = rows.slice(start, -1);
			assert(hintRows.length > 1, "narrow fold hints must wrap");
			for (const row of hintRows) {
				assert(tui.visibleWidth(row) <= 24, "narrow hint rows must fit their width");
				assert(row.includes(themeState.theme.getBgAnsi("customMessageBg")), "wrapped hints must keep the background");
				assert(row.includes(themeState.theme.getFgAnsi("warning")), "wrapped hints must keep the warning foreground");
			}
		}
		assert(themeState.setTheme("dark").success);
		await sleep(160);
		folded(["ONE", "TWO"]);
		for (const [index, card] of cards().entries())
			assert.strictEqual(card, retained[index], "theme redraw must retain native message components");
	}
	const initialTurns = turns;
	const initialMessages = session.messages.length;
	const active = !["host", "off", "conflict"].includes(scenario);
	if (active) {
		assert(
			session.extensionRunner.getShortcuts(host.keybindings.getResolvedBindings()).has(resultKey),
			`real Pi must register ui.resultKey ${resultKey}`,
		);
		assert(frame().toLowerCase().includes(resultKey), "fold hint must name the active result key");
		assert(hookPresent(), "session_start must capture the real redraw hook before any lazy run runtime");
		if (scenario === "nonkitty")
			assert(
				/unverified|not (?:confirmed|verified)/i.test(frame()),
				"non-kitty terminals need unverified extended-key guidance",
			);
		const writes = terminal.writes.length;
		await key(sequence);
		expanded(["ONE", "TWO"]);
		assert(terminal.writes.length > writes, "the shortcut must write a repaint to the terminal");
		assert(!frame().includes("UNRELATED line 15"), "OMPS expansion must leave unrelated native tool output folded");
		assert.equal(host.toolOutputExpanded, false, "OMPS must not enable the host expansion state");
		if (!["nonkitty", "remapped"].includes(scenario)) {
			await key("\x1b[101;6:3u");
			expanded(["ONE", "TWO"]);
		}
		await key(sequence);
		folded(["ONE", "TWO"]);

		// Raw Ctrl+E must still move the real editor cursor to line end, without toggling results.
		host.editor.setText("legacy editor text");
		await key("\x01");
		assert.equal(host.editor.getCursor().col, 0);
		await key("\x05");
		assert.equal(
			host.editor.getCursor().col,
			"legacy editor text".length,
			"raw Ctrl+E must dispatch to native lineEnd",
		);
		folded(["ONE", "TWO"]);
		host.editor.setText("");
	} else if (scenario === "off") {
		assert(
			!session.extensionRunner.getShortcuts(host.keybindings.getResolvedBindings()).has("ctrl+shift+e"),
			"off must register no result shortcut",
		);
		assert(!frame().toLowerCase().includes("ctrl+shift+e to expand"));
		assert(!hookPresent(), "off needs no result redraw hook");
	} else if (scenario === "conflict") {
		assert(
			!session.extensionRunner.getShortcuts(host.keybindings.getResolvedBindings()).has("ctrl+o"),
			"the conflicting key must remain with Pi",
		);
		assert(
			/ctrl\+o.*built-in.*app\.tools\.expand/i.test(frame()),
			"conflicts need guidance naming the effective Pi owner",
		);
	}

	if (scenario === "remapped") {
		await key("\x0f");
		folded(["ONE", "TWO"]);
		assert.equal(host.toolOutputExpanded, false, "the old host key must stop expanding results");
	}
	await key(hostKey);
	expanded(["ONE", "TWO"]);
	assert.equal(host.toolOutputExpanded, true);
	if (scenario !== "historical")
		assert(frame().includes("UNRELATED line 15"), "the host action still expands unrelated tools");
	if (active) {
		await key(sequence); // Both flags enabled.
		expanded(["ONE", "TWO"]);
		await key(hostKey); // OMPS flag alone remains enabled.
		expanded(["ONE", "TWO"]);
		assert(!frame().includes("UNRELATED line 15"), "host collapse must remain independent from OMPS expansion");
		await key(sequence);
		folded(["ONE", "TWO"]);
		await key(hostKey);
		await key(sequence);
		await key(sequence); // Clearing OMPS must leave the host flag enabled.
		expanded(["ONE", "TWO"]);
		assert.equal(host.toolOutputExpanded, true);
	}
	assert.equal(turns, initialTurns, "all expansion and editor actions must avoid a model turn");
	assert.equal(session.messages.length, initialMessages, "redraw must not replace or append transcript messages");
	assert.equal(cards().length, retained.length);
	for (const [index, component] of cards().entries())
		assert.strictEqual(component, retained[index], "existing native message components must survive shortcut redraws");
	const turnsAfterKeys = turns;
	if (scenario !== "historical") {
		await run("result-three", 3);
		expanded(["ONE", "TWO", "THREE"]);
		assert.equal(host.toolOutputExpanded, true, "new results inherit active native host expansion");
	}
	await key(hostKey);
	folded(scenario === "historical" ? ["ONE", "TWO"] : ["ONE", "TWO", "THREE"]);
	report = { verified: true, scenario, turnsBeforeKeys: initialTurns, turnsAfterKeys, messages: messages() };
	// Emit real session_shutdown while the host still exists, before host-owned UI reset can mask a leaked hook.
	await runtime.dispose();
	disposed = true;
	assert(shutdownClearedHook, "the native shutdown boundary must be observed");
	report.shutdownClearedHook = shutdownClearedHook;
} finally {
	if (!disposed) await runtime.dispose();
	unsubscribe();
	host.stop();
}
const manifest = JSON.parse(await readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8"));
console.log(`RESULT_MESSAGE_REPORT ${JSON.stringify({ ...report, version: manifest.version })}`);
