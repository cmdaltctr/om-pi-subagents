import { stripVTControlCharacters } from "node:util";
import { isTerminal, type RunView } from "./runs.ts";

export const MAX_PREVIEW_CHARS = 240;
const MAX_NAME_CHARS = 48;
const DISPLAY_TOOLS = 4;

/** Remove terminal instructions and flatten text before putting it near the editor. */
function plain(text: string, limit: number): string {
	return (
		stripVTControlCharacters(text)
			// oxlint-disable-next-line no-control-regex -- Remove terminal controls and direction overrides from untrusted display text.
			.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, limit)
	);
}

/** Display-only state. Tool arguments, results and thinking never enter this object. */
export class RunPanel {
	private run: RunView | undefined;
	private readonly active = new Map<string, string>();
	private preview: string | undefined;

	/** Apply the authoritative lifecycle snapshot, clearing display data for a new run. */
	onChange(run: RunView): void {
		if (!this.matches(run)) {
			if (this.run && run.state !== "starting") return;
			this.active.clear();
			this.preview = undefined;
		}
		this.run = run;
		if (isTerminal(run.state)) this.active.clear();
	}

	/** Match active calls by their full identifier, including nested call paths. */
	onProgress(run: RunView, event: unknown): void {
		if (!this.matches(run) || isTerminal(this.run!.state) || !event || typeof event !== "object") return;
		const record = event as Record<string, unknown>;
		if (typeof record.toolCallId !== "string" || record.toolCallId.trim() === "") return;
		if (record.type === "tool_execution_end") this.active.delete(record.toolCallId);
		else if (record.type === "tool_execution_start" && typeof record.toolName === "string") {
			const name = plain(record.toolName, MAX_NAME_CHARS);
			if (name) this.active.set(record.toolCallId, name);
		}
	}

	/** Keep only a short, safe preview for the current completed or failed run. */
	setPreview(run: RunView, output: string | undefined): void {
		if (!this.matches(run) || !isTerminal(this.run!.state) || this.run!.state === "cancelled") return;
		this.preview = output === undefined ? undefined : plain(output, MAX_PREVIEW_CHARS) || undefined;
	}

	/** Built-in Pi text widgets handle wrapping these compact lines to terminal width. */
	render(): string[] {
		if (!this.run) return [];
		const lines = [`OMPSS: ${plain(this.run.agent, MAX_NAME_CHARS)} ${this.run.state}`];
		if (this.active.size) {
			const names = [...this.active.values()].slice(0, DISPLAY_TOOLS);
			const extra = this.active.size - names.length;
			lines.push(`Tools: ${names.join(", ")}${extra ? ` (+${extra})` : ""}`);
		}
		if (this.preview) lines.push(`${this.run.state === "failed" ? "Partial output" : "Answer"}: ${this.preview}`);
		return lines;
	}

	/** Used to reject late events and previews from older runs or another session. */
	matches(run: RunView): boolean {
		return this.run?.id === run.id && this.run.owner === run.owner;
	}
}
