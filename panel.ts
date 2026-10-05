import { stripVTControlCharacters } from "node:util";
import { isTerminal, type RunView } from "./runs.ts";

export const MAX_PREVIEW_CHARS = 240;
const MAX_NAME_CHARS = 48;
const DISPLAY_TOOLS = 4;
const DISPLAY_RUNS = 4;

/** Remove terminal instructions and flatten text before putting it near the editor. */
export function plain(text: string, limit: number): string {
	return (
		stripVTControlCharacters(text)
			// oxlint-disable-next-line no-control-regex -- Remove terminal controls and direction overrides from untrusted display text.
			.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, limit)
	);
}

interface DisplayRun {
	run: RunView;
	tools: Map<string, string>;
	preview?: string;
}
interface DisplaySession {
	active: Map<string, DisplayRun>;
	idle?: DisplayRun;
}

/** Display-only state. Tool arguments, results and thinking never enter this object. */
export class RunPanel {
	private readonly sessions = new Map<string, DisplaySession>();
	private defaultOwner: string | undefined;

	constructor(private readonly visibleAgents: () => number = () => DISPLAY_RUNS) {}

	/** Apply one authoritative snapshot without replacing a sibling's display data. */
	onChange(run: RunView): void {
		this.defaultOwner ??= run.owner;
		let session = this.sessions.get(run.owner);
		if (!session) {
			session = { active: new Map() };
			this.sessions.set(run.owner, session);
		}
		let record = session.active.get(run.id) ?? (session.idle?.run.id === run.id ? session.idle : undefined);
		if (!record) {
			// An unknown terminal snapshot is a late callback once this owner already has display history.
			if (isTerminal(run.state) && (session.active.size > 0 || session.idle)) return;
			record = { run, tools: new Map() };
		}
		if (isTerminal(record.run.state) && !isTerminal(run.state)) return;
		record.run = run;
		if (isTerminal(run.state)) {
			record.tools.clear();
			session.active.delete(run.id);
			session.idle = record;
		} else {
			if (run.state === "starting" && !session.active.has(run.id)) session.idle = undefined;
			session.active.set(run.id, record);
		}
	}

	/** Match active calls by run and full tool identifier, including nested call paths. */
	onProgress(run: RunView, event: unknown): void {
		const record = this.sessions.get(run.owner)?.active.get(run.id);
		if (!record || !event || typeof event !== "object") return;
		const data = event as Record<string, unknown>;
		if (typeof data.toolCallId !== "string" || data.toolCallId.trim() === "") return;
		if (data.type === "tool_execution_end") record.tools.delete(data.toolCallId);
		else if (data.type === "tool_execution_start" && typeof data.toolName === "string") {
			const name = plain(data.toolName, MAX_NAME_CHARS);
			if (name) record.tools.set(data.toolCallId, name);
		}
	}

	/** Keep only a short, safe preview for the latest completed or failed run. */
	setPreview(run: RunView, output: string | undefined): void {
		const record = this.sessions.get(run.owner)?.idle;
		if (record?.run.id !== run.id || record.run.state === "cancelled") return;
		record.preview = output === undefined ? undefined : plain(output, MAX_PREVIEW_CHARS) || undefined;
	}

	/** Keep the status indicator active until every owned run has ended. */
	status(owner: string): string | undefined {
		const active = [...(this.sessions.get(owner)?.active.values() ?? [])];
		if (active.length === 0) return undefined;
		if (active.length > 1) return `ompss: ${active.length} active runs`;
		const { run } = active[0];
		return `ompss: ${plain(run.agent, MAX_NAME_CHARS)} ${run.state}`;
	}

	/** Built-in Pi text widgets wrap compact summaries to terminal width. Admission remains unbounded by this view. */
	render(owner = this.defaultOwner): string[] {
		const session = owner ? this.sessions.get(owner) : undefined;
		if (!session) return [];
		const active = [...session.active.values()];
		const bound = this.visibleAgents();
		const displayed = active.length ? active.slice(0, bound) : session.idle ? [session.idle] : [];
		const lines: string[] = [];
		for (const { run, tools, preview } of displayed) {
			lines.push(`OMPSS: ${plain(run.agent, MAX_NAME_CHARS)} ${run.state} (${plain(run.id, 128)})`);
			if (tools.size) {
				const names = [...tools.values()].slice(0, DISPLAY_TOOLS);
				const extra = tools.size - names.length;
				lines.push(`Tools: ${names.join(", ")}${extra ? ` (+${extra})` : ""}`);
			}
			if (preview) lines.push(`${run.state === "failed" ? "Partial output" : "Answer"}: ${preview}`);
		}
		if (active.length > bound) lines.push(`${active.length - bound} additional active runs`);
		return lines;
	}

	/** Used to reject expired progress and previews while allowing active siblings. */
	matches(run: RunView): boolean {
		const session = this.sessions.get(run.owner);
		return !!session && (session.active.has(run.id) || session.idle?.run.id === run.id);
	}
}
