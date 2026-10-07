import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { FleetStrip } from "../../src/fleet.ts";
import { FleetWidget, LIST_KEY, TREE_KEY } from "../../src/fleet-widget.ts";
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
const {
	initTheme,
	getEditorTheme,
	theme: piTheme,
} = await load("@earendil-works/pi-coding-agent", "dist/modes/interactive/theme/theme.js");
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
const OWNER = "session";
let now = 1_000_000;
const runs = [];
const trees = [];
const uses = new Map();
const factories = new Map();
const widget = new FleetWidget({
	messenger: (owner) =>
		owner === OWNER
			? {
					send: async () => {},
					setWidget: (content, _placement, key) => {
						if (typeof content === "function") factories.set(key, content);
						else if (content === undefined) factories.delete(key);
					},
				}
			: undefined,
	runs: () => runs,
	trees: () => trees,
	toolUses: (runId) => uses.get(runId) ?? 0,
	visibleAgents: () => 5,
	strip,
	mode: () => "tui",
	now: () => now,
});
const facts = { rows: terminal.rows, requestRender: () => {}, focus: ui, theme: piTheme };
const lines = (key, width = terminal.columns) => {
	const factory = factories.get(key);
	return factory ? factory(facts).render(width) : [];
};
const tasks = ["Map Pi MCP naming", "Draft the rollout", "List TypeScript files", "Summarise the README"];
const start = (index, patch = {}) => {
	const runId = `run-${String.fromCharCode(97 + index)}`;
	const run = {
		id: runId,
		owner: OWNER,
		agent: `a-agent-${index + 1}`,
		cwd: "/work",
		state: "running",
		startedAt: now - 1700 + index * 100,
		...patch,
	};
	const existing = runs.findIndex((entry) => entry.id === runId);
	if (existing === -1) runs.push(run);
	else runs[existing] = run;
	return run;
};
const observe = (runId, display) => {
	const index = trees.findIndex((entry) => entry.runId === runId);
	const node = {
		owner: OWNER,
		rootSessionId: OWNER,
		runId,
		depth: 1,
		agent: "a",
		state: "running",
		startedAt: 1,
		revision: 1,
		activeTools: [],
		incomplete: false,
		reasons: [],
		...display,
	};
	const tree = { owner: OWNER, rootSessionId: OWNER, runId, nodes: [node], pending: 0, incomplete: false, reasons: [] };
	if (index === -1) trees.push(tree);
	else trees[index] = tree;
};
const listedIds = () =>
	strip.isExpanded && !strip.isHidden
		? lines(LIST_KEY).length
			? runs.filter((run) => run.state === "running" || now - (run.endedAt ?? 0) < 4000).map((run) => run.id)
			: []
		: [];
const host = {
	strip,
	activeRunIds: listedIds,
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

const snapshot = createSnapshotCapture({
	ui,
	terminal,
	directory,
	version: JSON.parse(await readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8")).version,
	mode,
	theme,
});
// One screen: the tree above a stand-in editor, then the list below it, as Pi stacks them.
const screen = (width = terminal.columns) => [
	...lines(TREE_KEY, width),
	"─".repeat(Math.min(width, 40)) + " editor",
	...lines(LIST_KEY, width),
];
const capture = (stage, width = terminal.columns) => snapshot(`fleet-${stage}`, screen(width));
const plainLines = (key, width) =>
	lines(key, width).map((line) => stripVTControlCharacters(tui.truncateToWidth(line, width, "")));
const DOWN = "\x1b[B";
const UP = "\x1b[A";
const ESCAPE = "\x1b";
try {
	widget.attach(OWNER);
	for (let index = 0; index < 4; index++) start(index);
	observe("run-a", {
		taskSummary: tasks[0],
		activeTools: [
			{ id: "1", name: "grep" },
			{ id: "2", name: "grep" },
		],
	});
	observe("run-b", { taskSummary: tasks[1] });
	observe("run-c", { taskSummary: tasks[2], activeTools: [{ id: "3", name: "read" }] });
	observe("run-d", { taskSummary: tasks[3], assistantPreview: "The README describes OMPS setup in four steps" });
	uses.set("run-a", 3);
	uses.set("run-c", 1);
	for (const run of runs) widget.onChange(run);

	// Default view: tintin's tree shows with no key press, and the list offers navigation.
	const tree = plainLines(TREE_KEY, 100);
	assert.equal(tree.length, 9);
	assert.equal(tree[0], "● Agents");
	assert.match(tree[1], /^├─ \S a-agent-1 {2}Map Pi MCP naming · 3 tool uses · 1\.7s$/);
	assert.equal(tree[2], "│    ⎿  searching 2 patterns…");
	assert.match(tree[7], /^└─ \S a-agent-4/);
	assert.equal(tree[8], "     ⎿  The README describes OMPS setup in four steps");
	const list = plainLines(LIST_KEY, 100);
	assert.equal(list[0], "  ↓ to manage");
	assert.equal(list.filter((line) => line.includes("○")).length, 4);
	await capture("tree-four-running");

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
	const selected = plainLines(LIST_KEY, 100);
	assert.equal(selected[0], "  ↑↓ select · enter inspect · esc back");
	assert.match(selected[2], /^ {2}● a-agent-2 {2}Draft the rollout/);
	await capture("arrow-list");

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

	// A narrow terminal truncates every line without wrapping.
	for (const line of [...lines(TREE_KEY, 60), ...lines(LIST_KEY, 60)]) assert(tui.visibleWidth(line) <= 60);
	await capture("narrow", 60);

	// More than 12 tree lines: running first, then a more line.
	for (let index = 4; index < 8; index++) widget.onChange(start(index));
	const overflow = plainLines(TREE_KEY, 100);
	assert.equal(overflow.length, 12);
	assert.equal(overflow.at(-1), "└─ +3 more (3 running)");
	await capture("tree-overflow");
	runs.splice(4);

	// One run completes and one fails. A fast parent turn keeps the tick for the time floor.
	start(0, { state: "completed", endedAt: now });
	start(1, { state: "failed", endedAt: now, error: "provider error: quota exceeded" });
	for (const run of runs) widget.onChange(run);
	widget.onTurnStart(OWNER);
	now += 1000;
	const lingering = plainLines(TREE_KEY, 100);
	assert.match(lingering[1], /^├─ ✓ a-agent-1 {2}Map Pi MCP naming · 3 tool uses · 1\.7s$/);
	assert.match(lingering[2], /^├─ ✗ a-agent-2 {2}Draft the rollout · \d\.\ds error: provider error: quota exceeded$/);
	await capture("finished-linger");

	// After the floor the tick leaves; the failure stays until the second parent turn.
	now += 4000;
	assert(!plainLines(TREE_KEY, 100).some((line) => line.includes("✓ a-agent-1")));
	assert.match(plainLines(TREE_KEY, 100)[1], /^├─ ✗ a-agent-2/);
	await capture("error-linger");
	widget.onTurnStart(OWNER);
	assert(!plainLines(TREE_KEY, 100).some((line) => line.includes("✗")));

	// The saved collapsed view keeps only the tree heading; Down reaches the editor.
	for (let index = 0; index < 4; index++) widget.onChange(start(index));
	savedView = "collapsed";
	strip.resetView();
	assert.deepEqual(plainLines(TREE_KEY, 100), ["● Agents · 4 running"]);
	assert.deepEqual(lines(LIST_KEY), []);
	await capture("collapsed");
	input(DOWN);
	assert.equal(strip.isSelecting, false);

	// The saved off view shows nothing at all.
	savedView = "off";
	strip.resetView();
	assert.deepEqual(lines(TREE_KEY), []);
	assert.deepEqual(lines(LIST_KEY), []);
	await snapshot("fleet-off", ["(no OMPS fleet widget)"]);
	input(DOWN);
	assert.equal(strip.isSelecting, false);

	// A stale session unsubscribes: later arrows reach the editor untouched.
	savedView = "expanded";
	strip.resetView();
	unsubscribe();
	unsubscribe = () => {};
	input(DOWN);
	assert.equal(strip.isSelecting, false);
} finally {
	widget.clear(OWNER);
	unsubscribe();
	ui.stop();
	await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ mode, theme, verified: true }));
