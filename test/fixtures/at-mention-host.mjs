import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Bind the real interactive host and editor to a disposable terminal device. */
export async function createAtMentionHost(modules, session, cwd) {
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
	const { KeybindingsManager } = await load("@earendil-works/pi-coding-agent", "dist/core/keybindings.js");
	const { initTheme, getEditorTheme } = await load(
		"@earendil-works/pi-coding-agent",
		"dist/modes/interactive/theme/theme.js",
	);
	initTheme("dark", false);
	class MemoryTerminal {
		columns = 100;
		rows = 40;
		kittyProtocolActive = false;
		start(input) {
			this.input = input;
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
	const ui = createInteractiveTui({ terminal, tuiMode: "regular", logDirectory: cwd });
	const keys = new KeybindingsManager();
	tui.setKeybindings(keys);
	const editor = new CustomEditor(ui, getEditorTheme(), keys);
	const notifications = [];
	const submitted = [];
	const pending = [];
	let fdPath = spawnSync("which", ["fd"], { encoding: "utf8", shell: false }).stdout?.trim();
	if (!fdPath) {
		// Linux CI can exercise native file completion without installing fd or using the network.
		fdPath = join(cwd, "..", "fixture-fd");
		await writeFile(fdPath, await readFile(new URL("./at-mention-fd.mjs", import.meta.url)), { mode: 0o700 });
	}
	const host = Object.create(InteractiveMode.prototype);
	Object.assign(host, {
		ui,
		runtimeHost: { session },
		keybindings: keys,
		fdPath,
		defaultEditor: editor,
		editor,
		editorContainer: new tui.Container(),
		autocompleteProviderWrappers: [],
		skillCommands: new Map(),
		pendingUserInputs: [],
		isBashMode: false,
		showExtensionNotify: (message, level) => notifications.push({ message, level }),
		// Display sinks stay local; autocomplete and submission use the native host methods.
		setExtensionStatus() {},
		setExtensionWidget() {},
		addExtensionTerminalInputListener: () => () => {},
		flushPendingBashComponents() {},
		onInputCallback: (text) => {
			submitted.push(text);
			pending.push(session.prompt(text, { source: "interactive" }));
		},
	});
	host.setupAutocompleteProvider();
	host.setupEditorSubmitHandler();
	ui.addChild(editor);
	ui.setFocus(editor);
	ui.start();
	return {
		host,
		editor,
		terminal,
		notifications,
		submitted,
		async submit(text) {
			editor.setText(text);
			terminal.input("\r");
			await Promise.all(pending.splice(0));
		},
		stop: () => ui.stop(),
	};
}
