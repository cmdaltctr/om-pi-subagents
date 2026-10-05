import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ObservedTree } from "./observation.ts";
import { PI_AVAILABLE, PI_BIN, startPi, type PiFixture } from "./test/fixtures/pi-rpc.ts";

const host = new URL("./test/fixtures/observation-host.ts", import.meta.url).pathname;
const emitter = new URL("./test/fixtures/observation-emitter.ts", import.meta.url).pathname;
const brokenSubscription = new URL("./test/fixtures/observation-subscription-failure.ts", import.meta.url).pathname;

async function startHost(injected = false, failedSubscription = false): Promise<PiFixture> {
	return startPi({
		mcp: false,
		args: ["-e", host],
		env: { OMPSS_PI_BIN: PI_BIN },
		seed: async ({ agentDir }) => {
			for (const name of ["delegator", "middle", "leaf"]) {
				// nosemgrep: AIK_ts_generic_path_traversal -- Synthetic createWorkspace directory and three literal persona names. Evidence: docs/local-docs/agent-tree-viewer-review-evidence.md.
				await writeFile(join(agentDir, `${name}.md`), `OBSERVATION_${name.toUpperCase()}_PERSONA`);
			}
			await writeFile(
				// nosemgrep: AIK_ts_generic_path_traversal -- Synthetic createWorkspace directory plus a constant registry filename; no external path input.
				join(agentDir, "om-pi-subagents.yaml"),
				`version: 1\nlimits: { maxConcurrentRuns: 4, maxDepth: 3 }\nagents:\n` +
					["delegator", "middle", "leaf"]
						.map(
							(name) =>
								`  ${name}:\n    persona: ./${name}.md\n    tools: [${name === "leaf" ? "write" : "ompss"}]\n    thinking: off\n` +
								(injected && name === "delegator" ? `    extensions: [${JSON.stringify(emitter)}]\n` : "") +
								(failedSubscription && name === "middle"
									? `    extensions: [${JSON.stringify(brokenSubscription)}]\n`
									: ""),
						)
						.join(""),
			);
		},
	});
}

async function readTrees(fixture: PiFixture): Promise<ObservedTree[]> {
	const count = fixture.records.filter((r) => r.entry?.customType === "fixture-observations").length;
	await fixture.send({ type: "prompt", message: "/fixture-observations" });
	return fixture.records.filter((r) => r.entry?.customType === "fixture-observations")[count].entry.data.trees;
}

async function waitTrees(fixture: PiFixture, predicate: (trees: ObservedTree[]) => boolean): Promise<ObservedTree[]> {
	for (let tries = 0; tries < 100; tries++) {
		const trees = await readTrees(fixture);
		// Fail immediately on the old direct-only path, rather than spending a deadline on missing state.
		expect(trees.length, "authoritative roots must register in the observer").toBeGreaterThan(0);
		if (predicate(trees)) return trees;
		await new Promise((done) => setTimeout(done, 100));
	}
	throw new Error("observation condition not reached");
}

const resultMessages = (fixture: PiFixture) =>
	fixture.records.filter((r) => r.type === "message_end" && r.message?.customType === "ompss-result");

describe.skipIf(!PI_AVAILABLE)("real child observation transport", () => {
	it("observes two isolated roots through great-grandchildren without model-visible progress or duplicate results", async () => {
		const fixture = await startHost();
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const hasTool = body.messages.some((message: { role: string }) => message.role === "tool");
				if (messages.includes("OBSERVATION_LEAF_PERSONA"))
					return hasTool
						? { text: "SECRET_LEAF_OUTPUT", delayMs: 1000 }
						: { tool: "write", args: { path: join(fixture.cwd, "leaf.txt"), content: "SECRET_TOOL_ARGUMENTS" } };
				if (messages.includes("OBSERVATION_MIDDLE_PERSONA"))
					return hasTool
						? { text: "Middle answered" }
						: { tool: "ompss", args: { action: "run", agent: "leaf", task: "SECRET_LEAF_TASK" } };
				if (messages.includes("OBSERVATION_DELEGATOR_PERSONA"))
					return hasTool
						? { text: "Delegator answered" }
						: { tool: "ompss", args: { action: "run", agent: "middle", task: "SECRET_MIDDLE_TASK" } };
				return { text: "Root consumed results" };
			};
			for (let i = 0; i < 2; i++)
				expect(
					(await fixture.send({ type: "prompt", message: `/ompss run delegator SECRET_ROOT_TASK_${i}` })).data
						.disposition,
				).toBe("handled");
			const live = await waitTrees(
				fixture,
				(trees) =>
					trees.length === 2 &&
					trees.every((tree) => tree.nodes.length === 3 && tree.nodes.every((node) => node.model === "fake/counter")),
			);
			expect(new Set(live.flatMap((tree) => tree.nodes.map((node) => node.runId))).size).toBe(6);
			for (const tree of live) {
				expect(tree.nodes.map((node) => node.depth)).toEqual([1, 2, 3]);
				expect(tree.nodes[1].parentRunId).toBe(tree.runId);
				expect(tree.nodes[2].parentRunId).toBe(tree.nodes[1].runId);
				for (let i = 1; i < tree.nodes.length; i++) expect(tree.nodes[i].owner).toBe(tree.nodes[i - 1].childSessionId);
				expect(tree.nodes.every((node) => node.model === "fake/counter")).toBe(true);
				// Knowing a descendant id adds no control authority.
				await fixture.send({ type: "prompt", message: `/ompss cancel ${tree.nodes[2].runId}` });
			}
			expect(fixture.records.filter((r) => r.method === "notify").some((r) => r.message?.includes("unknown run"))).toBe(
				true,
			);
			const final = await waitTrees(fixture, (trees) =>
				trees.every((tree) => tree.nodes.every((node) => node.state === "completed")),
			);
			expect(final.every((tree) => !tree.incomplete)).toBe(true);
			expect(JSON.stringify(final)).not.toMatch(/SECRET_|args|result|thinking|stderr|auth/);
			await fixture.waitFor(() => resultMessages(fixture).length === 2);
			expect(resultMessages(fixture)).toHaveLength(2);
			for (const body of fixture.model.requests as { messages: unknown[] }[])
				expect(JSON.stringify(body.messages)).not.toMatch(/ompss-observation|activeTools|rootSessionId|nodes-omitted/);
			const childRequests = (marker: string) =>
				fixture.model.requests.filter((body) => JSON.stringify(body).includes(marker));
			expect(childRequests("OBSERVATION_LEAF_PERSONA")).toHaveLength(4);
			expect(childRequests("OBSERVATION_MIDDLE_PERSONA")).toHaveLength(6);
			expect(childRequests("OBSERVATION_DELEGATOR_PERSONA")).toHaveLength(6);
		} finally {
			await fixture.send({ type: "abort" });
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("uses dedicated revisions for startup replay and before-parent records, strips secrets and relays missing evidence", async () => {
		const fixture = await startHost(true);
		try {
			fixture.model.script = [{ text: "Answer", delayMs: 500 }];
			await fixture.send({ type: "prompt", message: "/ompss run delegator A task" });
			const trees = await waitTrees(
				fixture,
				(values) => values[0].nodes.length === 3 && values[0].nodes[0].state === "completed",
			);
			const tree = trees[0];
			expect(tree.nodes.slice(1).map((node) => [node.state, node.revision])).toEqual([
				["completed", 3],
				["completed", 8],
			]);
			expect(tree.reasons).toEqual(
				expect.arrayContaining(["nodes-omitted", "backlog-overflow", "invalid-record", "lineage"]),
			);
			expect(JSON.stringify(tree)).not.toMatch(/SECRET_|padding|oversized-|foreign-|spoof-|owner-forgery-/);
			await fixture.waitFor(() => resultMessages(fixture).length === 1);
			expect(resultMessages(fixture)).toHaveLength(1);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("relays lower-hop subscription failure without hiding missing evidence or losing authoritative terminal snapshots", async () => {
		const fixture = await startHost(false, true);
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const hasTool = body.messages.some((message: { role: string }) => message.role === "tool");
				if (messages.includes("OBSERVATION_LEAF_PERSONA")) return { text: "Leaf answer", delayMs: 300 };
				if (messages.includes("OBSERVATION_MIDDLE_PERSONA"))
					return hasTool
						? { text: "Middle answer" }
						: { tool: "ompss", args: { action: "run", agent: "leaf", task: "Leaf task" } };
				if (messages.includes("OBSERVATION_DELEGATOR_PERSONA"))
					return hasTool
						? { text: "Delegator answer" }
						: { tool: "ompss", args: { action: "run", agent: "middle", task: "Middle task" } };
				return { text: "Root answer" };
			};
			await fixture.send({ type: "prompt", message: "/ompss run delegator Task" });
			const trees = await waitTrees(fixture, (values) => values[0].nodes[0].state === "completed");
			expect(trees[0].nodes, JSON.stringify(trees[0])).toHaveLength(4);
			expect(trees[0].nodes.every((node) => node.state === "completed")).toBe(true);
			expect(trees[0].reasons).toContain("connection-lost");
			await fixture.waitFor(() => resultMessages(fixture).length === 1);
			expect(resultMessages(fixture)).toHaveLength(1);
			expect(fixture.records.some((r) => r.type === "extension_error")).toBe(false);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});

	it("marks failed display callbacks incomplete while execution and single result delivery continue", async () => {
		const fixture = await startHost();
		try {
			fixture.model.script = [{ text: "Answer", delayMs: 500 }];
			await fixture.send({ type: "prompt", message: "/ompss run leaf A task" });
			await fixture.send({ type: "prompt", message: "/fixture-broken-display" });
			const trees = await waitTrees(fixture, (values) => values[0].nodes[0].state === "completed");
			expect(trees[0].reasons).toContain("connection-lost");
			await fixture.waitFor(() => resultMessages(fixture).length === 1);
			expect(resultMessages(fixture)).toHaveLength(1);
			expect(fixture.records.some((r) => r.type === "extension_error")).toBe(false);
		} finally {
			await fixture.exit();
			await fixture.dispose();
		}
	});
});
