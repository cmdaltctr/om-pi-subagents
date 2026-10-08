import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { registerOmps } from "../../src/index.ts";
import { ObservationStore } from "../../src/observation.ts";
import { RunViewer, TREE_ENTRY } from "../../src/viewer.ts";
import { createSnapshotCapture } from "./capture-snapshot.mjs";
import { captureInspectorVisual } from "./inspector-visual.mjs";

const [modules, mode, theme = "dark"] = process.argv.slice(2);
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
const {
	initTheme,
	getEditorTheme,
	theme: activeTheme,
} = await load("@earendil-works/pi-coding-agent", "dist/modes/interactive/theme/theme.js");
initTheme(theme, false);
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
const directory = await mkdtemp(join(tmpdir(), "omps-native-viewer-"));
const terminal = new MemoryTerminal();
const ui = createInteractiveTui({ terminal, tuiMode: mode, logDirectory: directory });
let overlayHandle;
const showOverlay = ui.showOverlay.bind(ui);
ui.showOverlay = (...args) => {
	overlayHandle = showOverlay(...args);
	return overlayHandle;
};
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
	startedAt: Date.now() - 508000,
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
				startedAt: root.startedAt,
				revision: 1,
				activeTools:
					index === 19
						? [
								{ id: "synthetic-read-1", name: "read" },
								{ id: "synthetic-read-2", name: "read" },
								{ id: "synthetic-grep", name: "grep" },
							]
						: [],
				taskSummary: `Synthetic task for child-${index}`,
				assistantPreview: "Synthetic live preview words ".repeat(100),
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
			startedAt: root.startedAt,
			revision: 1,
			activeTools: [],
		},
	),
	"accepted",
);
for (let index = 2; index <= 5; index++)
	observations.updateRoot(
		{ ...root, id: `root-${index}`, agent: `worker-${index}`, startedAt: index },
		{ model: "fake/model" },
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
	await writeFile(
		join(saved, "output.md"),
		`# Selected output ${node.runId}\n\n${Array.from({ length: 100 }, (_, index) => `Paragraph ${index} for ${node.runId}. This synthetic answer tests scrolling.\n\n- Synthetic item ${index}\n\n\`\`\`ts\nconst example = ${index};\n\`\`\``).join("\n\n")}\n\nFINAL-SYNTHETIC-LINE ${node.runId}`,
	);
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
registerOmps(
	pi,
	() => ({
		run: async () => "Started run root (worker) in the background.",
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
const card = new ToolExecutionComponent("omps", "tool-1", {}, {}, tool, ui, directory);
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
const version = JSON.parse(
	await readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8"),
).version;
const capturePlain = createSnapshotCapture({
	ui,
	terminal,
	directory,
	version,
	mode,
	theme,
});
const capture = async (stage, suppliedLines) => {
	await capturePlain(stage, suppliedLines);
	await captureInspectorVisual({
		version,
		mode,
		theme,
		stage,
		width: terminal.columns,
		lines: suppliedLines ?? ui.getFocusedComponent().render(terminal.columns),
	});
};
const flush = async () => {
	await new Promise((done) => setTimeout(done, 20));
	ui.renderNow();
};
const waitForDetails = async () => {
	const deadline = Date.now() + 5000;
	await flush();
	const component = ui.getFocusedComponent();
	assert.notEqual(component, editor);
	component.render(100);
	component.handleInput("\x1b[F");
	let text = component.render(100).join("\n");
	// The loading label belongs to the same scrollable body as the provisional answer.
	while (text.includes("Reading selected saved files...")) {
		assert(Date.now() < deadline, `Selected saved-file read did not finish:\n${text}`);
		await flush();
		component.handleInput("\x1b[F");
		text = component.render(100).join("\n");
	}
	assert(text.includes("FINAL-SYNTHETIC-LINE"), "The selected saved answer must finish loading");
	component.handleInput("\x1b[H");
	await flush();
	return component;
};
try {
	ui.renderNow();
	assert.equal(card.expanded, false);
	assert(
		card.render(100).some((line) => line.includes("OMPS: worker started (root)")),
		"collapsed launches show one compact acknowledgement row",
	);
	terminal.input("\x0f");
	assert.equal(card.expanded, true);
	assert.equal(other.expanded, true);
	// Host expansion reveals the captured acknowledgement text only, never a live per-run tree.
	const expandedCard = card.render(100).join("\n");
	assert(expandedCard.includes("Started run root (worker) in the background."));
	assert(!expandedCard.includes("hidden agents"));
	assert(!expandedCard.includes("grandchild"));
	const entryText = entry.render(100).join("\n");
	assert(
		entryText.includes("OMPS: worker started (root)"),
		"slash-launch entries render the same compact acknowledgement",
	);
	assert(!entryText.includes("hidden agents"));
	assert(!/\d+ descendants/.test(entryText));
	const remapped = new KeybindingsManager({ "app.tools.expand": "ctrl+y" });
	tui.setKeybindings(remapped);
	editor.keybindings = remapped;
	terminal.input("\x19");
	assert.equal(card.expanded, false);
	assert.equal(other.expanded, false);
	terminal.input("\x19");
	editor.setText("preserved prompt");
	ui.renderNow();
	const inspecting = commands.get("omps").handler("inspect", ctx);
	await flush();
	assert.notEqual(ui.getFocusedComponent(), editor);
	await capture("tree");
	// The documented fold keys hide a branch without discarding its retained rows.
	terminal.input("\x1b[B");
	terminal.input("\x1b[D");
	await flush();
	assert(!ui.getFocusedComponent().render(100).join("\n").includes("grandchild-reader"));
	terminal.input("\x1b[C");
	await flush();
	assert(ui.getFocusedComponent().render(100).join("\n").includes("grandchild-reader"));
	if (mode === "fullscreen") {
		const bounds = overlayHandle.getBounds();
		assert(bounds);
		const row = ui
			.getFocusedComponent()
			.render(bounds.width)
			.findIndex((line) => line.includes("grandchild-reader"));
		assert(row > 0);
		terminal.input(`\x1b[<0;${bounds.col + 4};${bounds.row + row + 1}M`);
		terminal.input(`\x1b[<0;${bounds.col + 4};${bounds.row + row + 1}m`);
		const grandchild = await waitForDetails();
		assert(grandchild.render(100).join("\n").includes("Selected task grandchild"));
		assert(grandchild.render(100).join("\n").includes("reader (child-1) > grandchild-reader"));
		await capture("grandchild-detail");
		terminal.input("\x1b");
		await flush();
	}
	// Scroll by run identity: extra roots must not change which descendant is inspected.
	for (let index = 0; index < 30; index++) {
		if (
			/>\s+reader running · [^\n]+ \(child-19\)/.test(
				stripVTControlCharacters(ui.getFocusedComponent().render(100).join("\n")),
			)
		)
			break;
		terminal.input("\x1b[B");
	}
	assert(
		/>\s+reader running · [^\n]+ \(child-19\)/.test(
			stripVTControlCharacters(ui.getFocusedComponent().render(100).join("\n")),
		),
	);
	terminal.input("\r");
	const pending = ui.getFocusedComponent();
	const provisionalTop = pending.render(100).join("\n");
	terminal.input("\x1b[6~");
	assert.notEqual(pending.render(100).join("\n"), provisionalTop, "Paging works before real file reads finish");
	const overlay = await waitForDetails();
	assert(
		overlay.render(100).join("\n").includes("Selected task child-19"),
		"hidden retained agent must remain keyboard-accessible",
	);
	await capture("detail");
	const strip = (lines) => lines.map(stripVTControlCharacters).join("\n");
	const start = strip(overlay.render(100));
	terminal.input("\x1b[B");
	await flush();
	assert.notEqual(strip(overlay.render(100)), start, "Down scrolls details without switching agents");
	terminal.input("\x1b[6~");
	await flush();
	assert(!strip(overlay.render(100)).includes("Run: child-19"), "PageDown reaches answer content");
	terminal.input("\x1b[F");
	await flush();
	assert(strip(overlay.render(100)).includes("FINAL-SYNTHETIC-LINE child-19"));
	await capture("answer-bottom", overlay.render(100));
	terminal.input("\x1b[H");
	await flush();
	if (mode === "fullscreen") {
		const position = overlayHandle.getBounds();
		assert(position);
		const beforeWheel = strip(overlay.render(100));
		terminal.input(`\x1b[<65;${position.col + 4};${position.row + 5}M`);
		await flush();
		assert.notEqual(strip(overlay.render(100)), beforeWheel, "Fullscreen wheel scrolls and redraws");
		terminal.input("\x1b[H");
		await flush();
	}
	assert.equal(
		observations.updateRoot(
			{ ...root, state: "running" },
			{ model: "new/model", activeTools: [{ id: "live-tool", name: "live_read" }] },
		),
		true,
	);
	await flush();
	assert(
		!card.render(100).some((line) => line.includes("live_read")),
		"acknowledgements never repaint into live activity; that belongs to the fleet and modal",
	);
	const themedName = activeTheme.fg("accent", "reader");
	assert(overlay.render(100).join("\n").includes(themedName));
	initTheme(theme === "light" ? "dark" : "light", false);
	overlay.invalidate();
	await flush();
	const changedTheme = overlay.render(100).join("\n");
	assert(changedTheme.includes(activeTheme.fg("accent", "reader")), "Invalidation uses the current host theme");
	assert(!changedTheme.includes(themedName), "The previous theme does not remain cached");
	initTheme(theme, false);
	overlay.invalidate();
	await flush();
	terminal.columns = 45;
	terminal.resize();
	ui.renderNow();
	await capture("narrow");
	assert.equal(ui.getFocusedComponent(), overlay);
	terminal.input("\x1b[H");
	await flush();
	await capture("narrow-detail");
	terminal.input("\x1b[F");
	await flush();
	assert(strip(overlay.render(45)).includes("FINAL-SYNTHETIC-LINE child-19"));
	await capture("narrow-answer-bottom", overlay.render(45));
	terminal.input("\x1b"); // Return to the picker with the same selected identity and folds.
	await flush();
	assert.equal(ui.getFocusedComponent(), overlay);
	if (mode === "fullscreen") {
		const bounds = overlayHandle.getBounds();
		assert(bounds);
		const row = overlay.render(bounds.width).findIndex((line) => line.includes("Synthetic task for child-17"));
		assert(row > 0, "Windowed second-line row must remain visible");
		terminal.input(`\x1b[<0;${bounds.col + 4};${bounds.row + row + 1}M`);
		terminal.input(`\x1b[<0;${bounds.col + 4};${bounds.row + row + 1}m`);
		const clicked = await waitForDetails();
		assert(
			clicked.render(100).join("\n").includes("Selected task child-17"),
			"Windowed second-line click uses displayed identity",
		);
		await capture("windowed-click-detail");
		terminal.input("\x1b");
		await flush();
	}
	terminal.input("\x1b");
	await inspecting;
	assert.equal(ui.getFocusedComponent(), editor);
	assert.equal(editor.getText(), "preserved prompt");
	assert.equal(cancelled, 0);
	assert.equal(observations.node("session", "root", "root").state, "running");
	const direct = commands.get("omps").handler("inspect child-17", ctx);
	const directOverlay = await waitForDetails();
	assert(directOverlay.render(100).join("\n").includes("Selected task child-17"));
	terminal.input("\x1b");
	await direct;
	assert.equal(ui.getFocusedComponent(), editor, "A direct run-id opens details and closes with one Escape");
	assert.equal(editor.getText(), "preserved prompt");
	viewer.dispose();
	const afterDispose = card.render(100).join("\n");
	assert(
		afterDispose.includes("OMPS: worker started (root)"),
		"the static acknowledgement stays bounded after dispose",
	);
	assert(!afterDispose.includes("Selected output"), "disposed viewer must not replay saved evidence");
} finally {
	viewer.dispose();
	ui.stop();
	await rm(directory, { recursive: true, force: true });
}
console.log(JSON.stringify({ mode, theme, verified: true }));
