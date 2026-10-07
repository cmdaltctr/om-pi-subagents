import { writeFixtureRegistry } from "./registry.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import omps from "../../src/index.ts";

const [modules, scenario] = process.argv.slice(2);
const load = (name, file) => import(pathToFileURL(join(resolve(modules), name, file)).href);
const tui = await load("@earendil-works/pi-tui", "dist/index.js");
const { InteractiveMode } = await load("@earendil-works/pi-coding-agent", "dist/modes/interactive/interactive-mode.js");
const { createInteractiveTui } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/tui-renderer.js",
);
const { CustomEditor } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/components/custom-editor.js",
);
const { KeybindingsManager } = await load("@earendil-works/pi-coding-agent", "dist/core/keybindings.js");
const { initTheme, getEditorTheme } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/theme/theme.js",
);
initTheme("dark", false);

class MemoryTerminal {
	columns = 100;
	rows = 40;
	kittyProtocolActive = true;
	writes = [];
	start(input) {
		this.input = input;
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
	resize() {}
}

const directory = await mkdtemp(join(tmpdir(), "omps-native-shortcuts-"));
const registry = join(directory, "omps/config.yaml");
process.env.PI_CODING_AGENT_DIR = directory;
process.env.OMPS_REGISTRY = registry;

const registryText = {
	defaults: "version: 1\nagents: {}\n",
	off: "version: 1\nui: { toggleKey: off, inspectKey: off }\nagents: {}\n",
	conflict: "version: 1\nui: { toggleKey: ctrl+o, inspectKey: alt+i }\nagents: {}\n",
	// Pi binds `shift+ctrl+o` to the session-tree filter; the same key in another order must be refused.
	reorder: "version: 1\nui: { toggleKey: ctrl+shift+o, inspectKey: alt+i }\nagents: {}\n",
	tab: "version: 1\nui: { toggleKey: tab }\nagents: {}\n",
	custom: "version: 1\nui: { toggleKey: alt+p, inspectKey: alt+q }\nagents: {}\n",
};
await writeFixtureRegistry(directory, registryText[scenario] ?? registryText.defaults);

const terminal = new MemoryTerminal();
const ui = createInteractiveTui({ terminal, tuiMode: "regular", logDirectory: directory });
const keys = new KeybindingsManager();
tui.setKeybindings(keys);
const editor = new CustomEditor(ui, getEditorTheme(), keys);

const notifications = [];
const widgets = [];
const uiContext = {
	notify: (message, level) => notifications.push({ message, level }),
	setStatus() {},
	// The tree registers beside the list; counting the list key keeps one count per fleet action.
	setWidget: (key, lines) => key === "omps" && widgets.push(lines),
	custom() {},
	select: async () => undefined,
	confirm: async () => false,
	input: async () => undefined,
	onTerminalInput: () => () => undefined,
};

const shortcuts = new Map();
const handlers = new Map();
const tools = [];
const commands = new Map();
const pi = {
	registerShortcut: (key, options) => shortcuts.set(key, options),
	on: (event, handler) => handlers.set(event, handler),
	registerTool: (definition) => tools.push(definition),
	registerCommand: (name, command) => commands.set(name, command),
	registerEntryRenderer() {},
	appendEntry() {},
	sendMessage() {},
	sendUserMessage() {},
};
omps(pi);

const ctx = {
	mode: "tui",
	hasUI: true,
	cwd: directory,
	sessionManager: { getSessionId: () => "session", getCwd: () => directory },
	ui: uiContext,
};

// A plain host object: inherited accessors would reject assignment, and only the real
// dispatch method is needed. `setupExtensionShortcuts` binds our registrations to the editor.
const host = {
	ui,
	keybindings: keys,
	defaultEditor: editor,
	createExtensionUIContext: () => uiContext,
	sessionManager: ctx.sessionManager,
	session: {
		model: undefined,
		scopedModels: new Map(),
		thinkingLevel: "off",
		isIdle: true,
		agent: { signal: undefined },
		pendingMessageCount: 0,
		getContextUsage: () => undefined,
		compact: async () => undefined,
		systemPrompt: "",
	},
	settingsManager: { isProjectTrusted: () => true },
	showError: (message) => notifications.push({ message, level: "error" }),
};
ui.addChild(editor);
ui.setFocus(editor);
ui.start();

const sessionStart = async () => {
	await handlers.get("session_start")({ type: "session_start", reason: "startup" }, ctx);
};
const flush = async () => {
	await new Promise((done) => setTimeout(done, 10));
	ui.renderNow();
};
/** A real run-manager touch so the runtime exists; listing an empty registry starts no process. */
const createRuntime = async () => {
	const tool = tools.find((definition) => definition.name === "omps");
	await tool.execute("shortcut-probe", { action: "list" }, undefined, undefined, ctx);
};
// A tab-misconfigured registry is invalid, so no launch-facing action can create the runtime here.
const widgetCount = () => widgets.length;

try {
	await sessionStart();
	if (scenario !== "tab") await createRuntime();
	await flush();
	// Real host order: session_start registers the shortcuts, then the editor binds them.
	const bindShortcuts = () =>
		InteractiveMode.prototype.setupExtensionShortcuts.call(host, {
			getShortcuts: () => shortcuts,
			getModelRegistry: () => ({}),
		});
	bindShortcuts();
	const initial = widgetCount();

	if (scenario === "defaults" || scenario === "tab" || scenario === "off") {
		// Shipped defaults bind no key; a tab-misconfigured registry falls back to them without binding Tab.
		assert.equal(shortcuts.size, 0, "defaults and off must register no shortcut");
		assert.equal(shortcuts.size, 0, "off must register no shortcut");
		terminal.input("\x1b[111;3u");
		await flush();
		assert.equal(widgetCount(), initial, "alt+o must reach the editor untouched");
	} else if (scenario === "conflict") {
		assert.deepEqual([...shortcuts.keys()], ["alt+i"], "ctrl+o must stay with the host action");
		assert(
			notifications.some(({ message, level }) => level === "warning" && /ctrl\+o.*built-in/.test(message)),
			"the refusal must be surfaced with guidance",
		);
		terminal.input("\x0f");
		await flush();
		assert.equal(widgetCount(), initial, "native ctrl+o must not run an OMPS action");
	} else if (scenario === "reorder") {
		assert.deepEqual([...shortcuts.keys()], ["alt+i"], "ctrl+shift+o must stay with the host action");
		assert(
			notifications.some(({ message, level }) => level === "warning" && /ctrl\+shift\+o.*built-in/.test(message)),
			"the reordered refusal must be surfaced with guidance",
		);
	} else if (scenario === "custom" || scenario === "reload") {
		if (scenario === "reload") {
			assert.equal(shortcuts.size, 0, "initial bind uses the keyless defaults");
			await writeFile(registry, registryText.custom);
			// `/reload` runs session_start again, then the host binds the new registrations.
			await sessionStart();
			bindShortcuts();
		}
		assert(shortcuts.has("alt+p"), "the configured fleet key must bind");
		terminal.input("\x1b[112;3u");
		await flush();
		const afterPress = widgetCount();
		assert.equal(afterPress, initial + 1, "the configured key must run the fleet action");
		terminal.input("\x1b[112;3:3u");
		await flush();
		assert.equal(widgetCount(), afterPress, "release must stay guarded");
		terminal.input("\x1b[113;3u");
		await flush();
		assert.equal(widgetCount(), afterPress, "the configured inspect key must not toggle the fleet");
	}
	await handlers.get("session_shutdown")();
} finally {
	ui.stop();
	await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ scenario, verified: true }));
