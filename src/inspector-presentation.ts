import type { Theme } from "@earendil-works/pi-coding-agent";
import { Markdown, truncateToWidth, wrapTextWithAnsi, type MarkdownTheme } from "@earendil-works/pi-tui";
import { detailText, type RunDetails } from "./details.ts";
import type { ObservedNode, ObservedTree } from "./observation.ts";
import { plain, previewText } from "./plain.ts";
import { isTerminal } from "./runs.ts";

/** Bind Markdown roles to the supplied modal theme, including hosts with global theme helpers. */
export function inspectorMarkdownTheme(theme?: Theme, host?: MarkdownTheme): MarkdownTheme {
	const fg = (role: Parameters<Theme["fg"]>[0]) => (text: string) => theme?.fg(role, text) ?? text;
	return {
		...host,
		heading: fg("mdHeading"),
		link: fg("mdLink"),
		linkUrl: fg("mdLinkUrl"),
		code: fg("mdCode"),
		codeBlock: fg("mdCodeBlock"),
		codeBlockBorder: fg("mdCodeBlockBorder"),
		quote: fg("mdQuote"),
		quoteBorder: fg("mdQuoteBorder"),
		hr: fg("mdHr"),
		listBullet: fg("mdListBullet"),
		bold: (text) => theme?.bold(text) ?? text,
		italic: (text) => theme?.italic(text) ?? text,
		strikethrough: (text) => theme?.strikethrough(text) ?? text,
		underline: (text) => theme?.underline(text) ?? text,
		// The host highlighter closes over a global theme. Keep code bound to this modal's supplied theme.
		highlightCode: (code) => code.split("\n").map(fg("mdCodeBlock")),
	};
}

/** Elapsed time uses retained terminal evidence; repainting never changes run state. */
export function inspectorElapsed(node: ObservedNode): string {
	if (isTerminal(node.state) && node.endedAt === undefined) return "Unavailable";
	const seconds = Math.max(
		0,
		Math.floor(((isTerminal(node.state) ? (node.endedAt ?? node.startedAt) : Date.now()) - node.startedAt) / 1000),
	);
	return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

interface BodyInput {
	readonly node: ObservedNode;
	readonly tree: ObservedTree;
	readonly lineage: readonly string[];
	readonly details?: RunDetails;
	readonly loading: boolean;
	readonly error?: string;
}

/** Inspector-only presentation; holds at most the live and saved Markdown components. */
export class InspectorPresentation {
	private readonly answers = new Map<string, { text: string; component: Markdown }>();

	constructor(
		private readonly theme?: Theme,
		private readonly markdownTheme = inspectorMarkdownTheme(theme),
	) {}

	colour(role: Parameters<Theme["fg"]>[0], text: string): string {
		return this.theme?.fg(role, text) ?? text;
	}

	status(node: ObservedNode): string {
		const role = node.state === "completed" ? "success" : node.state === "failed" ? "error" : "warning";
		return this.colour(role, node.state);
	}

	header(node?: ObservedNode): string {
		return node
			? `OMPS inspector · ${this.colour("accent", plain(node.agent, 256))} · ${this.status(node)} · ${inspectorElapsed(node)}`
			: this.colour("accent", "OMPS inspector");
	}

	private answer(slot: string, text: string, width: number): string[] {
		const safe = previewText(text);
		let cached = this.answers.get(slot);
		if (!cached || cached.text !== safe) {
			cached = {
				text: safe,
				component: new Markdown(safe, 0, 0, this.markdownTheme, { color: (value) => this.colour("text", value) }),
			};
			this.answers.set(slot, cached);
		}
		// Bound even unusually long code tokens and wide characters emitted by the host renderer.
		return cached.component
			.render(width)
			.flatMap((line) => wrapTextWithAnsi(line, width))
			.map((line) => truncateToWidth(line, width, ""));
	}

	body(input: BodyInput, width: number): string[] {
		const { node, tree, details } = input;
		const lines: string[] = [];
		const prose = (text: string, role: Parameters<Theme["fg"]>[0] = "text") => {
			lines.push(
				...detailText(text)
					.split("\n")
					.flatMap((line) => wrapTextWithAnsi(line, width))
					.map((line) => this.colour(role, line)),
			);
		};
		const heading = (label: string) => {
			if (lines.length) lines.push("");
			prose(label, "accent");
		};
		if (tree.incomplete)
			prose(`Tree observation incomplete: ${tree.reasons.join(", ") || "missing evidence"}`, "warning");
		if (node.incomplete)
			prose(
				`Selected observation incomplete: ${node.reasons.join(", ") || "missing evidence"}${node.reasons.includes("ancestor-terminal") ? " (terminal evidence missing)" : ""}`,
				"warning",
			);
		prose(input.lineage.join(" > "), "muted");
		prose(`Run: ${node.runId}`, "muted");
		prose(`State: ${node.state}`, "muted");
		prose(`Model: ${node.model ?? "unavailable"}`, "muted");
		heading("Task");
		prose(details?.task ?? node.taskSummary ?? "Unavailable");
		if (details?.taskTruncated)
			prose("[Task configuration truncated at 64 KiB; read config.json in the saved run folder]", "warning");
		heading("Current activity");
		const counts = new Map<string, number>();
		for (const tool of node.activeTools) {
			const name = plain(tool.name, 128);
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
		prose(
			counts.size ? [...counts].map(([name, count]) => `${name} ×${count}`).join(" · ") : "No active tool observed",
		);
		if (node.assistantPreview) {
			heading("Live answer · provisional");
			lines.push(...this.answer("live", node.assistantPreview, width));
		}
		heading(
			details?.partial || node.state === "failed" || node.state === "cancelled" ? "Partial output" : "Saved output",
		);
		if (details?.output) lines.push(...this.answer("saved", details.output, width));
		else prose("Unavailable", "muted");
		if (input.loading) prose("Reading selected saved files...", "muted");
		if (input.error) prose(`Details unavailable: ${input.error}`, "warning");
		if (details?.outputTruncated) prose("[Output truncated at 64 KiB]", "warning");
		if (details) prose(`Saved output: ${details.outputPath}`, "muted");
		return lines.map((line) => truncateToWidth(line, width, ""));
	}

	invalidate(): void {
		this.answers.clear();
	}
}
