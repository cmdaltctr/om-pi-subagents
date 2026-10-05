// The RPC stream adapter against a fake child, so framing edge cases are deterministic.
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { RpcChannel } from "../rpc.ts";

interface FakeChild {
	child: ChildProcess;
	stdout: PassThrough;
	stderr: PassThrough;
	written: string[];
	stdin: Writable;
	close(code?: number): void;
}

/** A child whose stdin records what is written and whose stdout the test feeds. */
function fakeChild(stdin?: Writable): FakeChild {
	const events = new EventEmitter();
	const stdout = new PassThrough();
	const stderr = new PassThrough();
	const written: string[] = [];
	const input =
		stdin ??
		new Writable({
			write(chunk, _encoding, done) {
				written.push(chunk.toString("utf8"));
				done();
			},
		});
	const child = Object.assign(events, { stdout, stderr, stdin: input, pid: 4242 }) as unknown as ChildProcess;
	return { child, stdout, stderr, stdin: input, written, close: (code = 0) => events.emit("close", code, null) };
}

const tick = () => new Promise((done) => setImmediate(done));
const line = (value: unknown) => `${JSON.stringify(value)}\n`;

describe("framing", () => {
	it("splits records on LF only, however the bytes arrive", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		const bytes = Buffer.from(line({ a: 1 }) + line({ b: 2 }));
		for (let offset = 0; offset < bytes.length; offset += 3) fake.stdout.write(bytes.subarray(offset, offset + 3));
		await tick();
		expect(channel.records).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("decodes a multi-byte character that is split across chunks", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		const bytes = Buffer.from(line({ text: "héllo 😀 end" }));
		const middle = bytes.indexOf(0xf0) + 2; // inside the four-byte emoji
		fake.stdout.write(bytes.subarray(0, middle));
		fake.stdout.write(bytes.subarray(middle));
		await tick();
		expect(channel.records).toEqual([{ text: "héllo 😀 end" }]);
	});

	it("does not split on the Unicode line and paragraph separators inside a string", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		fake.stdout.write(line({ text: "a b c" }));
		await tick();
		expect(channel.records).toEqual([{ text: "a b c" }]);
	});

	it("accepts CRLF line endings", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		fake.stdout.write('{"a":1}\r\n\r\n{"b":2}\r\n');
		await tick();
		expect(channel.records).toEqual([{ a: 1 }, { b: 2 }]);
	});

	it("reports a malformed record and keeps reading", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		fake.stdout.write(`not json\n${line({ ok: true })}`);
		await tick();
		expect(channel.records.map((record) => record.type ?? "ok")).toEqual(["protocol_error", "ok"]);
	});
});

describe("oversized records", () => {
	it("reports one protocol error, drops the record and resumes at the next line", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child, { maxRecordBytes: 64 });
		fake.stdout.write("x".repeat(40));
		fake.stdout.write("y".repeat(40)); // crosses the limit before any LF
		fake.stdout.write(`z".repeat(10)\n${line({ after: 1 })}`);
		await tick();
		const errors = channel.records.filter((record) => record.type === "protocol_error");
		expect(errors).toHaveLength(1);
		expect(errors[0].reason).toMatch(/exceeds 64 bytes/);
		expect(channel.records.at(-1)).toEqual({ after: 1 });
	});

	it("rejects a complete line that is over the limit", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child, { maxRecordBytes: 32 });
		fake.stdout.write(line({ big: "q".repeat(100) }) + line({ small: 1 }));
		await tick();
		expect(channel.records.map((record) => record.type ?? Object.keys(record)[0])).toEqual(["protocol_error", "small"]);
	});
});

describe("responses", () => {
	it("correlates by id, not by order", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		const first = channel.request({ type: "get_state" }, 1000);
		const second = channel.request({ type: "get_commands" }, 1000);
		await tick();
		const ids = fake.written.map((text) => JSON.parse(text).id);
		fake.stdout.write(line({ type: "response", id: ids[1], command: "get_commands", success: true }));
		fake.stdout.write(line({ type: "response", id: ids[0], command: "get_state", success: true }));
		expect((await first).command).toBe("get_state");
		expect((await second).command).toBe("get_commands");
	});

	it("rejects at the deadline", async () => {
		const channel = new RpcChannel(fakeChild().child);
		await expect(channel.request({ type: "get_state" }, 30)).rejects.toThrow(/within 30 ms/);
	});

	it("rejects when the child exits first", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		const pending = channel.request({ type: "get_state" }, 1000);
		await tick();
		fake.close(1);
		await expect(pending).rejects.toThrow(/child exited/);
	});
});

describe("back-pressure and closed pipes", () => {
	it("waits for drain before a send completes", async () => {
		let flush: (() => void) | undefined;
		const slow = new Writable({
			highWaterMark: 4,
			write(_chunk, _encoding, done) {
				flush = done;
			},
		});
		const channel = new RpcChannel(fakeChild(slow).child);
		let sent = false;
		void channel.send({ type: "prompt", message: "x".repeat(100) }).then(() => (sent = true));
		await tick();
		expect(sent).toBe(false);
		flush!();
		await tick();
		expect(sent).toBe(true);
	});

	it("turns a broken stdin into a rejection, not a crash", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		const pending = channel.send({ type: "get_state" });
		fake.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
		await expect(pending).rejects.toThrow(/child input closed/);
		await expect(channel.send({ type: "get_state" })).rejects.toThrow(/child input closed/);
	});

	it("keeps reading a fast stream and bounds what it remembers", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child, { historyLimit: 100 });
		for (let index = 0; index < 5000; index++) fake.stdout.write(line({ type: "tick", index }));
		await tick();
		expect(channel.records).toHaveLength(100);
		expect(channel.records.at(-1)).toMatchObject({ index: 4999 });
	});
});

describe("subscription", () => {
	it("snapshots subscribers before callbacks add or remove listeners", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		const delivered: string[] = [];
		let stopSecond = () => {};
		channel.onRecord((record) => {
			delivered.push(`first:${record.n}`);
			if (record.n === 1) {
				stopSecond();
				channel.onRecord((next) => delivered.push(`late:${next.n}`));
			}
		});
		stopSecond = channel.onRecord((record) => delivered.push(`second:${record.n}`));
		fake.stdout.write(line({ n: 1 }));
		fake.stdout.write(line({ n: 2 }));
		await tick();
		expect(delivered).toEqual(["first:1", "second:1", "first:2", "late:2"]);
	});

	it("replays a fixed history when callbacks cause another record", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child, { historyLimit: 2 });
		fake.stdout.write(line({ n: 1 }));
		fake.stdout.write(line({ n: 2 }));
		await tick();
		const replayed: number[] = [];
		channel.onRecord(
			(record) => {
				replayed.push(record.n);
				if (record.n === 1) fake.stdout.write(line({ n: 3 }));
			},
			{ replay: true },
		);
		expect(replayed).toEqual([1, 2]);
		expect(channel.records).toEqual([{ n: 2 }, { n: 3 }]);
	});

	it("delivers each record once, replays history on request and stops after unsubscribe", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		fake.stdout.write(line({ n: 1 }));
		await tick();

		const live: unknown[] = [];
		const replayed: unknown[] = [];
		const stop = channel.onRecord((record) => live.push(record));
		channel.onRecord((record) => replayed.push(record), { replay: true });
		fake.stdout.write(line({ n: 2 }));
		await tick();
		stop();
		fake.stdout.write(line({ n: 3 }));
		await tick();

		expect(live).toEqual([{ n: 2 }]);
		expect(replayed).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
	});
});

describe("output pipe loss", () => {
	it("reports a closed output pipe while the child still lives", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		fake.stdout.destroy();
		await new Promise((done) => setTimeout(done, 400));
		expect(channel.records).toEqual([{ type: "protocol_error", reason: "child output closed" }]);
	});

	it("does not report it when the child exits normally", async () => {
		const fake = fakeChild();
		const channel = new RpcChannel(fake.child);
		fake.stdout.destroy();
		fake.close(0);
		await new Promise((done) => setTimeout(done, 400));
		expect(channel.records).toEqual([]);
	});
});
