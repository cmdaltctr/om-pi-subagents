import { keyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { RESULT_MESSAGE } from "./notify.ts";
import { collapseResult, RESULT_LINE_LIMIT } from "./result-render.ts";

const WIDGET_KEY = "omps-result-render";

/** Session-local expansion and a public terminal redraw hook, independent of the run runtime. */
export class ResultMessages {
	private expanded = false;
	private requestRender: (() => void) | undefined;

	constructor(
		pi: ExtensionAPI,
		private readonly activeKey: () => string | undefined,
	) {
		registerResultMessages(pi, () => this.expanded, activeKey);
	}

	/** Capture the public TUI through an empty widget, including sessions with only historical results. */
	attach(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui" || !this.activeKey() || this.activeKey() === "off") return;
		ctx.ui.setWidget(WIDGET_KEY, (tui) => {
			this.requestRender = () => {
				tui.invalidate();
				tui.requestRender();
			};
			return {
				render: () => [],
				invalidate() {},
				dispose: () => {
					this.requestRender = undefined;
				},
			};
		});
	}

	/** Toggle every retained result component without replacing the host expansion action. */
	toggle(): void {
		this.expanded = !this.expanded;
		this.requestRender?.();
	}

	/** End the session flag and detach the redraw hook before the terminal closes. */
	dispose(ctx: ExtensionContext): void {
		this.expanded = false;
		this.requestRender = undefined;
		if (ctx.mode !== "tui") return;
		try {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
		} catch {
			/* Session shutdown must still stop children after the terminal has closed. */
		}
	}
}

/** Register a live display component without changing the stored or model-facing message. */
export function registerResultMessages(
	pi: ExtensionAPI,
	expanded: () => boolean,
	activeKey: () => string | undefined,
): void {
	pi.registerMessageRenderer(RESULT_MESSAGE, (message, options) => {
		// Read session state inside render: the host retains the returned component between redraws.
		return {
			invalidate() {},
			render(width) {
				let text = "OMPS: result content unavailable";
				try {
					text =
						typeof message.content === "string"
							? message.content
							: message.content
									.filter((block) => block.type === "text")
									.map((block) => block.text)
									.join("\n");
					if (typeof message.content === "string" && text.startsWith("OMPS run ") && !options.expanded && !expanded()) {
						const folded = collapseResult(text, RESULT_LINE_LIMIT);
						if (folded.hidden > 0) {
							let hint = "expand with the host expansion key";
							try {
								hint = keyHint("app.tools.expand", "to expand") || hint;
							} catch {
								/* The fallback stays useful when the host cannot supply its key hint. */
							}
							const key = activeKey();
							if (key && key !== "off") hint = `${key} to expand; ${hint}`;
							text = `${folded.head.join("\n")}\n… ${folded.hidden} more lines (${hint})`;
						}
					}
				} catch {
					/* Unexpected content or host state must not interrupt the transcript. */
				}
				return new Text(text, 0, 0).render(width);
			},
		};
	});
}
