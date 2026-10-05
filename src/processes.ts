// Tracks the descendants of a child so cleanup can confirm that every one of them is gone.
//
// Pi starts its MCP servers in their own process groups, so a group signal does not reach them. Once the
// direct child dies they are re-parented and can no longer be found through ancestry. They are therefore
// recorded while the child lives and matched later by pid and start time, so a reused pid is never touched.

import { execFile } from "node:child_process";

export interface Proc {
	pid: number;
	/** Start time as printed by `ps`; it tells a live process from a later one that reuses the pid. */
	started: string;
}

/**
 * Run `ps`. A missing `ps` always rejects. A non-zero exit rejects only when `strict`, because `ps -p` exits 1
 * when none of the listed pids exist, which is a normal answer.
 */
const run = (args: string[], strict: boolean): Promise<string> =>
	new Promise((resolve, reject) =>
		execFile("ps", args, { encoding: "utf8" }, (error, stdout) => {
			const failed = error && (typeof error.code !== "number" || strict);
			if (failed) reject(new Error(`cannot inspect the process tree: ${error.message}`));
			else resolve(stdout ?? "");
		}),
	);

/** One line of `ps -o pid=,ppid=,lstart=`: two numbers, then a five-field start time. */
const LINE = /^\s*(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s*$/;

/** Every descendant of `rootPid` (children, grandchildren, and so on), wherever its process group is. */
export async function listDescendants(rootPid: number): Promise<Proc[]> {
	const parentOf = new Map<number, { ppid: number; started: string }>();
	for (const line of (await run(["-axo", "pid=,ppid=,lstart="], true)).split("\n")) {
		const match = LINE.exec(line);
		if (match) parentOf.set(Number(match[1]), { ppid: Number(match[2]), started: match[3] });
	}
	const found: Proc[] = [];
	const queue = [rootPid];
	while (queue.length > 0) {
		const parent = queue.shift()!;
		for (const [pid, info] of parentOf) {
			if (info.ppid === parent && !found.some((proc) => proc.pid === pid)) {
				found.push({ pid, started: info.started });
				queue.push(pid);
			}
		}
	}
	return found;
}

/** Start times of the given pids that exist right now. */
async function startTimes(pids: number[]): Promise<Map<number, string>> {
	const now = new Map<number, string>();
	if (pids.length === 0) return now;
	for (const line of (await run(["-o", "pid=,lstart=", "-p", pids.join(",")], false)).split("\n")) {
		const match = /^\s*(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s*$/.exec(line);
		if (match) now.set(Number(match[1]), match[2]);
	}
	return now;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export class OwnedProcesses {
	private readonly known = new Map<number, string>();
	private timer: NodeJS.Timeout | undefined;
	/** A missed sample can hide descendants that later lose their parent. */
	inspectionError: string | undefined;

	constructor(
		private readonly rootPid: number,
		/** Replaceable so a test can make the tree unknowable. */
		private readonly list: (rootPid: number) => Promise<Proc[]> = listDescendants,
	) {}

	/** Remember the descendants that exist now. */
	async sample(): Promise<void> {
		try {
			for (const proc of await this.list(this.rootPid)) this.known.set(proc.pid, proc.started);
		} catch (error) {
			this.inspectionError ??= error instanceof Error ? error.message : String(error);
			throw error;
		}
	}

	/** Sample repeatedly while the child lives. Call `unwatch` when it is stopped. */
	watch(intervalMs = 1000): void {
		this.timer ??= setInterval(() => void this.sample().catch(() => undefined), intervalMs);
		this.timer.unref();
	}

	unwatch(): void {
		clearInterval(this.timer);
		this.timer = undefined;
	}

	/** Recorded descendants that still run. */
	async survivors(): Promise<Proc[]> {
		const now = await startTimes([...this.known.keys()]);
		return [...this.known]
			.filter(([pid, started]) => now.get(pid) === started)
			.map(([pid, started]) => ({ pid, started }));
	}

	/**
	 * Stop every surviving descendant: SIGTERM, then SIGKILL after the grace period. Returns an error text
	 * naming any that still run, and nothing once all are confirmed gone.
	 */
	async reap(graceMs: number): Promise<string | undefined> {
		const signalAll = async (signal: NodeJS.Signals) => {
			for (const { pid } of await this.survivors()) {
				try {
					process.kill(pid, signal);
				} catch {
					// gone already
				}
			}
		};
		const waitGone = async (ms: number) => {
			for (let waited = 0; waited <= ms; waited += 25) {
				if ((await this.survivors()).length === 0) return true;
				await sleep(25);
			}
			return false;
		};
		if ((await this.survivors()).length === 0) return undefined;
		await signalAll("SIGTERM");
		if (await waitGone(graceMs)) return undefined;
		await signalAll("SIGKILL");
		if (await waitGone(graceMs)) return undefined;
		return `process ${(await this.survivors()).map((proc) => proc.pid).join(", ")} of the child still runs`;
	}
}
