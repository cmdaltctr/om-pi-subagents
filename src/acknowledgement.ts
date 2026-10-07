// Compact transcript acknowledgements for OMPS launches.
//
// Per-launch transcript entries stay static: one bounded row carrying the agent, short identity and
// launch state, plus an optional bounded reveal of the acknowledgement text. Host expansion (Ctrl+O)
// can reveal that text; it can never recreate a live per-run tree. Historical entries from older
// sessions render from their own captured data and label unavailable evidence.

import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { stripVTControlCharacters } from "node:util";
import { plain } from "./plain.ts";

/** Matches the panel's agent-name bound so acknowledgements cannot grow rows. */
export const ACK_MAX_AGENT_CHARS = 48;
/** Expansion reveals acknowledgement text only, so its budget stays small. */
export const ACK_MAX_DETAIL_CHARS = 512;
export const ACK_MAX_DETAIL_LINES = 4;

/** What a launch acknowledgement carries. Entries written before this shape existed omit `agent`. */
export interface AcknowledgementData {
	readonly owner: string;
	readonly runId: string;
	/** Bounded agent label captured at launch. Absent means unavailable evidence, guessed never. */
	readonly agent?: string;
}

function fit(line: string, width: number): string {
	return stripVTControlCharacters(truncateToWidth(line, width, ""));
}

/**
 * Pure renderer for one launch acknowledgement.
 *
 * @param data identity plus the captured agent label.
 * @param expanded host expansion state; reveals the bounded acknowledgement text when present.
 * @param width available terminal columns.
 * @param detail the model-facing acknowledgement text captured at launch, when known.
 */
export function acknowledgementLines(
	data: AcknowledgementData,
	expanded: boolean,
	width: number,
	detail?: string,
): string[] {
	if (width < 1) return [];
	const shortId = plain(data.runId, 128).slice(0, 8);
	const agent = data.agent === undefined ? "" : plain(data.agent, ACK_MAX_AGENT_CHARS);
	const row = agent
		? `OMPS: ${agent} started (${shortId})`
		: `OMPS: historical launch (${shortId}) · evidence unavailable`;
	const lines = [fit(row, width)];
	if (!expanded || !detail) return lines;
	let budget = ACK_MAX_DETAIL_CHARS;
	for (const raw of detail.split("\n").slice(0, ACK_MAX_DETAIL_LINES)) {
		if (budget <= 0) break;
		const line = plain(raw, budget);
		budget -= line.length;
		lines.push(fit(line, width));
	}
	return lines;
}

/** A static transcript component. It observes nothing and repaints nothing. */
export class LaunchAcknowledgement implements Component {
	constructor(
		private readonly data: AcknowledgementData,
		private readonly expanded: boolean,
		private readonly detail?: string,
	) {}

	render(width: number): string[] {
		return acknowledgementLines(this.data, this.expanded, width, this.detail);
	}

	invalidate(): void {
		/* Static content: a repaint reproduces the same lines. */
	}
}
