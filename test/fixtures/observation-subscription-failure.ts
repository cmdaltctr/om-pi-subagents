import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ObservationRelay } from "../../observation-relay.ts";
import { ObservationStore } from "../../observation.ts";
import { OBSERVATION_ENTRY, readChildPolicy } from "../../protocol.ts";
import { RunManager } from "../../runs.ts";

/** Exercise a failed lower-hop subscription over the real managed child's existing pipe. */
export default function subscriptionFailure(pi: ExtensionAPI): void {
	let started = false;
	pi.on("before_agent_start", (_event, ctx) => {
		if (started) return;
		started = true;
		const policy = readChildPolicy();
		if (typeof policy === "string") throw new Error(policy);
		const observations = new ObservationStore();
		observations.subscribe = () => {
			throw new Error("disposable subscription failure");
		};
		const relay = new ObservationRelay({
			observations,
			current: (run) => manager.status(run.owner, run.id),
			publish: (envelope) => pi.appendEntry(OBSERVATION_ENTRY, envelope),
			token: process.env.OMPSS_RUN_TOKEN,
		});
		const manager = new RunManager(
			async (_run, _request, hooks) => {
				hooks.markRunning();
				await new Promise((done) => setTimeout(done, 10));
				return { state: "completed" };
			},
			{ onChange: (run) => relay.onChange(run) },
		);
		manager.start(ctx.sessionManager.getSessionId(), {
			agent: {
				name: "synthetic-display-source",
				persona: "unused",
				personaPath: "/unused",
				tools: [],
				thinking: "off",
				skills: [],
				extensions: [],
			},
			task: "unused",
			cwd: ctx.cwd,
			nesting: { ...policy.lineage, parentRunId: policy.lineage.runId, depth: policy.lineage.depth + 1 },
		});
	});
}
