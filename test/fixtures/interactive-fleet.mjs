import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FleetStrip } from "../../src/fleet.ts";
import { editorOwnsFocus, handleFleetInput } from "../../src/fleet-view.ts";
import { createSnapshotCapture } from "./capture-snapshot.mjs";

const [hostModules, mode = "regular", theme = "dark"] = process.argv.slice(2);
const modules = resolve(hostModules);
const load = (name, file) => import(pathToFileURL(join(modules, name, file)).href);
const tui = await load("@earendil-works/pi-tui", "dist/index.js");
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
initTheme(theme, false);

class MemoryTerminal {
	columns = 100;
	rows = 24;
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

const directory = await mkdtemp(join(tmpdir(), "omps-native-fleet-"));
const terminal = new MemoryTerminal();
const ui = createInteractiveTui({ terminal, tuiMode: mode, logDirectory: directory });
const keys = new KeybindingsManager();
tui.setKeybindings(keys);
const editor = new CustomEditor(ui, getEditorTheme(), keys);
ui.addChild(editor);
ui.setFocus(editor);
ui.start();

const strip = new FleetStrip();
const runs = ["run-a", "run-b", "run-c", "run-d", "run-e"];
const host = {
	strip,
	activeRunIds: () => runs,
	editorText: () => editor.getText(),
	editorOwnsFocus: () => editorOwnsFocus(ui),
	onInspect(runId) {
		inspected.push(runId);
	},
};
const inspected = [];
const input = (data) => terminal.input(data);
const consume = (data) => (handleFleetInput(host, data) ? { consume: true } : undefined);
let unsubscribe = ui.addInputListener(consume);
const render = (rows = terminal.rows) =>
	strip.render(
		{
			roots: runs.map((runId, index) => ({
				runId,
				agent: runId,
				state: "running",
				startedAt: index,
				activeTools: index === 0 ? ["read"] : [],
				taskSummary: `Synthetic task ${index + 1}`,
				observedDescendants: index === 0 ? 2 : 0,
				observationIncomplete: false,
			})),
			visibleAgents: 5,
			terminalRows: rows,
		},
		{ toggle: "alt+o", inspect: "alt+i" },
	);

const snapshot = createSnapshotCapture({
	ui,
	terminal,
	directory,
	version: JSON.parse(await readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8")).version,
	mode,
	theme,
});
const capture = (stage, rows = terminal.rows) =>
	snapshot(
		`fleet-${stage}`,
		render(rows).map((line) => tui.truncateToWidth(line, terminal.columns, "")),
	);
try {
	await capture("collapsed");
	// Collapsed: arrows belong to the editor and move nothing.
	input("\x1b[B");
	assert.equal(strip.selection(), undefined);
	assert.equal(editor.getText(), "");

	// Expanded with an empty draft and editor focus: arrows are consumed by the fleet.
	strip.toggle();
	render();
	await capture("expanded");
	input("\x1b[B");
	assert.equal(strip.selection(), "run-b");
	assert.equal(editor.getText(), "");

	// Key release for the same tap performs no second move.
	input("\x1b[1;1:3B");
	assert.equal(strip.selection(), "run-b");

	// A non-empty draft returns input to the editor.
	editor.setText("draft");
	input("\x1b[B");
	assert.equal(strip.selection(), "run-b");
	editor.setText("");

	// An unrelated overlay owning focus leaves navigation keys untouched.
	const overlay = { render: () => ["dialog"], handleInput() {} };
	const handle = ui.showOverlay(overlay);
	ui.renderNow();
	input("\x1b[B");
	assert.equal(strip.selection(), "run-b");
	handle.unfocus();
	ui.hideOverlay();
	ui.renderNow();

	// Focus restored: Escape collapses without touching the editor draft.
	editor.setText("preserved");
	strip.toggle();
	input("\x1b");
	assert.equal(strip.isExpanded, false);
	assert.equal(editor.getText(), "preserved");

	// Resize below the expansion budget keeps the collapsed strip.
	editor.setText("");
	strip.toggle();
	terminal.rows = 6;
	terminal.columns = 45;
	terminal.resize();
	assert.equal(render(terminal.rows).length, 1);
	await capture("narrow", terminal.rows);
	terminal.rows = 24;
	terminal.columns = 100;
	terminal.resize();
	assert.equal(render(terminal.rows).length > 1, true);

	// Enter inspects the selected run after the arrow move.
	input("\x1b[B");
	input("\r");
	assert.deepEqual(inspected, ["run-b"]);

	// A stale session unsubscribes: later arrows reach the editor untouched.
	unsubscribe();
	unsubscribe = () => {};
	editor.setText("");
	input("\x1b[B");
	assert.equal(strip.selection(), "run-b");
} finally {
	unsubscribe();
	ui.stop();
	await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ mode, theme, verified: true }));
