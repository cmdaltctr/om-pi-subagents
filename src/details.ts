import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { observationId } from "./observation-validation.ts";
import type { ObservationStore, ObservedNode } from "./observation.ts";

export const MAX_DETAIL_BYTES = 64 * 1024;

export interface RunDetails {
	readonly node: ObservedNode;
	readonly task?: string;
	readonly output?: string;
	readonly taskTruncated: boolean;
	readonly outputTruncated: boolean;
	readonly partial: boolean;
	readonly outputPath: string;
}
export type DetailReader = (rootRunId: string, runId: string, signal?: AbortSignal) => Promise<RunDetails>;

/** Keep line breaks while removing terminal instructions and direction overrides. */
export function detailText(text: string): string {
	return (
		// Node 22 can consume printable text up to a later bell unless complete ANSI control sequences go first.
		stripVTControlCharacters(
			// oxlint-disable-next-line no-control-regex -- Remove complete seven-bit and eight-bit ANSI control sequences before the host stripper.
			text.replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, ""),
		)
			.replace(/\r\n?/g, "\n")
			// oxlint-disable-next-line no-control-regex -- Keep only safe line breaks from selected task and output text.
			.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
			.trim()
	);
}

async function runDirectory(root: string, owner: string, runId: string): Promise<string | undefined> {
	try {
		const canonicalRoot = await realpath(root);
		// nosemgrep: AIK_ts_generic_path_traversal -- Both ids pass observationId and current-owner membership before this private helper; canonical equality rejects escapes. Evidence: docs/local-docs/agent-tree-viewer-details-evidence.md.
		const expected = join(canonicalRoot, owner, runId);
		if ((await realpath(expected)) !== expected)
			throw new Error("Run directory is a symlink or resolves outside its owned path.");
		return expected;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
}

async function readEvidence(
	directory: string,
	name: "config.json" | "output.md",
	signal?: AbortSignal,
): Promise<{ text: string; truncated: boolean } | undefined> {
	// nosemgrep: AIK_ts_generic_path_traversal -- Canonical owned directory plus one of two constant evidence filenames; no caller supplies a file path.
	const path = join(directory, name);
	signal?.throwIfAborted();
	let info;
	try {
		info = await lstat(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	if (!info.isFile() || info.isSymbolicLink() || (await realpath(path)) !== path) {
		throw new Error("Selected evidence is a symlink or resolves outside the allowed run file.");
	}
	// nosemgrep: AIK_ts_generic_path_traversal -- Canonical constant evidence path; symlinks and non-files are rejected, with a no-follow open and inode check before reading.
	const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	try {
		const opened = await file.stat();
		if (!opened.isFile() || opened.ino !== info.ino || opened.dev !== info.dev || (await realpath(path)) !== path) {
			throw new Error("Selected evidence changed its path or identity. Inspect it again.");
		}
		const buffer = Buffer.alloc(MAX_DETAIL_BYTES + 1);
		let total = 0;
		while (total < buffer.length) {
			signal?.throwIfAborted();
			const { bytesRead } = await file.read(buffer, total, buffer.length - total, null);
			if (!bytesRead) break;
			total += bytesRead;
		}
		signal?.throwIfAborted();
		return {
			text: buffer.subarray(0, Math.min(total, MAX_DETAIL_BYTES)).toString("utf8"),
			truncated: total > MAX_DETAIL_BYTES,
		};
	} finally {
		await file.close();
	}
}

function checkConfiguration(config: Record<string, any>, node: ObservedNode): void {
	if (
		config.runId !== node.runId ||
		config.owner !== node.owner ||
		config.createdAt !== node.startedAt ||
		config.agent?.name !== node.agent ||
		config.nesting?.rootSessionId !== node.rootSessionId ||
		config.nesting?.depth !== node.depth ||
		config.nesting?.parentRunId !== node.parentRunId
	)
		throw new Error("Saved run identity or lineage differs from the selected observation. Inspection was rejected.");
}

/** Read only an owned root or validated descendant, using two constant evidence filenames. */
export function createDetailReader(root: string, observations: ObservationStore, owner: string): DetailReader {
	return async (rootRunId, runId, signal) => {
		if (![owner, rootRunId, runId].every(observationId))
			throw new Error("Invalid owned run identity. Use /omps inspect without an id.");
		const node = observations.node(owner, rootRunId, runId);
		if (!node || !observationId(node.owner))
			throw new Error("Unknown or unowned run. Use /omps inspect without an id.");
		signal?.throwIfAborted();
		const directory = await runDirectory(root, node.owner, node.runId);
		// nosemgrep: AIK_ts_generic_path_traversal -- Trusted store root and validated retained node ids; this fallback reports a missing file without reading it.
		const outputPath = join(directory ?? resolve(root, node.owner, node.runId), "output.md");
		const base = {
			node,
			taskTruncated: false,
			outputTruncated: false,
			partial: node.state === "failed" || node.state === "cancelled",
			outputPath,
		};
		if (!directory) return base;
		const configFile = await readEvidence(directory, "config.json", signal);
		let task: string | undefined;
		if (configFile && !configFile.truncated) {
			const config: unknown = JSON.parse(configFile.text);
			if (!config || typeof config !== "object" || Array.isArray(config))
				throw new Error("Saved run configuration is invalid. Inspection was rejected.");
			checkConfiguration(config as Record<string, any>, node);
			const text = (config as Record<string, unknown>).task;
			if (typeof text === "string") task = detailText(text);
		}
		const outputFile = await readEvidence(directory, "output.md", signal);
		return {
			...base,
			task,
			taskTruncated: configFile?.truncated ?? false,
			output: outputFile ? detailText(outputFile.text) : undefined,
			outputTruncated: outputFile?.truncated ?? false,
			partial: base.partial || !!outputFile?.text.startsWith("> PARTIAL OUTPUT"),
		};
	};
}

/** Each selection owns its abort signal and generation. Closing never changes a run. */
export class DetailSelection {
	private generation = 0;
	private controller: AbortController | undefined;
	private closed = false;

	constructor(
		private readonly read: DetailReader,
		private readonly live: () => boolean = () => true,
	) {}

	async select(rootRunId: string, runId: string): Promise<RunDetails | undefined> {
		if (this.closed || !this.live()) return undefined;
		this.controller?.abort();
		const controller = new AbortController();
		this.controller = controller;
		const generation = ++this.generation;
		const current = () => !this.closed && this.live() && generation === this.generation && !controller.signal.aborted;
		try {
			const result = await this.read(rootRunId, runId, controller.signal);
			return current() ? result : undefined;
		} catch (error) {
			if (!current()) return undefined;
			throw error;
		}
	}

	close(): void {
		this.closed = true;
		this.generation++;
		this.controller?.abort();
		this.controller = undefined;
	}
}
