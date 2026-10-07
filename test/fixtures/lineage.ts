import type { ChildLineage } from "../../src/protocol.ts";

/** Valid synthetic root-child metadata for isolated launcher and guard fixtures. */
export function fixtureLineage(registryPath = "/operator/omps/config.yaml"): ChildLineage {
	return { registryPath, depth: 1, maxDepth: 1, rootSessionId: "fixture-root", runId: "fixture-run" };
}
