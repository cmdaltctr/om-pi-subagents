import { describe, expect, it, vi } from "vitest";
import type { RpcRecord } from "./rpc.ts";
import { RunManager } from "./runs.ts";

const mocks = vi.hoisted(() => ({ launch: vi.fn(), stop: vi.fn(async () => undefined) }));
vi.mock("./startup.ts", () => ({ launchChild: mocks.launch }));
vi.mock("./runner.ts", () => ({ DEFAULT_STARTUP_DEADLINE_MS: 30_000, stopGroup: mocks.stop }));
import { createSupervisor } from "./supervisor.ts";

const start: RpcRecord = { type: "tool_execution_start", toolCallId: "task/1", toolName: "read" };
const end: RpcRecord = { type: "tool_execution_end", toolCallId: "task/1", toolName: "read" };

function setup(throwProgress = false) {
	let listener!: (record: RpcRecord) => void;
	let acknowledge!: () => void;
	let prompted!: () => void;
	let exited!: (exit: { code: number; signal: null }) => void;
	const taskReceived = new Promise<void>((resolve) => {
		prompted = resolve;
	});
	const ack = new Promise<void>((resolve) => {
		acknowledge = resolve;
	});
	const progress = vi.fn(() => {
		if (throwProgress) throw new Error("UI broke");
	});
	const persist = vi.fn(async () => undefined);
	const terminal = vi.fn();
	const channel = {
		exited: new Promise<{ code: number; signal: null }>((resolve) => {
			exited = resolve;
		}),
		onRecord: (cb: typeof listener, options: { replay: boolean }) => {
			listener = cb;
			if (options.replay) {
				cb({ ...start, toolCallId: "startup" });
				cb({ ...end, toolCallId: "startup" });
			}
		},
		request: async () => {
			listener(start);
			listener(end);
			listener({ type: "tool_execution_update", toolCallId: "task/1" });
			prompted();
			await ack;
			return { success: true, data: { disposition: "started" } };
		},
		end: () => exited({ code: 0, signal: null }),
	};
	mocks.launch.mockResolvedValue({ child: {}, channel, owned: {}, readiness: { model: "fake/counter" } });
	const supervise = createSupervisor({
		piBin: "/bin/pi",
		guardPath: "/guard.ts",
		prepare: async () => ({ personaFile: "/persona.md" }),
		persist,
		onProgress: progress,
	});
	const manager = new RunManager(supervise, { onTerminal: terminal });
	const run = manager.start("s1", {
		agent: {
			name: "reader",
			persona: "Read.",
			personaPath: "/persona.md",
			tools: ["read"],
			thinking: "off",
			skills: [],
			extensions: [],
		},
		task: "Read.",
		cwd: "/w",
	});
	const finish = () => {
		listener({
			type: "message_end",
			message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "answer" }] },
		});
		listener({ type: "agent_settled" });
	};
	return { run, manager, progress, persist, terminal, taskReceived, acknowledge, finish };
}

describe("task progress relay", () => {
	it("excludes startup replay and relays fast tools before acknowledgement without completing", async () => {
		const h = setup();
		await h.taskReceived;
		expect(h.progress.mock.calls).toEqual([
			[h.run, start],
			[h.run, end],
		]);
		expect(h.manager.status("s1", h.run.id).state).toBe("starting");
		expect(h.terminal).not.toHaveBeenCalled();
		h.acknowledge();
		await vi.waitFor(() => expect(h.manager.status("s1", h.run.id).state).toBe("running"));
		expect(h.terminal).not.toHaveBeenCalled();
		h.finish();
		await vi.waitFor(() => expect(h.manager.status("s1", h.run.id).state).toBe("completed"));
		expect(h.persist).toHaveBeenCalledWith(h.run, { kind: "final", text: "answer" });
		expect(mocks.stop).toHaveBeenCalled();
	});

	it("contains progress callback exceptions without changing persistence or cleanup", async () => {
		const h = setup(true);
		await h.taskReceived;
		expect(h.progress).toHaveBeenCalledTimes(2);
		h.acknowledge();
		h.finish();
		await vi.waitFor(() => expect(h.manager.status("s1", h.run.id).state).toBe("completed"));
		expect(h.persist).toHaveBeenCalled();
	});
});
