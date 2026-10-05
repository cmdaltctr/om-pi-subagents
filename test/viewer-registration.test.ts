import type { ExtensionAPI, ExtensionCommandContext, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerOmpss } from "../src/index.ts";
import type { OmpssService } from "../src/service.ts";
import type { RunViewer } from "../src/viewer.ts";
import { TREE_ENTRY } from "../src/viewer.ts";
function setup(mode: "tui" | "rpc" | "print") {
	let tool: Parameters<ExtensionAPI["registerTool"]>[0];
	const commands = new Map<string, Parameters<ExtensionAPI["registerCommand"]>[1]>();
	const entryRenderer = vi.fn();
	const appendEntry = vi.fn();
	const pi = {
		registerTool: (value: typeof tool) => {
			tool = value;
		},
		registerCommand: (name: string, value: Parameters<ExtensionAPI["registerCommand"]>[1]) => commands.set(name, value),
		registerEntryRenderer: entryRenderer,
		appendEntry,
	};
	const activate = vi.fn();
	const render = vi.fn();
	const run = vi.fn(async () => "Started run owned (worker) in the background.");
	const service = {
		run,
		list: vi.fn(async () => "worker"),
		status: vi.fn(() => "running"),
		cancel: vi.fn(() => "cancelled"),
	} as unknown as OmpssService;
	const viewer = { activate, render } as unknown as RunViewer;
	registerOmpss(
		pi as unknown as ExtensionAPI,
		() => service,
		undefined,
		() => viewer,
	);
	const ctx = {
		mode,
		hasUI: mode !== "print",
		cwd: "/work",
		sessionManager: { getSessionId: () => "session" },
		ui: { notify: vi.fn() },
	} as unknown as ExtensionCommandContext;
	return { tool: tool!, commands, entryRenderer, appendEntry, activate, render, ctx };
}
describe("native tree registration", () => {
	it.each(["tui", "rpc", "print"] as const)("%s: creates slash-launch entries only for TUI", async (mode) => {
		const fixture = setup(mode);
		await fixture.commands.get("ompss")!.handler("run worker selected task", fixture.ctx);
		if (mode === "tui")
			expect(fixture.appendEntry).toHaveBeenCalledExactlyOnceWith(TREE_ENTRY, { owner: "session", runId: "owned" });
		else expect(fixture.appendEntry).not.toHaveBeenCalled();
		expect(fixture.ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Started run owned"), "info");
	});
	it("keeps launch acknowledgement text and gives the native renderer an owned identity", async () => {
		const fixture = setup("tui");
		const result = await fixture.tool.execute(
			"call",
			{ action: "run", agent: "worker", task: "selected task" },
			new AbortController().signal,
			undefined,
			fixture.ctx as unknown as ExtensionToolContext,
		);
		expect(result.content).toEqual([{ type: "text", text: "Started run owned (worker) in the background." }]);
		expect(result.details).toEqual({ owner: "session", runId: "owned" });
		expect(fixture.appendEntry).not.toHaveBeenCalled();
		expect(fixture.activate).toHaveBeenCalledWith(fixture.ctx);
	});
	it("uses the shared renderer and the host's expanded flag for tool and entry cards", () => {
		const fixture = setup("tui");
		const identity = { owner: "session", runId: "owned" };
		const component = { render: () => ["shared"], invalidate() {} };
		fixture.render.mockReturnValue(component);
		const state = { state: {}, invalidate: vi.fn() };
		expect(
			fixture.tool.renderResult!(
				{ content: [], details: identity },
				{ expanded: true, isPartial: false },
				undefined as never,
				state as never,
			),
		).toBe(component);
		expect(fixture.render).toHaveBeenCalledWith(identity, true, state);
		const renderer = fixture.entryRenderer.mock.calls[0][1];
		expect(renderer({ data: identity }, { expanded: true })).toBe(component);
		expect(fixture.render).toHaveBeenCalledWith(identity, true);
	});
});
