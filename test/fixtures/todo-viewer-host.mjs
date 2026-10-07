import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Use Pi's actual widget, dialog, overlay and input dispatch with an in-memory terminal. */
export async function createTodoViewerHost(modules, mode, directory) {
	const load = (name, file) => import(pathToFileURL(join(resolve(modules), name, file)).href);
	const tui = await load("@earendil-works/pi-tui", "dist/index.js");
	const { InteractiveMode } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/interactive-mode.js",
	);
	const { createInteractiveTui } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/tui-renderer.js",
	);
	const { CustomEditor } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/components/custom-editor.js",
	);
	const { ToolExecutionComponent } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/components/tool-execution.js",
	);
	const { CustomEntryComponent } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/components/custom-entry.js",
	);
	const { KeybindingsManager } = await load("@earendil-works/pi-coding-agent", "dist/core/keybindings.js");
	const { SessionManager } = await load("@earendil-works/pi-coding-agent", "dist/core/session-manager.js");
	const { initTheme, getEditorTheme } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/theme/theme.js",
	);
	initTheme("dark", false);
	class MemoryTerminal {
		columns = 100;
		rows = 45;
		kittyProtocolActive = false;
		start(input, resize) {
			this.input = input;
			this.resize = resize;
		}
		stop() {}
		async drainInput() {}
		write() {}
		moveBy() {}
		hideCursor() {}
		showCursor() {}
		clearLine() {}
		clearFromCursor() {}
		clearScreen() {}
		setTitle() {}
		setProgress() {}
	}
	const terminal = new MemoryTerminal();
	const ui = createInteractiveTui({ terminal, tuiMode: mode, logDirectory: directory });
	const keys = new KeybindingsManager();
	tui.setKeybindings(keys);
	const editor = new CustomEditor(ui, getEditorTheme(), keys);
	const notifications = [];
	const host = Object.create(InteractiveMode.prototype);
	Object.assign(host, {
		ui,
		keybindings: keys,
		defaultEditor: editor,
		editor,
		editorContainer: new tui.Container(),
		loadedResourcesContainer: new tui.Container(),
		chatContainer: new tui.Container(),
		widgetContainerAbove: new tui.Container(),
		widgetContainerBelow: new tui.Container(),
		extensionWidgetsAbove: new Map(),
		extensionWidgetsBelow: new Map(),
		// The real terminal-input listener path needs its subscription set on the host.
		extensionTerminalInputSubscriptions: new Set(),
		toolOutputExpanded: false,
		isBashMode: false,
		footerDataProvider: { setExtensionStatus() {} },
		showStatus: (message) => notifications.push({ message, level: "info" }),
		showWarning: (message) => notifications.push({ message, level: "warning" }),
		showError: (message) => notifications.push({ message, level: "error" }),
	});
	host.editorContainer.addChild(editor);
	host.setupKeyHandlers();
	ui.addChild(host.chatContainer);
	ui.addChild(host.widgetContainerAbove);
	ui.addChild(host.editorContainer);
	ui.setFocus(editor);
	ui.start();
	const flush = async () => {
		await new Promise((done) => setTimeout(done, 10));
		ui.renderNow();
	};
	const wait = async (predicate, label) => {
		const deadline = Date.now() + 15_000;
		while (!predicate() && Date.now() < deadline) await flush();
		assert(predicate(), `Timed out waiting for ${label}`);
	};
	const choose = async (index) => {
		await wait(() => host.extensionSelector, "native selector");
		for (let row = 0; row < index; row++) terminal.input("\x1b[B");
		terminal.input("\r");
		await flush();
	};
	const edit = async (index, value, confirm = true) => {
		await choose(index);
		await wait(() => host.extensionInput, "native input");
		terminal.input(value);
		terminal.input("\r");
		await flush();
		await choose(confirm ? 0 : 1);
	};
	return {
		host,
		ui,
		terminal,
		editor,
		keys,
		notifications,
		flush,
		wait,
		choose,
		edit,
		SessionManager,
		card: (tool, result) => {
			const card = new ToolExecutionComponent("omps", "launch", {}, {}, tool, ui, directory);
			card.updateResult(result);
			host.chatContainer.addChild(card);
			return card;
		},
		entry: (data, renderer) => {
			const entry = new CustomEntryComponent({ customType: "omps-tree", data }, renderer);
			host.chatContainer.addChild(entry);
			return entry;
		},
	};
}
