// JSONL client for a child Pi process in RPC mode.

import type { ChildProcess } from "node:child_process";

export type RpcRecord = Record<string, any>;

export interface RpcOptions {
	/** Largest accepted record, in bytes. Default 4 MiB. */
	maxRecordBytes?: number;
	/** Newest records kept in memory. Default 2000. */
	historyLimit?: number;
	/** Receives each stderr chunk as it arrives, for streaming to a log. */
	onStderr?: (text: string) => void;
}

const DEFAULT_MAX_RECORD_BYTES = 4 * 1024 * 1024;
const DEFAULT_HISTORY_LIMIT = 2000;
const STDERR_TAIL_BYTES = 16 * 1024;
const LF = 0x0a;
const OUTPUT_CLOSE_GRACE_MS = 250;

export class RpcChannel {
	readonly records: RpcRecord[] = [];
	/** Resolves when the child has exited and its pipes have closed. */
	readonly exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
	private readonly maxRecordBytes: number;
	private readonly historyLimit: number;
	/** Pieces of the record being read, kept as buffers so split UTF-8 characters stay intact. */
	private pieces: Buffer[] = [];
	private pieceBytes = 0;
	private skipping = false;
	private stderrTail = "";
	private counter = 0;
	private closed = false;
	private inputBroken = false;
	private readonly listeners = new Set<() => void>();
	private readonly recordListeners = new Set<(record: RpcRecord) => void>();
	private readonly pendingWrites = new Set<() => void>();

	constructor(
		private readonly child: ChildProcess,
		options: RpcOptions = {},
	) {
		this.maxRecordBytes = options.maxRecordBytes ?? DEFAULT_MAX_RECORD_BYTES;
		this.historyLimit = options.historyLimit ?? DEFAULT_HISTORY_LIMIT;
		child.stdout!.on("data", (data: Buffer) => this.feed(data));
		child.stderr!.on("data", (data: Buffer) => {
			const text = data.toString("utf8");
			this.stderrTail = (this.stderrTail + text).slice(-STDERR_TAIL_BYTES);
			options.onStderr?.(text);
		});
		// A closed pipe (EPIPE) must reject pending writes, never crash the parent, and be reported as lost.
		child.stdin?.on("error", () => {
			this.inputBroken = true;
			for (const fail of this.pendingWrites) fail();
			this.push({ type: "protocol_error", reason: "child input closed" });
			this.wake();
		});
		// The output pipe can close while the process lives. A normal exit closes it too, so give the
		// `close` event a moment to arrive before calling it lost.
		child.stdout!.on("close", () => {
			setTimeout(() => {
				if (this.closed) return;
				this.push({ type: "protocol_error", reason: "child output closed" });
				this.wake();
			}, OUTPUT_CLOSE_GRACE_MS).unref();
		});
		this.exited = new Promise((done) =>
			child.on("close", (code, signal) => {
				this.closed = true;
				done({ code, signal });
				this.wake();
			}),
		);
	}

	/** Last diagnostics from stderr. Diagnostic text only; never parsed as protocol. */
	stderr(): string {
		return this.stderrTail;
	}

	private feed(data: Buffer): void {
		let rest = data;
		while (rest.length > 0) {
			const newline = rest.indexOf(LF);
			if (newline < 0) {
				this.append(rest);
				break;
			}
			this.append(rest.subarray(0, newline));
			this.endRecord();
			rest = rest.subarray(newline + 1);
		}
		this.wake();
	}

	private append(part: Buffer): void {
		if (this.skipping || part.length === 0) return;
		if (this.pieceBytes + part.length > this.maxRecordBytes) {
			this.pieces = [];
			this.pieceBytes = 0;
			this.skipping = true; // drop everything up to the next LF, then resume
			this.push({ type: "protocol_error", reason: `record exceeds ${this.maxRecordBytes} bytes` });
			return;
		}
		this.pieces.push(part);
		this.pieceBytes += part.length;
	}

	private endRecord(): void {
		const text = Buffer.concat(this.pieces).toString("utf8");
		this.pieces = [];
		this.pieceBytes = 0;
		if (this.skipping) {
			this.skipping = false;
			return;
		}
		if (text.trim() === "") return; // blank lines, including a bare CR from CRLF
		try {
			this.push(JSON.parse(text));
		} catch {
			this.push({ type: "protocol_error", reason: "malformed JSON record" });
		}
	}

	private push(record: RpcRecord): void {
		this.records.push(record);
		if (this.records.length > this.historyLimit) this.records.shift();
		// eslint-disable-next-line unicorn/no-useless-spread -- Callbacks can add or remove subscribers during delivery.
		for (const listener of [...this.recordListeners]) listener(record);
	}

	/** Call `listener` for every record, in order. With `replay`, records already read come first. Returns an unsubscribe function. */
	onRecord(listener: (record: RpcRecord) => void, options: { replay?: boolean } = {}): () => void {
		// eslint-disable-next-line unicorn/no-useless-spread -- Replay stays fixed when callbacks cause new records.
		if (options.replay) for (const record of [...this.records]) listener(record);
		this.recordListeners.add(listener);
		return () => this.recordListeners.delete(listener);
	}

	private wake(): void {
		// eslint-disable-next-line unicorn/no-useless-spread -- Predicates can register waiters while waking existing ones.
		for (const listener of [...this.listeners]) listener();
	}

	/** Resolve with the first record matching `predicate`, now or later. Rejects at the deadline. */
	waitFor(predicate: (record: RpcRecord) => boolean, timeoutMs: number): Promise<RpcRecord> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => finish(() => reject(new Error(`no matching record within ${timeoutMs} ms`))),
				timeoutMs,
			);
			const check = () => {
				const found = this.records.find(predicate);
				if (found) return finish(() => resolve(found));
				if (this.closed) finish(() => reject(new Error("child exited")));
			};
			const finish = (action: () => void) => {
				clearTimeout(timer);
				this.listeners.delete(check);
				action();
			};
			this.listeners.add(check);
			check();
		});
	}

	/** Write one command. Resolves once the bytes are flushed, so a slow child applies back-pressure. */
	send(command: RpcRecord): Promise<void> {
		return new Promise((resolve, reject) => {
			const stdin = this.child.stdin;
			const fail = () => {
				this.pendingWrites.delete(fail);
				reject(new Error("child input closed"));
			};
			if (!stdin || this.inputBroken || !stdin.writable) return fail();
			this.pendingWrites.add(fail);
			stdin.write(`${JSON.stringify(command)}\n`, (error) => {
				if (error) return fail();
				this.pendingWrites.delete(fail);
				resolve();
			});
		});
	}

	/** Send one command and wait for its response. */
	async request(command: RpcRecord, timeoutMs: number): Promise<RpcRecord> {
		const id = `omps-${++this.counter}`;
		const response = this.waitFor((record) => record.type === "response" && record.id === id, timeoutMs);
		response.catch(() => {}); // a failed send must not leave this rejection unhandled
		await this.send({ id, ...command });
		return response;
	}

	/** Close the child's input to request an orderly shutdown. */
	end(): void {
		this.child.stdin?.end();
	}
}
