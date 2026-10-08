import type { ExtensionAPI, ExtensionContext, MessageRenderer, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultMessages, registerResultMessages } from "../src/result-message.ts";

const hostHint = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", () => ({ keyHint: hostHint }));

const content = [
	"OMPS run run-1 (reader) completed.",
	"Files: /files/run-1",
	"Result:",
	...Array.from({ length: 12 }, (_, index) => `answer ${index + 1}`),
].join("\n");

function harness() {
	const renderers = new Map<string, MessageRenderer>();
	const requestRender = vi.fn();
	const invalidate = vi.fn();
	const widgets = new Map<string, Component>();
	const pi = {
		registerMessageRenderer: (name: string, renderer: MessageRenderer) => renderers.set(name, renderer),
	} as unknown as ExtensionAPI;
	const ctx = {
		mode: "tui",
		ui: {
			setWidget: (name: string, factory: Parameters<ExtensionContext["ui"]["setWidget"]>[1]) => {
				if (typeof factory === "function")
					widgets.set(name, factory({ requestRender, invalidate } as unknown as TUI, {} as Theme));
				else widgets.delete(name);
			},
		},
	} as unknown as ExtensionContext;
	const component = (body: unknown = content, expanded = false) =>
		renderers.get("omps-result")!(
			{ customType: "omps-result", content: body, display: true, timestamp: 0 } as Parameters<MessageRenderer>[0],
			{ expanded, outputPad: 0 },
			{} as Theme,
		)!;
	return { pi, ctx, requestRender, invalidate, widgets, component };
}

const text = (component: Component) =>
	component
		.render(120)
		.map((line: string) => line.trimEnd())
		.join("\n");

beforeEach(() => {
	hostHint.mockReset().mockReturnValue("ctrl+y to expand");
});

describe("live result display", () => {
	it("redraws every retained component after a session shortcut and leaves host expansion intact", () => {
		const h = harness();
		const results = new ResultMessages(h.pi, () => "ctrl+shift+e");
		results.attach(h.ctx);
		const first = h.component();
		const second = h.component(content.replace("run-1", "run-2"));
		const hostExpanded = h.component(content, true);
		expect(text(first)).toContain("4 more lines (ctrl+shift+e to expand; ctrl+y to expand)");
		results.toggle();
		expect(h.requestRender).toHaveBeenCalledOnce();
		expect(h.invalidate).toHaveBeenCalledOnce();
		expect(h.invalidate.mock.invocationCallOrder[0]).toBeLessThan(h.requestRender.mock.invocationCallOrder[0]);
		expect(text(first)).toBe(content);
		expect(text(second)).toContain("answer 12");
		results.toggle();
		expect(h.requestRender).toHaveBeenCalledTimes(2);
		expect(text(first)).not.toContain("answer 12");
		expect(text(second)).not.toContain("answer 12");
		expect(text(hostExpanded)).toBe(content);
		results.dispose(h.ctx);
		expect(h.widgets.size).toBe(0);
		results.toggle();
		expect(h.requestRender).toHaveBeenCalledTimes(2);
	});

	it("uses the host's remapped key when the OMPS key is inactive", () => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "off",
		);
		expect(text(h.component())).toContain("ctrl+y to expand");
		expect(hostHint).toHaveBeenCalledWith("app.tools.expand", "to expand");
	});

	it.each(["throws", "empty"])("keeps the host hint fallback when keyHint %s", (failure) => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => undefined,
		);
		if (failure === "throws")
			hostHint.mockImplementation(() => {
				throw new Error("unavailable");
			});
		else hostHint.mockReturnValue("");
		expect(text(h.component())).toContain("expand with the host expansion key");
	});

	it("keeps unexpected text and structured text whole without a fold", () => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "off",
		);
		expect(text(h.component(content.replace("OMPS run ", "Unexpected ")))).toContain("answer 12");
		expect(text(h.component("OMPS run run-1\nNo output was saved."))).not.toContain("more lines");
		expect(text(h.component([{ type: "text", text: content }]))).toBe(content);
		expect(() => text(h.component(null))).not.toThrow();
	});

	it("shows short results without a hint and creates no redraw widget when off", () => {
		const h = harness();
		const results = new ResultMessages(h.pi, () => "off");
		results.attach(h.ctx);
		expect(h.widgets.size).toBe(0);
		expect(text(h.component(content.split("\n").slice(0, 4).join("\n")))).not.toContain("more lines");
	});
});
