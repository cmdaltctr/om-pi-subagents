import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [modules, mode] = process.argv.slice(2);
const load = (packageName, file) => import(pathToFileURL(join(resolve(modules), packageName, file)).href);
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
const { CustomEntryComponent } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/components/custom-entry.js",
);
const { ToolExecutionComponent } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/components/tool-execution.js",
);
const { KeybindingsManager } = await load("@earendil-works/pi-coding-agent", "dist/core/keybindings.js");
const { keyText } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/components/keybinding-hints.js",
);
const { initTheme, getEditorTheme } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/theme/theme.js",
);
initTheme("dark", false);

// The real host owns input routing and rendering. Only its terminal device is disposable.
class MemoryTerminal {
	columns = 80;
	rows = 32;
	kittyProtocolActive = false;
	writes = [];
	start(onInput, onResize) {
		this.input = onInput;
		this.resize = onResize;
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
}

const terminal = new MemoryTerminal();
const ui = createInteractiveTui({ terminal, tuiMode: mode, logDirectory: process.env.PI_CODING_AGENT_DIR });
const keybindings = new KeybindingsManager();
tui.setKeybindings(keybindings);
const editor = new CustomEditor(ui, getEditorTheme(), keybindings);
// Keep the host's real key handlers, card expansion and overlay implementation.
// Session creation and provider access are outside this presentation contract.
const host = Object.create(InteractiveMode.prototype);
Object.assign(host, {
	ui,
	keybindings,
	defaultEditor: editor,
	editor,
	editorContainer: new tui.Container(),
	loadedResourcesContainer: new tui.Container(),
	chatContainer: new tui.Container(),
	toolOutputExpanded: false,
	isBashMode: false,
	showStatus() {},
});
host.editorContainer.addChild(editor);
host.setupKeyHandlers();
let selected = 0;
let activity = "running";
let invalidateTool;
const card = new ToolExecutionComponent(
	"fixture",
	"tool-1",
	{},
	{},
	{
		renderCall: () => new tui.Text("fixture call", 0, 0),
		renderResult: (_result, { expanded }, _theme, context) => {
			invalidateTool = context.invalidate;
			const content = new tui.Container();
			content.addChild(new tui.Text(`root ${activity} ${keyText("app.tools.expand")}`, 0, 0));
			if (expanded)
				content.addChild(
					new tui.MouseRegion(new tui.Text("child inspect", 0, 0), (event) => {
						if (event.type !== "click" || event.button !== "left") return undefined;
						selected++;
						return { handled: true };
					}),
				);
			return content;
		},
	},
	ui,
	process.cwd(),
);
card.updateResult({ content: [{ type: "text", text: "acknowledged" }], details: { runId: "run-1" } });
const unrelated = new ToolExecutionComponent("other", "tool-2", {}, {}, undefined, ui, process.cwd());
unrelated.updateResult({
	content: [{ type: "text", text: Array.from({ length: 15 }, (_, i) => `other ${i}`).join("\n") }],
});
const entry = new CustomEntryComponent(
	{ customType: "fixture-card", data: { runId: "run-2" } },
	(_entry, { expanded }) => new tui.Text(expanded ? "entry root\nentry child" : "entry root", 0, 0),
);
host.chatContainer.addChild(card);
host.chatContainer.addChild(unrelated);
host.chatContainer.addChild(entry);
ui.addChild(host.chatContainer);
ui.addChild(host.editorContainer);
ui.setFocus(editor);
ui.start();
try {
	ui.renderNow();
	assert.equal(card.expanded, false);
	terminal.input("\x0f");
	assert.equal(card.expanded, true, "Ctrl+O must dispatch through the editor to native expansion");
	assert.equal(unrelated.expanded, true, "unrelated tools retain global expansion");
	assert(entry.render(80).some((line) => line.includes("entry child")));
	terminal.input("\x0f");
	assert.equal(card.expanded, false);
	assert(!entry.render(80).some((line) => line.includes("entry child")));

	const remapped = new KeybindingsManager({ "app.tools.expand": "ctrl+y" });
	tui.setKeybindings(remapped);
	editor.keybindings = remapped;
	terminal.input("\x0f");
	assert.equal(card.expanded, false, "the old binding must stop expanding cards");
	terminal.input("\x19");
	assert.equal(card.expanded, true);
	assert(card.render(80).some((line) => line.includes("ctrl+y")));
	activity = "completed";
	invalidateTool();
	assert(
		card.render(80).some((line) => line.includes("completed")),
		"live invalidation must redraw saved cards",
	);
	ui.renderNow();

	// Use the terminal's SGR press/release path rather than calling a row handler.
	const lines = mode === "fullscreen" ? ui.previousScreen : ui.render(80);
	const row = lines.findIndex((line) => line.includes("child inspect"));
	assert(row >= 0);
	terminal.input(`\x1b[<0;3;${row + 1}M`);
	terminal.input(`\x1b[<0;3;${row + 1}m`);
	assert.equal(selected, mode === "fullscreen" ? 1 : 0, "only fullscreen owns row clicks");
	if (mode === "regular") assert(!terminal.writes.join("").includes("\x1b[?1006h"));

	editor.setText("preserved prompt");
	let component;
	let down = 0;
	let entered = 0;
	let disposed = 0;
	const result = host.showExtensionCustom(
		(_ui, _theme, _keys, done) => {
			component = {
				render: (width) => [tui.truncateToWidth(`inspect ${down}`, width)],
				invalidate() {},
				handleInput: (data) => {
					if (tui.matchesKey(data, "down")) down++;
					if (tui.matchesKey(data, "enter")) entered++;
					if (tui.matchesKey(data, "escape")) done("closed");
				},
				dispose() {
					disposed++;
				},
			};
			return component;
		},
		{ overlay: true, overlayOptions: { width: 40, maxHeight: 12 } },
	);
	await Promise.resolve();
	assert.equal(ui.getFocusedComponent(), component);
	terminal.input("\x1b[B");
	terminal.input("\r");
	assert.equal(down, 1);
	assert.equal(entered, 1);
	terminal.columns = 44;
	terminal.resize();
	ui.renderNow();
	assert.equal(ui.getFocusedComponent(), component, "resize must preserve overlay focus");
	terminal.input("\x1b");
	assert.equal(await result, "closed");
	assert.equal(disposed, 1);
	assert.equal(ui.getFocusedComponent(), editor);
	assert.equal(editor.getText(), "preserved prompt");
	assert.equal(card.expanded, true, "closing the overlay leaves transcript expansion intact");
} finally {
	ui.stop();
}
const manifest = JSON.parse(await readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8"));
console.log(JSON.stringify({ version: manifest.version, mode, verified: true }));
