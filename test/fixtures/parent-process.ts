import { fixtureRegistryPath } from "./registry.ts";
// Test-only "parent": launches an OMPS child through the real gate, reports its pid, then idles.
// The test kills this process without warning to prove that no child outlives its parent.
import type { AgentSnapshot } from "../../src/config.ts";
import { launchChild } from "../../src/startup.ts";
import { fixtureLineage } from "./lineage.ts";

const config = JSON.parse(process.argv[2]);
const snapshot: AgentSnapshot = {
	name: "agent",
	personaPath: "unused",
	persona: "Persona.",
	tools: config.tools,
	thinking: "off",
	skills: [],
	extensions: [],
};

const ready = await launchChild({
	snapshot,
	cwd: config.cwd,
	personaFile: config.personaFile,
	guardPath: config.guardPath,
	runToken: "parent-run",
	lineage: fixtureLineage(fixtureRegistryPath(config.env.PI_CODING_AGENT_DIR)),
	piBin: config.piBin,
	parentModel: "fake/counter",
	env: config.env,
});
if (config.busy) await ready.channel.request({ type: "prompt", message: "go" }, 20_000);
process.stdout.write(`READY ${ready.child.pid}\n`);
setInterval(() => {}, 1000);
