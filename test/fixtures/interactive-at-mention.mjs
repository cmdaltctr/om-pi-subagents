import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import omps from "../../src/index.ts";
import { createWorkspace, PI_BIN } from "./pi-rpc.ts";
import { fixtureRegistryPath, writeFixturePersona, writeFixtureRegistry } from "./registry.ts";
import { createAtMentionHost } from "./at-mention-host.mjs";

const [modulesPath, scenario] = process.argv.slice(2);
const modules = resolve(modulesPath);
const sdk = await import(pathToFileURL(join(modules, "@earendil-works/pi-coding-agent/dist/index.js")).href);
const workspace = await createWorkspace({ mcp: false });
Object.assign(process.env, workspace.isolationEnv, {
	OMPS_PI_BIN: PI_BIN,
	OMPS_REGISTRY: fixtureRegistryPath(workspace.agentDir),
});
const registry = (extras = "", name = "reader") =>
	`version: 1\n${extras}agents:\n  ${name}:\n    persona: ./personas/reader.md\n    tools: [read]\n    thinking: off\n`;
const waitFor = async (condition, message) => {
	for (let attempts = 0; !condition(); attempts++) {
		assert(attempts < 1200, message);
		await new Promise((done) => setTimeout(done, 10));
	}
};
const isChild = (body) => JSON.stringify(body).includes("AT-MENTION-CHILD-PERSONA");
const parentRequests = () => workspace.model.requests.filter((body) => !isChild(body));
const childRequests = () => workspace.model.requests.filter(isChild);
let native;
let session;
let release;
let inputEvents = [];
const errors = [];
try {
	await writeFixturePersona(workspace.agentDir, "reader.md", "AT-MENTION-CHILD-PERSONA: read the task.");
	await writeFixtureRegistry(workspace.agentDir, registry());
	await writeFile(join(workspace.cwd, "README.md"), "DISPOSABLE FILE CONTENT");
	const held = new Promise((done) => {
		release = done;
	});
	workspace.model.script = async (body) => {
		if (!isChild(body)) return { text: "PARENT ANSWER" };
		await held;
		return { text: "CHILD ANSWER" };
	};
	const settingsManager = sdk.SettingsManager.inMemory({ enableSkillCommands: false, compaction: { enabled: false } });
	const modelRuntime = await sdk.ModelRuntime.create({
		authPath: join(workspace.agentDir, "auth.json"),
		modelsPath: join(workspace.agentDir, "models.json"),
		allowModelNetwork: false,
	});
	const resourceLoader = new sdk.DefaultResourceLoader({
		cwd: workspace.cwd,
		agentDir: workspace.agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noThemes: true,
		noPromptTemplates: true,
		noContextFiles: true,
		extensionFactories: [
			(pi) =>
				pi.on("input", (event, ctx) => {
					inputEvents.push({ text: event.text, source: event.source, mode: ctx.mode });
				}),
			omps,
		],
	});
	await resourceLoader.reload();
	({ session } = await sdk.createAgentSession({
		cwd: workspace.cwd,
		agentDir: workspace.agentDir,
		settingsManager,
		modelRuntime,
		model: modelRuntime.getModel("fake", "counter"),
		resourceLoader,
		sessionManager: sdk.SessionManager.inMemory(workspace.cwd),
		thinkingLevel: "off",
		tools: [],
	}));
	native = await createAtMentionHost(modules, session, workspace.cwd);
	const uiContext = native.host.createExtensionUIContext();
	let notificationAttempts = 0;
	if (scenario.startsWith("notify-")) {
		uiContext.notify = () => {
			notificationAttempts++;
			throw new Error("disposable notification failure");
		};
	}
	await session.bindExtensions({
		uiContext,
		mode: scenario === "non-tui" ? "rpc" : "tui",
		onError: (error) => errors.push(error),
	});
	assert.equal(native.host.autocompleteProviderWrappers.length, scenario === "non-tui" ? 0 : 1);
	const acknowledgements = () => native.notifications.filter(({ message }) => message.startsWith("Started run "));
	const results = () =>
		session.sessionManager
			.getBranch()
			.filter((entry) => entry.type === "custom_message" && entry.customType === "omps-result");
	const trees = () =>
		session.sessionManager.getBranch().filter((entry) => entry.type === "custom" && entry.customType === "omps-tree");
	const checkLaunch = async (task) => {
		assert.equal(acknowledgements().length, 1, "direct launch must acknowledge without a parent model request");
		assert.equal(trees().length, 1, "direct launch must append the same tree entry as /omps run");
		await waitFor(() => childRequests().length === 1, "child request must reach the held fake model");
		assert.equal(parentRequests().length, 0, "the held child proves there is no parent launch-routing request");
		assert.equal(results().length, 0, "completion must wait for the held child");
		assert(JSON.stringify(childRequests()[0]).includes(task), "child task must preserve the submitted text");
		release();
		await waitFor(() => results().length === 1, "a completed child must deliver its result separately");
		assert.equal(results()[0].details.state, "completed");
		assert(results()[0].content.includes("CHILD ANSWER"));
		assert.equal(await readFile(join(results()[0].details.directory, "output.md"), "utf8"), "CHILD ANSWER");
		await waitFor(() => parentRequests().length === 1, "result delivery must wake the parent");
		await session.waitForIdle();
		assert(JSON.stringify(parentRequests()[0]).includes("OMPS run"));
	};

	if (scenario === "launch" || scenario === "leading-space") {
		await native.submit(`${scenario === "leading-space" ? " " : ""}@reader inspect src`);
		assert.equal(inputEvents[0].text, "@reader inspect src", "Pi must trim before the input hook");
		await checkLaunch("inspect src");
	} else if (scenario === "pick-and-file") {
		native.terminal.input("@");
		await waitFor(() => native.editor.isShowingAutocomplete(), "typing @ must open the native completion menu");
		native.terminal.input("\t");
		assert.equal(native.editor.getText(), "@reader ");
		assert.deepEqual(native.editor.getCursor(), { line: 0, col: 8 });
		for (const letter of "inspect src") native.terminal.input(letter);
		native.terminal.input("\r");
		await waitFor(() => acknowledgements().length === 1, "native selection must launch a run");
		await checkLaunch("inspect src");
		await native.submit("@README.md summarise this");
		assert.equal(parentRequests().length, 2);
		assert(JSON.stringify(parentRequests()[1]).includes("@README.md summarise this"));
	} else if (scenario.startsWith("notify-")) {
		if (scenario === "notify-registry")
			await writeFixtureRegistry(workspace.agentDir, "version: 1\nagents: [invalid]\n");
		if (scenario === "notify-admission")
			await writeFixtureRegistry(workspace.agentDir, registry("limits: { maxDepth: 0 }\n"));
		const texts = scenario === "notify-guidance" ? ["@nobody do it", "@reader"] : ["@reader inspect src"];
		for (const text of texts) await native.submit(text);
		assert(notificationAttempts > 0, "the notification must throw during input handling");
		assert.equal(parentRequests().length, 0, "notification failure must never forward launch input to the parent");
		assert.equal(trees().length, scenario === "notify-acknowledgement" ? 1 : 0);
		if (scenario === "notify-acknowledgement") {
			await waitFor(() => childRequests().length === 1, "an acknowledgement failure must keep the admitted run");
			assert.equal(results().length, 0, "the admitted child must remain held during the routing check");
		} else assert.equal(childRequests().length, 0);
	} else if (scenario === "bare-at") {
		await native.submit("@");
		assert.equal(parentRequests().length, 1);
		assert.equal(acknowledgements().length, 0);
		assert.equal(native.notifications.length, 0);
	} else if (scenario === "guidance") {
		for (const text of ["@nobody do it", "@reader", "@reader \n\t  "]) await native.submit(text);
		assert(native.notifications.some(({ message }) => /unknown agent.*nobody.*mapped agents: reader/i.test(message)));
		assert(native.notifications.some(({ message }) => message.includes("Usage: @reader <task>")));
		assert.equal(workspace.model.requests.length, 0);
		assert.equal(trees().length, 0);
	} else if (scenario === "registry") {
		// Refresh must drop the successful names read, including for a bare @ or file-like input.
		await native.host.autocompleteProvider.getSuggestions(["@"], 0, 1, { signal: new AbortController().signal });
		await writeFixtureRegistry(workspace.agentDir, "version: 1\nagents: [invalid]\n");
		for (const text of ["@reader inspect src", "@", "@README.md inspect src"]) await native.submit(text);
		assert.equal(
			native.notifications.filter(({ message, level }) => level === "error" && /agents.*mapping/i.test(message)).length,
			3,
		);
		assert.equal(workspace.model.requests.length, 0);
		assert.equal(trees().length, 0);
		await writeFixtureRegistry(workspace.agentDir, registry("", "fresh-reader"));
		await native.submit("@reader inspect src");
		assert(native.notifications.at(-1).message.includes("mapped agents: fresh-reader"));
		assert.equal(workspace.model.requests.length, 0);
	} else if (scenario === "capacity" || scenario === "depth") {
		if (scenario === "capacity") {
			await native.submit("@reader first task");
			await waitFor(() => childRequests().length === 1, "capacity test must hold an admitted child");
		} else await writeFixtureRegistry(workspace.agentDir, registry("limits: { maxDepth: 0 }\n"));
		await native.submit("@reader refused task");
		const error = native.notifications.at(-1);
		assert.equal(error.level, "error");
		assert.match(
			error.message,
			scenario === "depth" ? /current depth 0.*attempted depth 1.*maxDepth 0/ : /maxConcurrentRuns|active run/,
		);
		await session.prompt("/omps run reader refused task");
		assert.deepEqual(native.notifications.at(-1), error, "admission errors must match /omps run");
		assert.equal(acknowledgements().length, scenario === "capacity" ? 1 : 0);
		assert.equal(parentRequests().length, 0);
	} else if (scenario === "readiness") {
		await writeFixtureRegistry(
			workspace.agentDir,
			registry().replace("thinking: off", "thinking: off\n    model: fake/missing"),
		);
		await native.submit("@reader inspect src");
		assert.equal(acknowledgements().length, 1, "admission must acknowledge before readiness fails");
		await waitFor(() => results().length === 1, "readiness failure must arrive as a later failed result");
		assert.equal(results()[0].details.state, "failed");
		assert.match(results()[0].content, /missing|model/i);
		assert.equal(childRequests().length, 0);
		await waitFor(() => parentRequests().length === 1, "failed result must keep existing delivery behaviour");
		assert(JSON.stringify(parentRequests()[0]).includes("OMPS run"));
	} else if (scenario === "extension" || scenario === "non-tui" || scenario === "file" || scenario === "ordinary") {
		if (scenario !== "file") await writeFixtureRegistry(workspace.agentDir, "version: 1\nagents: [invalid]\n");
		const text =
			scenario === "ordinary"
				? "ordinary prompt"
				: scenario === "file"
					? "@README.md summarise this"
					: "@reader inspect src";
		if (scenario === "extension") await session.prompt(text, { source: "extension" });
		else await native.submit(text);
		assert.equal(parentRequests().length, 1);
		assert(JSON.stringify(parentRequests()[0]).includes(text));
		assert.equal(acknowledgements().length, 0);
		assert.equal(childRequests().length, 0);
	} else throw new Error(`Unknown scenario: ${scenario}`);
	assert.deepEqual(errors, [], "input and completion errors must be caught locally");
	console.log(
		JSON.stringify({
			scenario,
			verified: true,
			parentRequests: parentRequests().length,
			childRequests: childRequests().length,
			acknowledgements: acknowledgements().length,
			results: results().map((entry) => entry.details.state),
		}),
	);
} finally {
	release?.();
	await session?.extensionRunner.emit({ type: "session_shutdown", reason: "exit" });
	await session?.abort();
	session?.dispose();
	native?.stop();
	await workspace.dispose();
}
