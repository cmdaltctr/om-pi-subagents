import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

export type AtMention =
	| { kind: "launch"; agent: string; task: string }
	| { kind: "unknown"; name: string }
	| { kind: "no-task"; agent: string }
	| { kind: "none" };

/** Parse text as received from Pi; direct callers keep their leading whitespace. */
export function parseAtMention(text: string, names: readonly string[]): AtMention {
	const match = /^@(\S+)(?:\s+([\s\S]*))?$/.exec(text);
	if (!match) return { kind: "none" };
	const [, agent, remainder] = match;
	if (!names.includes(agent))
		return agent.includes("/") || agent.includes(".") ? { kind: "none" } : { kind: "unknown", name: agent };
	const task = remainder?.trim() ?? "";
	return task ? { kind: "launch", agent, task } : { kind: "no-task", agent };
}

/** Keep agent values separate from the task separator added during application. */
export function atMentionItems(prefix: string, names: readonly string[]): AutocompleteItem[] {
	return names.filter((name) => name.startsWith(prefix.slice(1))).map((name) => ({ value: `@${name}`, label: name }));
}

/** Add agent items only when both providers replace the same initial editor token. */
export function wrapAtMentionProvider(
	next: AutocompleteProvider,
	readNames: () => Promise<readonly string[]>,
): AutocompleteProvider {
	const ownItems = new WeakSet<AutocompleteItem>();
	return {
		triggerCharacters: [...new Set([...(next.triggerCharacters ?? []), "@"])],
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const own = await next.getSuggestions(lines, cursorLine, cursorCol, options);
			const prefix = (lines[0] ?? "").slice(0, cursorCol);
			if (cursorLine !== 0 || !/^@\S*$/.test(prefix)) return own;
			try {
				const items = atMentionItems(prefix, await readNames());
				// A different prefix would corrupt replacement for the native items.
				if (!items.length || (own && own.prefix !== prefix)) return own;
				for (const item of items) ownItems.add(item);
				return { prefix, items: [...items, ...(own?.items ?? [])] };
			} catch {
				// Typing must keep native suggestions when the registry cannot be refreshed.
				return own;
			}
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			if (!ownItems.has(item)) return next.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			// The cursor can be inside the old name; replace its whole token without touching the task.
			const task = lines[cursorLine].replace(/^@\S*[ \t]*/, "");
			const completed = [...lines];
			completed[cursorLine] = `${item.value} ${task}`;
			return { lines: completed, cursorLine, cursorCol: item.value.length + 1 };
		},
		...(next.shouldTriggerFileCompletion
			? {
					shouldTriggerFileCompletion: (
						...args: Parameters<NonNullable<AutocompleteProvider["shouldTriggerFileCompletion"]>>
					) => next.shouldTriggerFileCompletion!(...args),
				}
			: {}),
	};
}

/** Consume direct interactive launches; RPC and extension prompts retain their host routing. */
export function registerAtMentionInput(
	pi: ExtensionAPI,
	readNames: () => Promise<readonly string[]>,
	launch: (ctx: ExtensionContext, agent: string, task: string) => Promise<void>,
): void {
	pi.on("input", async (event, ctx) => {
		if (event.source !== "interactive" || ctx.mode !== "tui" || !event.text.startsWith("@"))
			return { action: "continue" };
		try {
			const names = await readNames();
			const mention = parseAtMention(event.text, names);
			if (mention.kind === "none") return { action: "continue" };
			if (mention.kind === "unknown")
				ctx.ui.notify(`OMPS: unknown agent "${mention.name}"; mapped agents: ${names.join(", ") || "none"}`, "warning");
			else if (mention.kind === "no-task") ctx.ui.notify(`Usage: @${mention.agent} <task>`, "warning");
			else await launch(ctx, mention.agent, mention.task);
		} catch (error) {
			// Pi forwards input after an uncaught handler failure, so failed launches must stay handled.
			try {
				ctx.ui.notify(`OMPS: ${error instanceof Error ? error.message : String(error)}`, "error");
			} catch {
				// A broken notification must still leave launch input consumed.
			}
		}
		return { action: "handled" };
	});
}
