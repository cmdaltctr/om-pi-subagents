import { vi } from "vitest";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { RunDetails } from "../../src/details.ts";
import { Inspector, type InspectorOptions } from "../../src/inspector.ts";
import { ObservationStore } from "../../src/observation.ts";

/** Synthetic observations and external I/O only; no operator files or credentials. */
export function inspectorFixture(options: Partial<InspectorOptions> = {}) {
	const observations = new ObservationStore();
	const root = {
		id: "root",
		owner: "session",
		agent: "builder",
		cwd: "/synthetic",
		state: "running" as const,
		startedAt: 1000,
		nesting: { registryPath: "/synthetic/registry", rootSessionId: "session", depth: 1, maxDepth: 3 },
	};
	observations.updateRoot(root, { taskSummary: "Investigate synthetic changes", model: "synthetic/model" });
	observations.bindChildSession({ owner: "session", runId: "root" }, "child-session");
	for (let index = 1; index < 20; index++)
		observations.ingest(
			{ owner: "session", runId: "root" },
			{
				owner: "child-session",
				rootSessionId: "session",
				runId: `child-${index}`,
				parentRunId: "root",
				depth: 2,
				agent: `reader-${index}`,
				state: "running",
				startedAt: 1000,
				revision: 1,
				activeTools: [],
				taskSummary: `Synthetic task ${index}`,
			},
		);
	const read = vi.fn(async (_root: string, id: string, _signal?: AbortSignal): Promise<RunDetails> => ({
		node: observations.node("session", "root", id)!,
		task: `Task for ${id}`,
		output: Array.from({ length: 100 }, (_, index) => `Saved line ${index}`).join("\n\n"),
		outputPath: "/synthetic/output.md",
		partial: false,
		taskTruncated: false,
		outputTruncated: false,
	}));
	const close = vi.fn();
	const redraw = vi.fn();
	let height = 14;
	const inspector = new Inspector({
		observations,
		owner: "session",
		read,
		close,
		redraw,
		height: () => height,
		...options,
	});
	return {
		observations,
		root,
		inspector,
		read,
		close,
		redraw,
		resize: (value: number) => {
			height = value;
		},
	};
}
export const flushInspector = async () => {
	for (let index = 0; index < 6; index++) await Promise.resolve();
};
export const keys = {
	down: "\x1b[B",
	up: "\x1b[A",
	left: "\x1b[D",
	right: "\x1b[C",
	pageDown: "\x1b[6~",
	pageUp: "\x1b[5~",
	home: "\x1b[H",
	end: "\x1b[F",
	enter: "\r",
	escape: "\x1b",
};
export function mouse(type: "click" | "wheel", y: number, wheelDelta = 3) {
	return {
		type,
		button: "left" as const,
		x: 3,
		y,
		screenX: 3,
		screenY: y,
		width: 100,
		height: 14,
		shift: false,
		ctrl: false,
		alt: false,
		wheelDelta,
	};
}
/** ANSI colours reveal which semantic roles the component uses without changing text width. */
export function syntheticTheme(light = false): Theme {
	const roles: Record<string, number> = {
		accent: 36,
		muted: 90,
		text: 37,
		success: 32,
		error: 31,
		warning: 33,
		border: 90,
		mdHeading: 35,
		mdListBullet: 34,
		mdCodeBlock: 32,
	};
	return {
		fg: vi.fn((role: string, text: string) => `\x1b[${(roles[role] ?? 37) + (light ? 60 : 0)}m${text}\x1b[39m`),
		bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
		italic: (text: string) => text,
		strikethrough: (text: string) => text,
		underline: (text: string) => text,
	} as unknown as Theme;
}
