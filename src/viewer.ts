import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text, getKeybindings, type Component } from "@earendil-works/pi-tui";
import {
	createDetailReader,
	DetailSelection,
	MAX_DETAIL_BYTES,
	type DetailReader,
	type RunDetails,
} from "./details.ts";
import { Inspector } from "./inspector.ts";
import type { ObservationStore, ObservedTree } from "./observation.ts";
import { plain } from "./panel.ts";
import type { DisplayPreferences } from "./settings-persistence.ts";
import { TreeCard } from "./tree-card.ts";

export const TREE_ENTRY = "ompss-tree";
export interface RunCardIdentity {
	readonly owner: string;
	readonly runId: string;
}
interface Invalidation {
	owner: string;
	invalidate: () => void;
}
interface ViewerOptions {
	readonly observations: ObservationStore;
	readonly preferences: DisplayPreferences;
	readonly storeRoot: string;
	readonly owner: () => string | undefined;
	readonly redraw: (owner: string) => void;
}

function boundedText(text: string): string {
	const bytes = Buffer.from(text, "utf8");
	return bytes.length <= MAX_DETAIL_BYTES
		? text
		: `${bytes.subarray(0, MAX_DETAIL_BYTES - 80).toString("utf8")}\n[Inspection text truncated at 64 KiB]`;
}
function detailSummary(details: RunDetails, tree: ObservedTree): string {
	return boundedText(
		[
			...(tree.incomplete ? [`Tree observation incomplete: ${tree.reasons.join(", ") || "missing evidence"}`] : []),
			...(details.node.incomplete
				? [
						`Selected observation incomplete: ${details.node.reasons.join(", ") || "missing evidence"}${details.node.reasons.includes("ancestor-terminal") ? " (terminal evidence missing)" : ""}`,
					]
				: []),
			`Run: ${details.node.runId}`,
			`State: ${details.node.state}`,
			`Model: ${details.node.model ? plain(details.node.model, 512) : "unavailable"}`,
			`Tools: ${details.node.activeTools.map((tool) => plain(tool.name, 128)).join(", ") || "none observed"}`,
			"Task:",
			details.task ?? "Unavailable",
			...(details.taskTruncated ? ["[Task configuration truncated]"] : []),
			details.partial ? "Partial output:" : "Output:",
			details.output ?? "Unavailable",
			...(details.outputTruncated ? ["[Output truncated at 64 KiB]"] : []),
			`Saved output: ${plain(details.outputPath, 4096)}`,
		].join("\n"),
	);
}

/** Connect host presentation to retained evidence without changing execution or result delivery. */
export class RunViewer {
	private context: ExtensionContext | undefined;
	private ended = false;
	private readonly stops = new Map<string, () => void>();
	private readonly invalidations = new Map<object, Invalidation>();
	private active: Inspector | undefined;
	private readonly rpcReads = new Set<DetailSelection>();

	constructor(private readonly options: ViewerOptions) {}

	private live(owner: string): boolean {
		return !this.ended && this.options.owner() === owner;
	}

	private notify(owner: string, message: string): void {
		if (!this.live(owner)) return;
		try {
			this.context?.ui.notify(message, "error");
		} catch {
			/* Display errors stay outside supervision. */
		}
	}

	private closeActive(): void {
		try {
			this.active?.close();
		} catch {
			/* Shutdown still detaches the remaining resources. */
		}
		this.active = undefined;
	}

	activate(ctx: ExtensionContext): void {
		if (this.ended || !ctx.hasUI) return;
		const owner = ctx.sessionManager.getSessionId();
		if (this.context && this.context.sessionManager.getSessionId() !== owner) this.closeActive();
		this.context = ctx;
		if (this.stops.has(owner)) return;
		this.stops.set(
			owner,
			this.options.observations.subscribe(owner, () => this.redraw(owner)),
		);
		void this.options.preferences
			.ensureLoaded()
			.then((loaded) => {
				if (!this.live(owner)) return;
				for (const diagnostic of loaded.diagnostics) this.notify(owner, diagnostic);
				this.redraw(owner);
				return undefined;
			})
			.catch((error: unknown) => {
				this.notify(owner, `OMPSS display settings: ${(error as Error).message}`);
			});
	}

	redraw(owner = this.options.owner()): void {
		if (!owner || !this.live(owner)) return;
		// A renderer may replace its callback while invalidating itself.
		// oxlint-disable-next-line unicorn/no-useless-spread -- Callbacks can replace registrations while this loop runs.
		for (const registration of [...this.invalidations.values()]) {
			if (registration.owner !== owner) continue;
			try {
				registration.invalidate();
			} catch {
				/* Presentation must not change a run. */
			}
		}
		try {
			this.options.redraw(owner);
		} catch {
			/* Repaint failure cannot alter execution. */
		}
	}

	render(identity: RunCardIdentity, expanded: boolean, context?: { state: object; invalidate: () => void }): Component {
		if (!this.live(identity.owner) || this.context?.mode !== "tui")
			return new Text("OMPSS: observation unavailable", 0, 0);
		if (context) this.invalidations.set(context.state, { owner: identity.owner, invalidate: context.invalidate });
		return new TreeCard(
			() => (this.live(identity.owner) ? this.options.observations.tree(identity.owner, identity.runId) : undefined),
			expanded,
			() => this.options.preferences.value,
			() => getKeybindings().getKeys("app.tools.expand").join("/"),
			(id) => {
				const ctx = this.context;
				if (!ctx || !this.live(identity.owner)) return;
				void this.inspect(id, ctx).catch((error: unknown) => {
					this.notify(identity.owner, `OMPSS inspection: ${(error as Error).message}`);
				});
			},
		);
	}

	private async rpcDetails(root: string, runId: string, ctx: ExtensionContext, read: DetailReader): Promise<void> {
		const owner = ctx.sessionManager.getSessionId();
		const selection = new DetailSelection(read, () => this.live(owner));
		this.rpcReads.add(selection);
		try {
			const details = await selection.select(root, runId);
			if (details && this.live(owner)) {
				const tree = this.options.observations.tree(owner, root);
				const node = tree?.nodes.find((entry) => entry.runId === runId);
				if (tree && node) ctx.ui.notify(detailSummary({ ...details, node }, tree), "info");
			}
		} finally {
			selection.close();
			this.rpcReads.delete(selection);
		}
	}

	async inspect(runId: string | undefined, ctx: ExtensionContext): Promise<void> {
		const owner = ctx.sessionManager.getSessionId();
		const trees = this.options.observations.trees(owner);
		const selected = runId ? trees.find((tree) => tree.nodes.some((node) => node.runId === runId)) : undefined;
		if (runId && !selected) throw new Error("Unknown or unowned run. Use /ompss inspect without an id.");
		if (!trees.length) return void ctx.ui.notify("No runs to inspect in this session.", "info");
		this.activate(ctx);
		const read = createDetailReader(this.options.storeRoot, this.options.observations, owner);
		if (ctx.mode === "rpc") {
			if (runId && selected) await this.rpcDetails(selected.runId, runId, ctx, read);
			else
				ctx.ui.notify(
					boundedText(
						trees
							.flatMap((tree) => [
								...(tree.incomplete
									? [`Tree observation incomplete: ${tree.reasons.join(", ") || "missing evidence"} (${tree.runId})`]
									: []),
								...tree.nodes.map(
									(node) =>
										`${"  ".repeat(node.depth - tree.nodes[0].depth)}${plain(node.agent, 256)} ${node.state} (${node.runId})${node.incomplete ? " [observation incomplete]" : ""}`,
								),
							])
							.join("\n"),
					),
					"info",
				);
			return;
		}
		if (ctx.mode !== "tui")
			return void ctx.ui.notify("Inspection requires interactive Pi or a supported RPC client.", "error");
		await this.openModal(owner, runId, ctx, read);
	}

	private async openModal(
		owner: string,
		runId: string | undefined,
		ctx: ExtensionContext,
		read: DetailReader,
	): Promise<void> {
		this.closeActive();
		let component: Inspector | undefined;
		try {
			await ctx.ui.custom<void>(
				(tui, _theme, _keys, done) => {
					component = new Inspector({
						observations: this.options.observations,
						owner,
						read,
						height: () => Math.max(1, Math.floor(tui.terminal.rows * 0.9)),
						redraw: () => tui.requestRender(),
						close: done,
						live: () => this.live(owner),
						selectedRunId: runId,
					});
					this.active = component;
					return component;
				},
				{ overlay: true, overlayOptions: { width: "90%", maxHeight: "90%", anchor: "center" } },
			);
		} catch (error) {
			if (this.live(owner)) throw error;
		} finally {
			component?.dispose();
			if (this.active === component) this.active = undefined;
		}
	}

	dispose(): void {
		if (this.ended) return;
		this.ended = true;
		for (const selection of this.rpcReads) selection.close();
		this.rpcReads.clear();
		this.closeActive();
		for (const stop of this.stops.values()) stop();
		this.stops.clear();
		this.invalidations.clear();
		this.context = undefined;
	}
}
