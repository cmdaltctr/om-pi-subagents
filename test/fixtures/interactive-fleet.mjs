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

let savedView = "expanded";
const strip = new FleetStrip(() => savedView);
const runs = ["run-a", "run-b", "run-c", "run-d", "run-e"];
const active = { ids: runs };
const host = {
	strip,
	activeRunIds: () => active.ids,
	editorText: () => editor.getText(),
	editorOwnsFocus: () => editorOwnsFocus(ui),
	onInspect(runId) {
		inspected.push(runId);
	},
};
const inspected = [];
// Keys that reach the editor rather than the fleet; Pi's history and interrupt would act on these.
const passed = [];
const input = (data) => terminal.input(data);
const consume = (data) => {
	if (handleFleetInput(host, data)) return { consume: true };
	passed.push(data);
	return undefined;
};
let unsubscribe = ui.addInputListener(consume);
const render = (rows = terminal.rows) =>
	strip.render(
		{
			roots: runs.map((runId, index) => ({
				runId,
				agent: runId,
				state: active.ids.includes(runId) ? "running" : "completed",
				startedAt: index,
				endedAt: active.ids.includes(runId) ? undefined : 10,
				activeTools: index === 0 ? ["read"] : [],
				taskSummary: `Synthetic task ${index + 1}`,
				observedDescendants: index === 0 ? 2 : 0,
				observationIncomplete: false,
			})),
			visibleAgents: 5,
			terminalRows: rows,
		},
		{ toggle: "", inspect: "" },
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
const DOWN = "\x1b[B";
const UP = "\x1b[A";
const ESCAPE = "\x1b";
try {
	// Default view: the tree shows with no key press, and nothing is selected yet.
	const expanded = render();
	assert.equal(expanded.length, 7);
	assert(expanded.every((line) => !line.startsWith(">")));
	assert.equal(expanded.at(-1), "↓ select");
	await capture("expanded-default");

	// Outside selection, Up and Escape belong to Pi.
	input(UP);
	input(ESCAPE);
	assert.equal(strip.isSelecting, false);
	assert.deepEqual(passed.slice(-2), [UP, ESCAPE]);

	// Down from the empty focused editor enters selection at the first root.
	input(DOWN);
	assert.equal(strip.isSelecting, true);
	assert.equal(strip.selection(), "run-a");
	assert.equal(editor.getText(), "");
	input(DOWN);
	assert.equal(strip.selection(), "run-b");
	assert.equal(render()[2].startsWith("> Synthetic task 2"), true);
	await capture("empty-prompt-navigation");

	// Key release for the same tap performs no second move.
	input("\x1b[1;1:3B");
	assert.equal(strip.selection(), "run-b");

	// Enter inspects the selection; Escape leaves selection without collapsing.
	input("\r");
	assert.deepEqual(inspected, ["run-b"]);
	input(ESCAPE);
	assert.equal(strip.isSelecting, false);
	assert.equal(strip.isExpanded, true);
	const before = passed.length;
	input(UP);
	assert.equal(passed.length, before + 1, "Up returns to the editor after Escape");

	// A non-empty draft keeps Down in the editor and never starts selection.
	editor.setText("draft");
	input(DOWN);
	assert.equal(strip.isSelecting, false);
	editor.setText("");

	// An unrelated overlay owning focus leaves navigation keys untouched.
	const overlay = { render: () => ["dialog"], handleInput() {} };
	const handle = ui.showOverlay(overlay);
	ui.renderNow();
	input(DOWN);
	assert.equal(strip.isSelecting, false);
	handle.unfocus();
	ui.hideOverlay();
	ui.renderNow();

	// The saved collapsed view keeps one row; Down reaches the editor.
	savedView = "collapsed";
	strip.resetView();
	assert.equal(render().length, 1);
	await capture("collapsed");
	input(DOWN);
	assert.equal(strip.isSelecting, false);

	// The saved off view shows nothing at all.
	savedView = "off";
	strip.resetView();
	assert.deepEqual(render(), []);
	await snapshot("fleet-off", ["(no OMPS fleet widget)"]);
	input(DOWN);
	assert.equal(strip.isSelecting, false);

	// A narrow, short terminal falls back to the one-row summary.
	savedView = "expanded";
	strip.resetView();
	terminal.rows = 6;
	terminal.columns = 45;
	terminal.resize();
	assert.equal(render(terminal.rows).length, 1);
	await capture("narrow", terminal.rows);
	terminal.rows = 24;
	terminal.columns = 70;
	terminal.resize();
	assert.equal(render(terminal.rows).length > 1, true);
	await capture("narrow-expanded");
	terminal.columns = 100;
	terminal.resize();

	// The last run ending ends selection; the idle summary is what lingers before the clear.
	input(DOWN);
	assert.equal(strip.isSelecting, true);
	active.ids = [];
	input(UP);
	assert.equal(strip.isSelecting, false);
	assert.match(render()[0], /^Agents: idle \| last run-[a-e] completed$/);
	await capture("after-linger");

	// A stale session unsubscribes: later arrows reach the editor untouched.
	active.ids = runs;
	unsubscribe();
	unsubscribe = () => {};
	input(DOWN);
	assert.equal(strip.isSelecting, false);
} finally {
	unsubscribe();
	ui.stop();
	await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ mode, theme, verified: true }));
