import { stripVTControlCharacters } from "node:util";
import { Theme, type ExtensionAPI, type ExtensionContext, type MessageRenderer } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResultMessages, registerResultMessages } from "../src/result-message.ts";

const hostHint = vi.hoisted(() => vi.fn());
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
	...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
	keyHint: hostHint,
}));

function palette(warning = "#ffff00", background = "#301040"): Theme {
	return new Theme(
		{ warning, text: "#ffffff", muted: "#888888", thinkingXhigh: "#ffffff" } as ConstructorParameters<typeof Theme>[0],
		{ customMessageBg: background, selectedBg: "#222222" } as ConstructorParameters<typeof Theme>[1],
		"truecolor",
	);
}

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
	const component = (body: unknown = content, expanded = false, outputPad = 0, theme = palette()) =>
		renderers.get("omps-result")!(
			{ customType: "omps-result", content: body, display: true, timestamp: 0 } as Parameters<MessageRenderer>[0],
			{ expanded, outputPad },
			theme,
		)!;
	return { pi, ctx, requestRender, invalidate, widgets, component };
}

const text = (component: Component) =>
	component
		.render(120)
		.map((line: string) => stripVTControlCharacters(line).trimEnd())
		.join("\n")
		.trim();

beforeEach(() => {
	hostHint.mockReset().mockReturnValue("ctrl+y to expand");
});

describe("live result display", () => {
	it.each(["collapsed", "expanded", "short"])("restores the themed panel for %s results", (view) => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "ctrl+shift+e",
		);
		const theme = palette();
		const body = view === "short" ? content.split("\n").slice(0, 4).join("\n") : content;
		const lines = h.component(body, view === "expanded", 2, theme).render(120);
		expect(lines.length).toBeGreaterThan(2);
		for (const line of lines) {
			expect(line).toContain(theme.getBgAnsi("customMessageBg"));
			expect(visibleWidth(line)).toBe(120);
		}
		expect(stripVTControlCharacters(lines[0]).trim()).toBe("");
		expect(stripVTControlCharacters(lines.at(-1)!).trim()).toBe("");
		expect(stripVTControlCharacters(lines[1])).toMatch(/^ {2}OMPS run/);
		if (view !== "collapsed") {
			expect(lines.join("\n")).not.toContain("more lines");
			expect(lines.join("\n")).not.toContain(theme.getFgAnsi("warning"));
		}
	});

	it("colours the whole fold hint without colouring the result body", () => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "ctrl+shift+e",
		);
		const theme = palette();
		const lines = h.component(content, false, 1, theme).render(120);
		const hint = lines.find((line) => line.includes("more lines"))!;
		expect(hint).toContain(
			`${theme.getFgAnsi("warning")}… 4 more lines (ctrl+shift+e to expand; ctrl+y to expand)\x1b[39m`,
		);
		for (const line of lines.filter((row) => /OMPS run|answer/.test(row)))
			expect(line).not.toContain(theme.getFgAnsi("warning"));
	});

	it("keeps the host key yellow when Pi supplies pre-coloured key hints", () => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "ctrl+shift+e",
		);
		hostHint.mockReturnValue("\x1b[90mctrl+y\x1b[39m\x1b[37m to expand\x1b[39m");
		const theme = palette();
		const hint = h
			.component(content, false, 1, theme)
			.render(120)
			.find((line) => line.includes("more lines"))!;
		expect(hint).toContain(
			`${theme.getFgAnsi("warning")}… 4 more lines (ctrl+shift+e to expand; ctrl+y to expand)\x1b[39m`,
		);
	});

	it.each([1, 2, 12, 40])("keeps wrapped hint rows coloured within %i columns", (width) => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "ctrl+shift+e",
		);
		const theme = palette();
		const lines = h.component(content, false, 1, theme).render(width);
		for (const line of lines) {
			expect(visibleWidth(line)).toBeLessThanOrEqual(width);
			expect(line).toContain(theme.getBgAnsi("customMessageBg"));
		}
		const hintStart = lines.findIndex((line) => stripVTControlCharacters(line).includes("…"));
		expect(hintStart).toBeGreaterThanOrEqual(0);
		const hintRows = lines.slice(hintStart, -1);
		expect(hintRows.length).toBeGreaterThan(1);
		for (const line of hintRows) expect(line).toContain(theme.getFgAnsi("warning"));
		expect(hintRows.map(stripVTControlCharacters).join("").replace(/\s+/g, "")).toBe(
			"…4morelines(ctrl+shift+etoexpand;ctrl+ytoexpand)",
		);
	});

	it("uses the new palette when the host rebuilds a retained result", () => {
		const h = harness();
		registerResultMessages(
			h.pi,
			() => false,
			() => "ctrl+shift+e",
		);
		const original = palette();
		const next = palette("#aa4400", "#ddccff");
		const before = h.component(content, false, 1, original).render(120).join("\n");
		const after = h.component(content, false, 1, next).render(120).join("\n");
		expect(before).toContain(original.getBgAnsi("customMessageBg"));
		expect(after).toContain(next.getBgAnsi("customMessageBg"));
		expect(after).toContain(next.getFgAnsi("warning"));
		expect(after).not.toContain(original.getBgAnsi("customMessageBg"));
		expect(after).not.toContain(original.getFgAnsi("warning"));
		expect(stripVTControlCharacters(after)).toBe(stripVTControlCharacters(before));
	});

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
