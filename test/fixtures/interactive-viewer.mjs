import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerOmpss } from "../../src/index.ts";
import { ObservationStore } from "../../src/observation.ts";
import { RunViewer, TREE_ENTRY } from "../../src/viewer.ts";

const [modules, mode] = process.argv.slice(2);
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
const { ToolExecutionComponent } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/components/tool-execution.js",
);
const { CustomEntryComponent } = await load(
	"@earendil-works/pi-coding-agent",
	"dist/modes/interactive/components/custom-entry.js",
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
	writes = [];
	start(input, resize) {
		this.input = input;
		this.resize = resize;
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
const directory = await mkdtemp(join(tmpdir(), "ompss-native-viewer-"));
const terminal = new MemoryTerminal();
const ui = createInteractiveTui({ terminal, tuiMode: mode, logDirectory: directory });
const keys = new KeybindingsManager();
tui.setKeybindings(keys);
const editor = new CustomEditor(ui, getEditorTheme(), keys);
const host = Object.create(InteractiveMode.prototype);
Object.assign(host, {
	ui,
	keybindings: keys,
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
const observations = new ObservationStore();
const root = {
	id: "root",
	owner: "session",
	agent: "worker",
	state: "running",
	startedAt: 1,
	cwd: directory,
	nesting: { registryPath: "/registry", rootSessionId: "session", depth: 1, maxDepth: 3 },
};
observations.updateRoot(root, { model: "fake/model" });
assert.equal(observations.bindChildSession({ owner: "session", runId: "root" }, "child-session"), true);
for (let index = 1; index < 20; index++)
	assert.equal(
		observations.ingest(
			{ owner: "session", runId: "root" },
			{
				owner: index === 2 ? "grandchild-session" : "child-session",
				childSessionId: index === 1 ? "grandchild-session" : undefined,
				rootSessionId: "session",
				runId: `child-${index}`,
				parentRunId: index === 2 ? "child-1" : "root",
				depth: index === 2 ? 3 : 2,
				agent: "reader",
				state: "running",
				startedAt: 1,
				revision: 1,
				activeTools: [],
			},
		),
		"accepted",
	);
assert.equal(
	observations.ingest(
		{ owner: "session", runId: "root" },
		{
			owner: "grandchild-session",
			rootSessionId: "session",
			runId: "grandchild",
			parentRunId: "child-1",
			depth: 3,
			agent: "grandchild-reader",
			state: "running",
			startedAt: 1,
			revision: 1,
			activeTools: [],
		},
	),
	"accepted",
);
for (const node of observations.tree("session", "root").nodes) {
	const saved = join(directory, node.owner, node.runId);
	await mkdir(saved, { recursive: true });
	await writeFile(
		join(saved, "config.json"),
		JSON.stringify({
			runId: node.runId,
			owner: node.owner,
			createdAt: node.startedAt,
			agent: { name: node.agent },
			task: `Selected task ${node.runId}`,
			nesting: { rootSessionId: node.rootSessionId, parentRunId: node.parentRunId, depth: node.depth },
		}),
	);
	await writeFile(join(saved, "output.md"), `Selected output ${node.runId}`);
}
const ctx = {
	mode: "tui",
	hasUI: true,
	cwd: directory,
	sessionManager: { getSessionId: () => "session" },
	ui: { custom: (...args) => host.showExtensionCustom(...args), notify() {} },
};
const preferences = { value: 4, ensureLoaded: async () => ({ diagnostics: [] }) };
const viewer = new RunViewer({
	observations,
	preferences,
	storeRoot: directory,
	owner: () => "session",
	redraw: () => ui.requestRender(),
});
let tool;
const entries = new Map();
const commands = new Map();
const pi = {
	registerTool: (definition) => {
		tool = definition;
	},
	registerCommand: (name, command) => commands.set(name, command),
	registerEntryRenderer: (name, renderer) => entries.set(name, renderer),
	appendEntry() {},
	sendMessage() {
		throw Error("Viewer must not send model messages");
	},
};
let cancelled = 0;
registerOmpss(
	pi,
	() => ({
		run: async () => "Started run root (worker).",
		cancel: () => {
			cancelled++;
		},
		status: () => "running",
		list: async () => "worker",
	}),
	undefined,
	() => viewer,
);
const result = await tool.execute(
	"tool-1",
	{ action: "run", agent: "worker", task: "selected" },
	undefined,
	undefined,
	ctx,
);
const card = new ToolExecutionComponent("ompss", "tool-1", {}, {}, tool, ui, directory);
card.updateResult(result);
const entry = new CustomEntryComponent({ customType: TREE_ENTRY, data: result.details }, entries.get(TREE_ENTRY));
const other = new ToolExecutionComponent("other", "other-1", {}, {}, undefined, ui, directory);
other.updateResult({ content: [{ type: "text", text: "unrelated" }] });
host.chatContainer.addChild(card);
host.chatContainer.addChild(entry);
host.chatContainer.addChild(other);
ui.addChild(host.chatContainer);
ui.addChild(host.editorContainer);
ui.setFocus(editor);
ui.start();
const flush = async () => {
	await new Promise((done) => setTimeout(done, 20));
	ui.renderNow();
};
const waitForDetails = async () => {
	const deadline = Date.now() + 5000;
	await flush();
	const component = ui.getFocusedComponent();
	assert.notEqual(component, editor);
	let text = component.render(100).join("\n");
	// Real saved-file reads can outlast a render flush under full-suite load.
	while (text.includes("Reading selected saved files...")) {
		assert(Date.now() < deadline, `Selected saved-file read did not finish:\n${text}`);
		await flush();
		text = component.render(100).join("\n");
	}
	return component;
};
try {
	ui.renderNow();
	assert.equal(card.expanded, false);
	terminal.input("\x0f");
	assert.equal(card.expanded, true);
	assert.equal(other.expanded, true);
	assert(card.render(100).some((line) => line.includes("hidden agents")));
	assert(entry.render(100).some((line) => line.includes("hidden agents")));
	const remapped = new KeybindingsManager({ "app.tools.expand": "ctrl+y" });
	tui.setKeybindings(remapped);
	editor.keybindings = remapped;
	terminal.input("\x19");
	assert.equal(card.expanded, false);
	assert(
		card.render(100).some((line) => line.includes("ctrl+y")),
		"hint must use the host's actual configured action",
	);
	terminal.input("\x19");
	editor.setText("preserved prompt");
	ui.renderNow();
	const screen = mode === "fullscreen" ? ui.previousScreen : ui.render(100);
	const row = screen.findIndex((line) => line.includes("grandchild-reader running"));
	assert(row >= 0, "the validated grandchild must have its own clickable card row");
	const siblingBefore = observations.node("session", "root", "child-2");
	const parentBefore = observations.node("session", "root", "child-1");
	terminal.input(`\x1b[<0;3;${row + 1}M`);
	terminal.input(`\x1b[<0;3;${row + 1}m`);
	await flush();
	if (mode === "fullscreen") {
		const clicked = await waitForDetails();
		assert.notEqual(clicked, editor);
		const saved = join(directory, "grandchild-session", "grandchild");
		const task = JSON.parse(await readFile(join(saved, "config.json"), "utf8")).task;
		const output = await readFile(join(saved, "output.md"), "utf8");
		const details = clicked.render(100).join("\n");
		assert(details.includes(output), "clicked grandchild must show its actual saved output through the detail reader");
		assert(details.includes(task), "clicked grandchild must show its actual saved task through the detail reader");
		assert(!details.includes("Selected task child-1"));
		assert(!details.includes("Selected output child-2"));
		assert.equal(observations.node("session", "root", "grandchild").owner, "grandchild-session");
		assert.deepEqual(observations.node("session", "root", "child-2"), siblingBefore);
		assert.deepEqual(observations.node("session", "root", "child-1"), parentBefore);
		assert.equal(siblingBefore.state, "running");
		assert.equal(parentBefore.state, "running");
		terminal.input("\x1b");
		await flush();
	} else {
		assert.equal(ui.getFocusedComponent(), editor);
		assert(!terminal.writes.join("").includes("\x1b[?1006h"));
	}
	const inspecting = commands.get("ompss").handler("inspect", ctx);
	await flush();
	assert.notEqual(ui.getFocusedComponent(), editor);
	// Account for the nested row while preserving the existing hidden-child selection.
	terminal.input("\x1b[B");
	for (let index = 0; index < 19; index++) terminal.input("\x1b[B");
	terminal.input("\r");
	const overlay = await waitForDetails();
	assert(
		overlay.render(100).join("\n").includes("Selected task child-19"),
		"hidden retained agent must remain keyboard-accessible",
	);
	assert.equal(
		observations.updateRoot(
			{ ...root, state: "running" },
			{ model: "new/model", activeTools: [{ id: "live-tool", name: "live_read" }] },
		),
		true,
	);
	await flush();
	assert(
		card.render(100).some((line) => line.includes("live_read")),
		"live metadata invalidates the native card",
	);
	terminal.columns = 45;
	terminal.resize();
	ui.renderNow();
	assert.equal(ui.getFocusedComponent(), overlay);
	terminal.input("\x1b");
	await inspecting;
	assert.equal(ui.getFocusedComponent(), editor);
	assert.equal(editor.getText(), "preserved prompt");
	assert.equal(cancelled, 0);
	assert.equal(observations.node("session", "root", "root").state, "running");
	viewer.dispose();
	assert(
		card.render(100).some((line) => line.includes("unavailable")),
		"disposed viewer must not replay old evidence",
	);
} finally {
	viewer.dispose();
	ui.stop();
	await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ mode, verified: true }));
