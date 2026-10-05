// Private, durable run artefacts: one directory per run, owner-only permissions, atomic status and output,
// streamed logs with authentication fields redacted.
//
// Files: config.json and persona.md (launch inputs), status.json, events.jsonl and stderr.log (evidence),
// output.md (final answer, or output labelled partial). Persona text, tasks and outputs stay sensitive and local.

import { createWriteStream, type WriteStream } from "node:fs";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunRequest, RunView } from "./runs.ts";

const DIR_MODE = 0o700;
const FILE_MODE = 0o600;
/** Bytes a slow disk may leave queued in memory before the run is failed. */
const MAX_LOG_BACKLOG = 8 * 1024 * 1024;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function safeId(label: string, value: string): string {
	if (!SAFE_ID.test(value)) throw new Error(`unsafe ${label}: ${JSON.stringify(value)}`);
	return value;
}

const SECRET_KEY =
	/^(authorization|proxy-authorization|x-api-key|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|password|passwd|secret|client[-_]?secret|cookie|set-cookie)$/i;
const BEARER = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi;
const ASSIGNED = /\b(api[_-]?key|token|secret|password)(\s*[=:]\s*)[^\s,;"']+/gi;

/** A copy of `value` with authentication fields, bearer tokens and `key=value` secrets replaced. */
export function redact<T>(value: T): T {
	if (typeof value === "string") return value.replace(BEARER, "$1[redacted]").replace(ASSIGNED, "$1$2[redacted]") as T;
	if (Array.isArray(value)) return value.map(redact) as T;
	if (typeof value === "object" && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, inner]) => [key, SECRET_KEY.test(key) ? "[redacted]" : redact(inner)]),
		) as T;
	}
	return value;
}

let counter = 0;

/** Write through a temporary file and a rename, so a reader never sees half a file. */
async function writeAtomic(path: string, data: string): Promise<void> {
	const temporary = `${path}.${process.pid}.${++counter}.tmp`;
	try {
		await writeFile(temporary, data, { mode: FILE_MODE });
		await rename(temporary, path);
	} catch (error) {
		await unlink(temporary).catch(() => undefined);
		throw error;
	}
}

export interface RunLogs {
	event(record: unknown): void;
	stderr(text: string): void;
	/** Resolves, once, with the reason if a log file cannot be written. Never resolves on success. */
	readonly failure: Promise<string>;
	close(): Promise<void>;
}

export interface RunFiles {
	readonly directory: string;
	/** Run-directory copy of the persona snapshot, for `--append-system-prompt`. */
	readonly personaFile: string;
	writeStatus(view: RunView & { pid?: number; model?: string }): Promise<void>;
	writeOutput(kind: "final" | "partial", text: string, reason?: string): Promise<void>;
	/** The saved output, or nothing when none was saved. */
	readOutput(): Promise<string | undefined>;
	/** Whether the terminal notification reached the parent. Kept apart from the run's result. */
	writeNotification(result: { delivered: boolean; error?: string }): Promise<void>;
	openLogs(): RunLogs;
}

export class RunStore {
	constructor(private readonly root: string) {}

	/** Where a run's files live. Pure, so a launch can report it before any file exists. */
	directoryFor(owner: string, runId: string): string {
		// nosemgrep: AIK_ts_generic_path_traversal -- Both ids reject separators and dot segments; the root is operator-controlled.
		return join(this.root, safeId("session id", owner), safeId("run id", runId));
	}

	async create(view: RunView, request: RunRequest): Promise<RunFiles> {
		const owner = safeId("session id", view.owner);
		const runId = safeId("run id", view.id);
		const directory = this.directoryFor(owner, runId);
		// nosemgrep: AIK_ts_generic_path_traversal -- Owner and run ids were validated before joining the trusted root.
		for (const path of [this.root, join(this.root, owner), directory]) {
			await mkdir(path, { recursive: true, mode: DIR_MODE });
			await chmod(path, DIR_MODE); // mkdir's mode is subject to the umask
		}

		const { persona, ...settings } = request.agent;
		// nosemgrep: AIK_ts_generic_path_traversal -- The run directory uses validated ids and the filename is constant.
		const personaFile = join(directory, "persona.md");
		await writeAtomic(personaFile, persona);
		await writeAtomic(
			// nosemgrep: AIK_ts_generic_path_traversal -- The run directory uses validated ids and the filename is constant.
			join(directory, "config.json"),
			JSON.stringify(
				{
					runId,
					owner,
					agent: settings,
					task: request.task,
					cwd: request.cwd,
					createdAt: view.startedAt,
					limits: request.limits,
					nesting: request.nesting,
				},
				null,
				2,
			),
		);

		const files: RunFiles = {
			directory,
			personaFile,
			writeStatus: (current) =>
				// nosemgrep: AIK_ts_generic_path_traversal -- The run directory uses validated ids and the filename is constant.
				writeAtomic(join(directory, "status.json"), JSON.stringify({ ...current, directory }, null, 2)),
			writeOutput: (kind, text, reason) =>
				writeAtomic(
					// nosemgrep: AIK_ts_generic_path_traversal -- The run directory uses validated ids and the filename is constant.
					join(directory, "output.md"),
					kind === "final"
						? text
						: `> PARTIAL OUTPUT. ${reason ?? "The run did not finish"}; the text below may be incomplete.\n\n${text}`,
				),
			// nosemgrep: AIK_ts_generic_path_traversal -- The run directory uses validated ids and the filename is constant.
			readOutput: () => readFile(join(directory, "output.md"), "utf8").catch(() => undefined),
			// nosemgrep: AIK_ts_generic_path_traversal -- The run directory uses validated ids and the filename is constant.
			writeNotification: (result) => writeAtomic(join(directory, "notification.json"), JSON.stringify(result, null, 2)),
			openLogs: () => openLogs(directory),
		};
		await files.writeStatus(view);
		return files;
	}
}

function openLogs(directory: string): RunLogs {
	let fail!: (reason: string) => void;
	const failure = new Promise<string>((resolve) => (fail = resolve));
	const open = (name: string): WriteStream => {
		// nosemgrep: AIK_ts_generic_path_traversal -- Directory ids are validated; this private helper receives only two fixed log filenames.
		const stream = createWriteStream(join(directory, name), { flags: "a", mode: FILE_MODE });
		stream.on("error", (error) => fail(`could not write ${name}: ${error.message}`));
		return stream;
	};
	const events = open("events.jsonl");
	const stderr = open("stderr.log");

	const write = (stream: WriteStream, name: string, text: string) => {
		if (stream.destroyed) return;
		if (stream.writableLength > MAX_LOG_BACKLOG) return fail(`could not write ${name}: the disk cannot keep up`);
		stream.write(text);
	};
	const closeStream = (stream: WriteStream) =>
		new Promise<void>((done) => (stream.destroyed ? done() : stream.end(() => done())));

	return {
		event: (record) => write(events, "events.jsonl", `${JSON.stringify(redact(record))}\n`),
		stderr: (text) => write(stderr, "stderr.log", redact(text)),
		failure,
		close: async () => {
			await Promise.all([closeStream(events), closeStream(stderr)]);
		},
	};
}
