import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { writeFixturePersona } from "./registry.ts";
import { stripVTControlCharacters } from "node:util";
import assert from "node:assert/strict";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "yaml";
import { registerRuntime, SessionBinding } from "../../src/index.ts";
import { FleetWidget } from "../../src/fleet-widget.ts";
import { FleetStrip } from "../../src/fleet.ts";
import { createWorkspace } from "./pi-rpc.ts";
import { resolveTodoExtension, seedTodoPreferences } from "./todo.ts";
import { createTodoViewerHost } from "./todo-viewer-host.mjs";
import { createSnapshotCapture } from "./capture-snapshot.mjs";

// Bounded coexistence harness: real factories and hooks, native Pi input/widgets/overlays/dialogs.
// Registration is captured locally; sessions are native in-memory sessions, not a full AgentSession.
// No child is spawned here. viewer.todo.test.ts separately exercises the managed-child bootstrap.
const [modules, terminalMode, todoMode, order] = process.argv.slice(2);
const piVersion = JSON.parse(
	await readFile(join(modules, "@earendil-works/pi-coding-agent/package.json"), "utf8"),
).version;
const extension = await resolveTodoExtension();
const todoRoot = dirname(extension);
const loadTodo = (file) => import(pathToFileURL(join(todoRoot, file)).href);
const workspace = await createWorkspace({ mcp: false });
Object.assign(process.env, workspace.isolationEnv, { OMPS_CHILD: "", OMPS_REGISTRY: "" });
delete process.env.OMPS_REGISTRY;
const preferencesPath = await seedTodoPreferences(workspace.agentDir, todoMode);
await writeFile(
	preferencesPath,
	`${JSON.stringify({ mode: todoMode, maxWidgetLines: 7, collapseKey: "ctrl+shift+t", sentinel: "keep" }, null, 2)}\n`,
);
const change = join(workspace.cwd, "openspec", "changes", "preserve-parent");
await mkdir(change, { recursive: true });
await writeFile(join(workspace.cwd, "openspec", "config.yaml"), "schema: spec-driven\n");
const tasksPath = join(change, "tasks.md");
await writeFile(tasksPath, "# Tasks\n\n- [ ] 1.1 Preserve parent task\n");
await writeFile(join(change, "proposal.md"), "# Preserve parent tasks\n");
await writeFixturePersona(workspace.agentDir, "leaf.md", "Child-only persona");
const registryPath = join(workspace.agentDir, "omps/config.yaml");
await writeFile(
	registryPath,
	`# Preserve mapping\nversion: 1\nlimits: { maxDepth: 3, maxConcurrentRuns: 4 }\n# Opt-in keys, so the coexistence check still covers both extensions' shortcuts.\nui: { toggleKey: alt+o, inspectKey: alt+i }\nagents:\n  leaf:\n    persona: ./personas/leaf.md\n    tools: [todo]\n    model: fake/counter\n    thinking: off\n    extensions: [${JSON.stringify(extension)}]\n`,
);
const mappingBefore = parse(await readFile(registryPath, "utf8")).agents;
// The legacy display file is a read-only import source now; seed it as an upgrading operator would have it.
const legacyPath = join(workspace.root, "config", "pi-subagents", "config.json");
await mkdir(dirname(legacyPath), { recursive: true });
await writeFile(legacyPath, `${JSON.stringify({ maxVisibleAgents: 1 }, null, 2)}\n`);
const legacyBefore = await readFile(legacyPath, "utf8");
const piSettings = join(workspace.agentDir, "settings.json");
await writeFile(piSettings, '{"defaultModel":"counter","defaultProvider":"fake"}\n');
const native = await createTodoViewerHost(modules, terminalMode, workspace.root);
const { host, ui, terminal, editor, flush, wait, choose, edit, SessionManager } = native;
const sessionManager = SessionManager.inMemory(workspace.cwd);
const childManager = SessionManager.inMemory(workspace.cwd);
const owner = sessionManager.getSessionId();
const childSessionId = childManager.getSessionId();
const parentMode =
	todoMode === "normal"
		? { mode: "normal" }
		: {
				mode: "openspec",
				binding: { root: await realpath(workspace.cwd), change: "preserve-parent" },
			};
sessionManager.appendCustomEntry("pi-todo-session", parentMode);
childManager.appendCustomEntry("pi-todo-session", { mode: "normal" });
const ctx = {
	mode: "tui",
	hasUI: true,
	cwd: workspace.cwd,
	sessionManager,
	model: { provider: "fake", id: "counter" },
	ui: host.createExtensionUIContext(),
};
const childCtx = { ...ctx, hasUI: false, mode: "rpc", sessionManager: childManager };
const tools = new Map();
const commands = new Map();
const renderers = new Map();
const messageRenderers = new Map();
const shortcuts = new Map();
const hooks = [];
const messages = [];
Object.assign(host, {
	runtimeHost: {
		session: {
			sessionManager,
			settingsManager: SettingsManager.inMemory({ enableSkillCommands: false }),
			promptTemplates: [],
			extensionRunner: {
				getRegisteredCommands: () =>
					[...commands].map(([name, command]) => ({ ...command, name, invocationName: name })),
			},
		},
	},
	autocompleteProviderWrappers: [],
	skillCommands: new Map(),
});
host.setupAutocompleteProvider();
const forbidden = () => {
	throw Error("Viewer/settings must not change model, permissions or request a turn");
};
const api = (source) => ({
	registerTool: (tool) => {
		assert(!tools.has(tool.name));
		tools.set(tool.name, tool);
	},
	registerCommand: (name, command) => {
		assert(!commands.has(name));
		commands.set(name, command);
	},
	registerEntryRenderer: (name, renderer) => renderers.set(name, renderer),
	registerMessageRenderer: (name, renderer) => messageRenderers.set(name, renderer),
	registerShortcut: (key, shortcut) => {
		assert(!shortcuts.has(key));
		shortcuts.set(key, { ...shortcut, source });
	},
	on: (name, handler) => hooks.push({ source, name, handler }),
	appendEntry: (type, data) => sessionManager.appendCustomEntry(type, data),
	sendMessage: (message) => messages.push(message),
	sendUserMessage: forbidden,
	setActiveTools: forbidden,
	setModel: forbidden,
	setThinkingLevel: forbidden,
	getActiveTools: () => ["todo", "omps"],
});
const emit = async (name, context, source) => {
	for (const hook of hooks)
		if (hook.name === name && (!source || source === hook.source)) await hook.handler({ type: name }, context);
};
let runtimeOf;
const loadOmps = () => {
	runtimeOf = registerRuntime(api("omps"));
};
const loadRealTodo = async () => {
	await (await import(pathToFileURL(extension).href)).default(api("todo"));
};
const todo = async (params, context = ctx) => {
	const result = await tools.get("todo").execute("todo-call", params, undefined, undefined, context);
	assert.equal(result.details.error, undefined, JSON.stringify(result));
	return { ...result.details, text: result.content.map((block) => block.text).join("\n") };
};
try {
	if (order === "omps-first") {
		loadOmps();
		await loadRealTodo();
	} else {
		await loadRealTodo();
		loadOmps();
	}
	assert(messageRenderers.has("omps-result"), "OMPS registers its result renderer beside the todo entry renderer");
	await emit("session_start", ctx);
	await emit("session_start", childCtx, "todo");
	if (todoMode === "normal") await todo({ action: "create", subject: "Parent-only task" });
	await commands.get("todos").handler("refresh", ctx);
	await todo({ action: "create", subject: "Child-only task" }, childCtx);
	await todo({ action: "update", id: 1, status: "in_progress", activeForm: "checking child work" }, childCtx);
	const parentBefore = await todo({ action: "list" });
	const childBefore = await todo({ action: "list" }, childCtx);
	assert.equal(childBefore.tasks.length, 1);
	assert.equal(childBefore.tasks[0].id, 1);
	assert.equal(childBefore.tasks[0].status, "in_progress");
	assert(
		JSON.stringify(parentBefore).includes(todoMode === "normal" ? "Parent-only task" : "Preserve parent task"),
		JSON.stringify({ parentBefore, notifications: native.notifications }),
	);
	assert(!JSON.stringify(parentBefore).includes("Child-only task"));
	const bytesBefore = await Promise.all([preferencesPath, tasksPath, piSettings].map((path) => readFile(path)));
	const entriesBefore = JSON.stringify(sessionManager.getBranch());
	const { getSessionMode } = await loadTodo("session-mode.ts");
	const { getPreferences } = await loadTodo("preferences.ts");
	assert.deepEqual(getSessionMode(owner), parentMode);
	assert.deepEqual(getSessionMode(childSessionId), { mode: "normal" });
	const cacheBefore = getPreferences();
	assert.deepEqual([...shortcuts].map(([key, value]) => [key, value.source]).toSorted(), [
		// Todo's default shortcut and OMPS's view/result keys coexist in either load order.
		["alt+i", "omps"],
		["alt+o", "omps"],
		["ctrl+shift+e", "omps"],
		["ctrl+shift+t", "todo"],
	]);
	const definitionsBefore = [...tools].map(([name, tool]) => [name, JSON.stringify(tool.parameters)]);
	assert.deepEqual(tools.get("omps").parameters.properties.action.enum, ["list", "run", "status", "cancel"]);

	// Initialise the real lazy runtime without launching work, then seed display evidence only.
	await tools.get("omps").execute("list", { action: "list" }, undefined, undefined, ctx);
	const runtime = runtimeOf();
	const root = {
		id: "root",
		owner,
		agent: "leaf",
		state: "running",
		startedAt: 1,
		cwd: workspace.cwd,
		nesting: { registryPath, rootSessionId: owner, depth: 1, maxDepth: 3 },
	};
	assert(runtime.observations.updateRoot(root, { model: "fake/counter" }));
	assert(runtime.observations.bindChildSession({ owner, runId: "root" }, childSessionId));
	assert.equal(
		runtime.observations.ingest(
			{ owner, runId: "root" },
			{
				owner: childSessionId,
				rootSessionId: owner,
				runId: "descendant",
				parentRunId: "root",
				depth: 2,
				agent: "reader",
				state: "running",
				startedAt: 2,
				revision: 1,
				activeTools: [],
			},
		),
		"accepted",
	);
	for (const node of runtime.observations.tree(owner, "root").nodes) {
		const directory = join(workspace.agentDir, "omps", "runs", node.owner, node.runId);
		await mkdir(directory, { recursive: true });
		await writeFile(
			join(directory, "config.json"),
			JSON.stringify({
				runId: node.runId,
				owner: node.owner,
				createdAt: node.startedAt,
				agent: { name: node.agent },
				task: `Saved task ${node.runId}`,
				nesting: { rootSessionId: owner, parentRunId: node.parentRunId, depth: node.depth },
			}),
		);
		await writeFile(join(directory, "output.md"), `Saved output ${node.runId}`);
	}
	runtime.viewer.activate(ctx);
	const identity = { owner, runId: "root", agent: "leaf" };
	const card = native.card(tools.get("omps"), {
		content: [{ type: "text", text: "Started run root (leaf)." }],
		details: identity,
	});
	const entry = native.entry(identity, renderers.get("omps-tree"));
	// Exercise the real compact panel and session-bound messenger without launching a process.
	const binding = new SessionBinding();
	binding.bind(ctx);
	// The real fleet widgets over a session-bound messenger, without launching a process.
	const fleet = new FleetWidget({
		messenger: (sessionOwner) => binding.messenger(api("omps"), sessionOwner),
		runs: (sessionOwner) => (sessionOwner === owner ? [{ ...root, id: root.id }] : []),
		trees: (sessionOwner) => runtime.observations.trees(sessionOwner),
		toolUses: () => 2,
		visibleAgents: () => 4,
		// Start collapsed so the toggle path below still proves the opt-in expansion.
		strip: new FleetStrip(() => "collapsed"),
		mode: () => "tui",
		now: () => root.startedAt + 1000,
	});
	fleet.attach(owner);
	fleet.onChange(root);
	await flush();
	// The OMPS tree joins todo above the editor under its own key; the list stays below.
	assert.deepEqual([...host.extensionWidgetsAbove.keys()].toSorted(), [
		"omps-agents",
		"omps-result-render",
		"rpiv-todos",
	]);
	assert.deepEqual([...host.extensionWidgetsBelow.keys()].toSorted(), ["omps"]);
	// Pi's theme colours the tree; compare the visible text.
	const treeText = () => stripVTControlCharacters(host.extensionWidgetsAbove.get("omps-agents").render(100).join("\n"));
	assert.equal(treeText(), "● Agents · 1 running", "the collapsed tree reports the run in its heading");
	const todoWidget = host.extensionWidgetsAbove.get("rpiv-todos");
	const todoText = () => todoWidget.render(100).join("\n");
	// Visual evidence: the expanded tree beside the todo widget, then the list below the editor.
	fleet.toggle();
	await flush();
	assert.match(treeText(), /└─ \S leaf/);
	await createSnapshotCapture({
		ui,
		terminal,
		directory: workspace.root,
		version: piVersion,
		mode: terminalMode,
		theme: todoMode,
	})(`beside-todo-${order}`, [
		...todoWidget.render(100),
		...host.extensionWidgetsAbove.get("omps-agents").render(100),
		"─".repeat(20),
		...host.extensionWidgetsBelow.get("omps").render(100),
	]);
	fleet.toggle();
	await flush();
	assert(todoText().includes(todoMode === "normal" ? "Parent-only task" : "Preserve parent task"));
	const widgetBefore = todoText();
	await shortcuts.get("ctrl+shift+e").handler(ctx);
	await flush();
	assert.equal(todoText(), widgetBefore, "OMPS result expansion leaves the sibling todo widget unchanged");
	editor.setText("Preserved parent prompt");
	await flush();
	assert.equal(card.expanded, false);
	terminal.input("\x0f");
	assert.equal(card.expanded, true);
	// Host expansion reveals the acknowledgement only; the live tree stays out of the transcript.
	assert(card.render(100).join("\n").includes("OMPS: leaf started (root)"));
	assert(entry.render(100).join("\n").includes("OMPS: leaf started (root)"));
	assert(!card.render(100).join("\n").includes("reader running"));
	await shortcuts.get("ctrl+shift+t").handler(ctx);
	assert(todoText().includes("to expand"));
	assert(card.render(100).join("\n").includes("OMPS: leaf started (root)"));
	await shortcuts.get("ctrl+shift+t").handler(ctx);
	assert.equal(todoText(), widgetBefore);

	const inspect = commands.get("omps").handler("inspect descendant", ctx);
	await wait(() => ui.getFocusedComponent() !== editor, "native inspector focus");
	await wait(
		() => ui.getFocusedComponent().render(100).join("\n").includes("Saved task descendant"),
		"selected details",
	);
	assert(ui.getFocusedComponent().render(100).join("\n").includes("Saved output descendant"));
	// The modal owns focus while the sibling keeps its widget and content untouched.
	assert.equal(todoText(), widgetBefore);
	terminal.input("\x1b");
	await inspect;
	assert.equal(ui.getFocusedComponent(), editor);
	assert.equal(editor.getText(), "Preserved parent prompt");
	const settings = commands.get("subagents-settings").handler("", ctx);
	await edit(0, "2");
	await edit(1, "2");
	await edit(2, "1");
	await edit(0, "0", false);
	// The new result shortcut precedes capabilities and Done in the refreshed menu.
	await choose(11);
	await settings;
	assert.equal(ui.getFocusedComponent(), editor);
	assert.equal(editor.getText(), "Preserved parent prompt");
	const savedRegistry = await readFile(registryPath, "utf8");
	assert(savedRegistry.includes("maxDepth: 2"));
	assert(savedRegistry.includes("maxConcurrentRuns: 2"));
	assert(savedRegistry.includes("# Preserve mapping"));
	assert.deepEqual(parse(savedRegistry).agents, mappingBefore);
	assert.deepEqual(await readFile(legacyPath, "utf8"), legacyBefore);
	assert.deepEqual(JSON.parse(await readFile(join(workspace.root, "config", "pi-subagents", "config.json"), "utf8")), {
		maxVisibleAgents: 1,
	});
	assert(card.render(100).join("\n").includes("OMPS: leaf started (root)"));
	assert(!card.render(100).join("\n").includes("hidden agents"));
	assert.equal(runtime.observations.tree(owner, "root").nodes.length, 2);
	assert.equal(runtime.observations.node(owner, "root", "root").state, "running");
	assert.deepEqual(runtime.manager.list(owner), []);
	assert.deepEqual(await todo({ action: "list" }), parentBefore);
	assert.deepEqual(await todo({ action: "list" }, childCtx), childBefore);
	assert.deepEqual(getSessionMode(owner), parentMode);
	assert.deepEqual(getSessionMode(childSessionId), { mode: "normal" });
	assert.deepEqual(getPreferences(), cacheBefore);
	assert.equal(JSON.stringify(sessionManager.getBranch()), entriesBefore);
	for (const [index, path] of [preferencesPath, tasksPath, piSettings].entries())
		assert.deepEqual(await readFile(path), bytesBefore[index], `Todo/Pi bytes changed: ${path}`);
	assert.equal(host.extensionWidgetsAbove.get("rpiv-todos"), todoWidget);
	assert.equal(todoText(), widgetBefore);
	assert.deepEqual(
		[...tools].map(([name, tool]) => [name, JSON.stringify(tool.parameters)]),
		definitionsBefore,
	);
	assert.deepEqual([...shortcuts].map(([key, value]) => [key, value.source]).toSorted(), [
		["alt+i", "omps"],
		["alt+o", "omps"],
		["ctrl+shift+e", "omps"],
		["ctrl+shift+t", "todo"],
	]);
	assert.equal(workspace.model.requests.length, 0);
	assert.deepEqual(messages, []);
	assert.deepEqual(
		native.notifications.filter((item) => item.level === "error"),
		[],
	);
} finally {
	await emit("session_shutdown", childCtx, "todo");
	await emit("session_shutdown", ctx);
	ui.stop();
	await workspace.dispose();
}
console.log(JSON.stringify({ terminalMode, todoMode, order, verified: true }));
