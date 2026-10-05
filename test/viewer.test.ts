import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { ObservationStore } from "../src/observation.ts";
import type { RunDetails } from "../src/details.ts";
import type { DisplayPreferences } from "../src/settings-persistence.ts";
import { RunViewer } from "../src/viewer.ts";
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../src/details.ts", async (original) => ({
	...(await original<typeof import("../src/details.ts")>()),
	createDetailReader: () => mocks.read,
}));
function setup() {
	mocks.read.mockReset();
	const observations = new ObservationStore();
	const stops: Array<ReturnType<typeof vi.fn>> = [];
	const subscribe = observations.subscribe.bind(observations);
	vi.spyOn(observations, "subscribe").mockImplementation((session, callback, runId) => {
		const stop = vi.fn(subscribe(session, callback, runId));
		stops.push(stop);
		return stop;
	});
	const root = {
		id: "owned",
		owner: "session",
		agent: "worker",
		state: "running" as const,
		startedAt: 1,
		cwd: "/work",
		nesting: { registryPath: "/registry", rootSessionId: "session", depth: 1, maxDepth: 2 },
	};
	observations.updateRoot(root);
	let owner = "session";
	const preferences = { value: 4, ensureLoaded: async () => ({ diagnostics: [] }) } as unknown as DisplayPreferences;
	const redraw = vi.fn();
	const notify = vi.fn();
	const context = {
		hasUI: true,
		mode: "rpc",
		sessionManager: { getSessionId: () => "session" },
		ui: { notify, custom: vi.fn() },
	} as unknown as ExtensionContext;
	const viewer = new RunViewer({ observations, preferences, storeRoot: "/saved", owner: () => owner, redraw });
	const details: RunDetails = {
		node: observations.node("session", "owned", "owned")!,
		task: "Selected task",
		output: "Selected output",
		outputPath: "/saved/output.md",
		partial: false,
		taskTruncated: false,
		outputTruncated: false,
	};
	return {
		observations,
		stops,
		root,
		viewer,
		context,
		details,
		redraw,
		notify,
		replace: () => {
			owner = "new-session";
		},
	};
}
describe("viewer lifecycle", () => {
	it("disposes the modal when the host rejects its custom UI promise", async () => {
		const fixture = setup();
		mocks.read.mockImplementation(async () => new Promise(() => {}));
		const ctx = { ...fixture.context, mode: "tui" as const };
		vi.mocked(ctx.ui.custom).mockImplementation(async (factory) => {
			await factory(
				{ terminal: { rows: 40 }, requestRender: vi.fn() } as never,
				undefined as never,
				undefined as never,
				vi.fn(),
			);
			throw new Error("host failed");
		});
		await expect(fixture.viewer.inspect("owned", ctx)).rejects.toThrow("host failed");
		expect((mocks.read.mock.calls[0][2] as AbortSignal).aborted).toBe(true);
		fixture.viewer.dispose();
	});
	it("drops a late host error after session replacement", async () => {
		const fixture = setup();
		let reject!: (error: Error) => void;
		const ctx = { ...fixture.context, mode: "tui" as const };
		vi.mocked(ctx.ui.custom).mockImplementation(
			async () =>
				new Promise((_done, fail) => {
					reject = fail;
				}),
		);
		const inspecting = fixture.viewer.inspect("owned", ctx);
		fixture.replace();
		reject(new Error("late host error"));
		await expect(inspecting).resolves.toBeUndefined();
		expect(fixture.notify).not.toHaveBeenCalled();
		fixture.viewer.dispose();
	});
	it("bounds RPC summaries and avoids custom terminal components", async () => {
		const fixture = setup();
		mocks.read.mockResolvedValue({ ...fixture.details, output: "x".repeat(128 * 1024) });
		await fixture.viewer.inspect("owned", fixture.context);
		const text = fixture.notify.mock.calls[0][0] as string;
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(64 * 1024);
		expect(text).toContain("truncated");
		expect(fixture.context.ui.custom).not.toHaveBeenCalled();
		fixture.viewer.dispose();
	});
	it("W1: shows sanitised active tool names within the fixed observation bound", async () => {
		const fixture = setup();
		fixture.observations.updateRoot(fixture.root, {
			activeTools: [
				{ id: "private-call-id", name: "\x1b[31mread\x1b[0m\u202e\x07" },
				...Array.from({ length: 4 }, (_, id) => ({ id: `call-${id}`, name: `tool_${id}` })),
			],
		});
		mocks.read.mockResolvedValue({
			...fixture.details,
			node: fixture.observations.node("session", "owned", "owned")!,
		});
		await fixture.viewer.inspect("owned", fixture.context);
		const text = fixture.notify.mock.calls[0][0] as string;
		expect(text).toContain("Tools: read, tool_0, tool_1, tool_2");
		expect(text).not.toContain("tool_3");
		expect(text).not.toContain("private-call-id");
		expect(text).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/);
		expect(Buffer.byteLength(text)).toBeLessThanOrEqual(64 * 1024);
		fixture.viewer.dispose();
	});
	it.each(["connection-lost", "nodes-omitted"] as const)(
		"W2: labels tree-level %s in RPC tree and selected details with complete retained nodes",
		async (reason) => {
			const fixture = setup();
			fixture.observations.markIncomplete({ owner: "session", runId: "owned" }, reason);
			const before = fixture.observations.tree("session", "owned");
			expect(before?.nodes.every((node) => !node.incomplete)).toBe(true);
			await fixture.viewer.inspect(undefined, fixture.context);
			let text = fixture.notify.mock.calls.at(-1)![0] as string;
			expect(text).toContain(`Tree observation incomplete: ${reason}`);
			expect(text).not.toContain("hidden agents");
			expect(mocks.read).not.toHaveBeenCalled();
			mocks.read.mockResolvedValue(fixture.details);
			await fixture.viewer.inspect("owned", fixture.context);
			text = fixture.notify.mock.calls.at(-1)![0] as string;
			expect(text).toContain(`Tree observation incomplete: ${reason}`);
			expect(text).not.toContain("Selected observation incomplete");
			expect(text).not.toContain("hidden agents");
			expect(fixture.observations.tree("session", "owned")).toEqual(before);
			expect(fixture.context.ui.custom).not.toHaveBeenCalled();
			fixture.viewer.dispose();
		},
	);
	it("W2: labels missing terminal evidence for the selected descendant without inventing completion", async () => {
		const fixture = setup();
		fixture.observations.bindChildSession({ owner: "session", runId: "owned" }, "child-session");
		expect(
			fixture.observations.ingest(
				{ owner: "session", runId: "owned" },
				{
					owner: "child-session",
					rootSessionId: "session",
					runId: "descendant",
					parentRunId: "owned",
					depth: 2,
					agent: "reader",
					state: "running",
					startedAt: 1,
					revision: 1,
					activeTools: [],
				},
			),
		).toBe("accepted");
		fixture.observations.updateRoot({ ...fixture.root, state: "completed" });
		mocks.read.mockResolvedValue({
			...fixture.details,
			node: fixture.observations.node("session", "owned", "descendant")!,
		});
		await fixture.viewer.inspect("descendant", fixture.context);
		const text = fixture.notify.mock.calls.at(-1)![0] as string;
		expect(text).toContain("Selected observation incomplete: ancestor-terminal");
		expect(text).toContain("terminal evidence missing");
		expect(text).toContain("State: running");
		expect(fixture.observations.node("session", "owned", "descendant")?.state).toBe("running");
		fixture.viewer.dispose();
	});
	it.each(["loss", "recovery"])("W2: uses fresh evidence after a delayed RPC read during %s", async (change) => {
		const fixture = setup();
		const connection = { owner: "session", runId: "owned" };
		if (change === "recovery") fixture.observations.replaceReasons(connection, "owned", 1, ["tools-omitted"]);
		const stale = { ...fixture.details, node: fixture.observations.node("session", "owned", "owned")! };
		let resolve!: (value: RunDetails) => void;
		mocks.read.mockImplementation(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		const reading = fixture.viewer.inspect("owned", fixture.context);
		if (change === "loss") fixture.observations.markIncomplete(connection);
		else fixture.observations.replaceReasons(connection, "owned", 2, []);
		resolve(stale);
		await reading;
		const text = fixture.notify.mock.calls.at(-1)![0] as string;
		if (change === "loss") expect(text).toContain("Tree observation incomplete: connection-lost");
		else expect(text).not.toMatch(/observation incomplete|tools-omitted/i);
		expect(mocks.read).toHaveBeenCalledTimes(1);
		fixture.viewer.dispose();
	});
	it.each(["shutdown", "replacement"])("drops delayed RPC details after %s", async (reason) => {
		const fixture = setup();
		let resolve!: (value: RunDetails) => void;
		mocks.read.mockImplementation(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		const reading = fixture.viewer.inspect("owned", fixture.context);
		if (reason === "shutdown") fixture.viewer.dispose();
		else fixture.replace();
		resolve(fixture.details);
		await reading;
		expect(fixture.notify).not.toHaveBeenCalled();
		fixture.viewer.dispose();
	});
	it("aborts selected RPC file work when the viewer is disposed", async () => {
		const fixture = setup();
		let resolve!: (value: RunDetails) => void;
		mocks.read.mockImplementation(
			async () =>
				new Promise((done) => {
					resolve = done;
				}),
		);
		const reading = fixture.viewer.inspect("owned", fixture.context);
		const signal = mocks.read.mock.calls[0][2] as AbortSignal;
		expect(signal).toBeInstanceOf(AbortSignal);
		fixture.viewer.dispose();
		expect(signal.aborted).toBe(true);
		resolve(fixture.details);
		await reading;
	});
	it("detaches observation callbacks and preserves authoritative run state", async () => {
		const fixture = setup();
		fixture.viewer.activate(fixture.context);
		await Promise.resolve();
		fixture.viewer.dispose();
		const calls = fixture.redraw.mock.calls.length;
		fixture.observations.updateRoot(fixture.root);
		expect(fixture.redraw).toHaveBeenCalledTimes(calls);
		expect(fixture.stops).toHaveLength(1);
		expect(fixture.stops[0]).toHaveBeenCalledTimes(1);
		expect(fixture.observations.node("session", "owned", "owned")!.state).toBe("running");
	});
});
