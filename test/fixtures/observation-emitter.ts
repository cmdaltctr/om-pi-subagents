import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readChildPolicy } from "../../src/protocol.ts";

/** Inject reordered and untrusted display data into a real child's existing pipe. */
export default function observationEmitter(pi: ExtensionAPI): void {
	let evidenceRevision = 0;
	const emitSnapshots = (_event: unknown, ctx: ExtensionContext) => {
		const policy = readChildPolicy();
		if (typeof policy === "string") throw new Error(policy);
		const branch = policy.lineage;
		const base = {
			owner: ctx.sessionManager.getSessionId(),
			rootSessionId: branch.rootSessionId,
			agent: "same-agent",
			startedAt: 1,
			activeTools: [],
			model: "fake/counter",
		};
		const emit = (snapshot: object, reasons: string[] = [], extra: object = {}) =>
			pi.appendEntry("omps-observation", {
				token: process.env.OMPS_RUN_TOKEN,
				snapshot,
				reasons,
				evidenceRevision: ++evidenceRevision,
				...extra,
			});
		const parent = {
			...base,
			runId: `middle-${branch.runId}`,
			parentRunId: branch.runId,
			depth: 2,
			childSessionId: `nested-${branch.runId}`,
		};
		const leaf = {
			...base,
			owner: parent.childSessionId,
			runId: `leaf-${branch.runId}`,
			parentRunId: parent.runId,
			depth: 3,
		};
		emit({ ...leaf, state: "completed", revision: 8, endedAt: 2 });
		emit({ ...leaf, state: "running", revision: 3 });
		emit(
			{
				...parent,
				state: "running",
				revision: 2,
				task: "SECRET_TASK",
				args: "SECRET_ARGS",
				thinking: "SECRET_THINKING",
			},
			["nodes-omitted", "backlog-overflow"],
			{ output: "SECRET_OUTPUT", result: "SECRET_RESULT", stderr: "SECRET_STDERR", auth: "SECRET_AUTH" },
		);
		emit({ ...parent, state: "completed", revision: 3, endedAt: 2 });
		emit({ ...parent, state: "starting", revision: 1 });
		emit({ ...parent, runId: `oversized-${branch.runId}`, state: "running", revision: 1 }, [], {
			padding: "x".repeat(16 * 1024),
		});
		emit({ ...parent, runId: `foreign-${branch.runId}`, rootSessionId: "foreign-root", state: "running", revision: 1 });
		emit({
			...parent,
			runId: `owner-forgery-${branch.runId}`,
			owner: branch.rootSessionId,
			state: "running",
			revision: 1,
		});
		emit({ ...parent, runId: `spoof-${branch.runId}`, state: "running", revision: 1 }, [], { token: "wrong-token" });
	};
	pi.on("session_start", emitSnapshots);
	pi.on("before_agent_start", emitSnapshots);
}
