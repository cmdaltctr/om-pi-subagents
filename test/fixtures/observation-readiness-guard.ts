import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import childGuard from "../../src/child-guard.ts";
import { OBSERVATION_ENTRY, PREFLIGHT_COMMAND, readChildPolicy } from "../../src/protocol.ts";

/** Emit display snapshots during the real readiness command, before supervision subscribes. */
export default function readinessGuard(pi: ExtensionAPI): void {
	childGuard({
		...pi,
		registerCommand(name, command) {
			if (name !== PREFLIGHT_COMMAND) return pi.registerCommand(name, command);
			pi.registerCommand(name, {
				...command,
				handler: async (args, ctx) => {
					const policy = readChildPolicy();
					if (typeof policy === "string") throw new Error(policy);
					const branch = policy.lineage;
					const parentId = `parent-${branch.runId}`;
					const base = {
						owner: ctx.sessionManager.getSessionId(),
						rootSessionId: branch.rootSessionId,
						agent: "same-agent",
						model: "fake/counter",
						startedAt: 1,
						activeTools: [],
					};
					const emit = (snapshot: object) =>
						pi.appendEntry(OBSERVATION_ENTRY, {
							token: process.env.OMPS_RUN_TOKEN,
							snapshot,
							reasons: [],
							evidenceRevision: 1,
						});
					const leaf = {
						...base,
						owner: `nested-${branch.runId}`,
						runId: `leaf-${branch.runId}`,
						parentRunId: parentId,
						depth: 3,
					};
					emit({ ...leaf, state: "completed", endedAt: 2, revision: 9 });
					emit({ ...leaf, state: "running", revision: 2 });
					emit({
						...base,
						runId: parentId,
						childSessionId: leaf.owner,
						parentRunId: branch.runId,
						depth: 2,
						state: "completed",
						endedAt: 2,
						revision: 4,
					});
					await command.handler(args, ctx);
				},
			});
		},
	});
}
