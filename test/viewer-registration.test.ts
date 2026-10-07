import type { ExtensionAPI, ExtensionCommandContext, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { registerOmps } from "../src/index.ts";
import type { OmpsService } from "../src/service.ts";
import type { RunViewer } from "../src/viewer.ts";
import type { FleetWidget } from "../src/fleet-widget.ts";
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
		listForms: vi.fn(async () => ({ full: "worker: tools [read, grep]", compact: "worker: 2 tools (read-only)" })),
		status: vi.fn(() => "running"),
		cancel: vi.fn(() => "cancelled"),
	} as unknown as OmpsService;
	const viewer = { activate, render } as unknown as RunViewer;
	const fleet = {
		toggle: vi.fn(),
		attach: vi.fn(),
		repaint: vi.fn(),
		treeLines: vi.fn((): string[] => []),
		listLines: vi.fn((): string[] => []),
	};
	registerOmps(
		pi as unknown as ExtensionAPI,
		() => service,
		undefined,
		() => viewer,
		() => fleet as unknown as FleetWidget,
	);
	const ctx = {
		mode,
		hasUI: mode !== "print",
		cwd: "/work",
		sessionManager: { getSessionId: () => "session" },
		ui: { notify: vi.fn(), custom: vi.fn() },
	} as unknown as ExtensionCommandContext;
	return { tool: tool!, commands, entryRenderer, appendEntry, activate, render, fleet, run, service, ctx };
}
describe("compact agent list", () => {
	it("shows the compact form for /omps list", async () => {
		const fixture = setup("tui");
		await fixture.commands.get("omps")!.handler("list", fixture.ctx);
		expect(fixture.ctx.ui.notify).toHaveBeenCalledExactlyOnceWith("worker: 2 tools (read-only)", "info");
	});

	it("gives the model every tool name but renders the compact form until expanded", async () => {
		const fixture = setup("tui");
		const result = await fixture.tool.execute(
			"call",
			{ action: "list" },
			new AbortController().signal,
			undefined,
			fixture.ctx as unknown as ExtensionToolContext,
		);
		expect(result.content).toEqual([{ type: "text", text: "worker: tools [read, grep]" }]);
		const text = (expanded: boolean) =>
			(
				fixture.tool.renderResult!(
					result as never,
					{ expanded, isPartial: false },
					undefined as never,
					undefined as never,
				) as {
					render(width: number): string[];
				}
			)
				.render(100)
				.join("\n")
				.trim();
		expect(text(false)).toBe("worker: 2 tools (read-only)");
		expect(text(true)).toBe("worker: tools [read, grep]");
	});
});

describe("native tree registration", () => {
	it.each(["tui", "rpc", "print"] as const)("%s: creates slash-launch entries only for TUI", async (mode) => {
		const fixture = setup(mode);
		await fixture.commands.get("omps")!.handler("run worker selected task", fixture.ctx);
		if (mode === "tui")
			expect(fixture.appendEntry).toHaveBeenCalledExactlyOnceWith(TREE_ENTRY, {
				owner: "session",
				runId: "owned",
				agent: "worker",
			});
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
		expect(result.details).toEqual({ owner: "session", runId: "owned", agent: "worker" });
		expect(fixture.appendEntry).not.toHaveBeenCalled();
		expect(fixture.activate).toHaveBeenCalledWith(fixture.ctx);
	});
	it("shares one compact acknowledgement renderer for tool and entry cards", () => {
		const fixture = setup("tui");
		const identity = { owner: "session", runId: "owned", agent: "worker" };
		const component = { render: () => ["acknowledged"], invalidate() {} };
		fixture.render.mockReturnValue(component);
		expect(
			fixture.tool.renderResult!(
				{ content: [], details: identity },
				{ expanded: true, isPartial: false },
				undefined as never,
				undefined as never,
			),
		).toBe(component);
		// Expansion reveals acknowledgement text only; it never requests a live per-run tree.
		// The tool passes its captured text; an empty result content becomes an empty reveal.
		expect(fixture.render).toHaveBeenCalledWith(identity, true, "");
		const renderer = fixture.entryRenderer.mock.calls[0][1];
		expect(renderer({ data: identity }, { expanded: true })).toBe(component);
		// Historical entries carry no launch text at all.
		expect(fixture.render).toHaveBeenCalledWith(identity, true, undefined);
	});
	it.each(["tui", "rpc"] as const)("%s: /omps fleet toggles the strip and reports an empty session", async (mode) => {
		const fixture = setup(mode);
		await fixture.commands.get("omps")!.handler("fleet", fixture.ctx);
		expect(fixture.fleet.toggle).toHaveBeenCalledTimes(1);
		expect(fixture.fleet.treeLines).toHaveBeenCalledExactlyOnceWith("session", 200);
		expect(fixture.fleet.listLines).toHaveBeenCalledExactlyOnceWith("session", 200);
		expect(fixture.ctx.ui.notify).toHaveBeenCalledExactlyOnceWith("No runs in this session.", "info");
		expect(fixture.run).not.toHaveBeenCalled();
	});

	it("rpc: /omps fleet returns bounded plain text without terminal components", async () => {
		const fixture = setup("rpc");
		fixture.fleet.treeLines.mockReturnValue(["● Agents · 1 running"]);
		await fixture.commands.get("omps")!.handler("fleet", fixture.ctx);
		expect(fixture.fleet.toggle).toHaveBeenCalledTimes(1);
		expect(fixture.ctx.ui.notify).toHaveBeenCalledExactlyOnceWith("● Agents · 1 running", "info");
		expect(fixture.ctx.ui.custom).not.toHaveBeenCalled();
	});

	it("shows usage before any read when fleet receives extra arguments", async () => {
		const fixture = setup("tui");
		await fixture.commands.get("omps")!.handler("fleet extra", fixture.ctx);
		expect(fixture.ctx.ui.notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("fleet"), "warning");
		expect(fixture.fleet.toggle).not.toHaveBeenCalled();
		expect(fixture.fleet.treeLines).not.toHaveBeenCalled();
		expect(fixture.run).not.toHaveBeenCalled();
	});

	it("rejects historical entry data with a malformed agent label", () => {
		const fixture = setup("tui");
		const renderer = fixture.entryRenderer.mock.calls[0][1];
		const component = renderer({ data: { owner: "session", runId: "owned", agent: 42 } }, { expanded: false }) as {
			render(width: number): string[];
		};
		expect(component.render(100).join("\n")).toContain("invalid tree identity");
		expect(fixture.render).not.toHaveBeenCalled();
	});
});
