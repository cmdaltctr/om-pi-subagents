import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PI_AVAILABLE, PI_BIN, startPi, type PiFixture } from "./fixtures/pi-rpc.ts";
import { writeFixturePersona } from "./fixtures/registry.ts";

const index = new URL("../src/index.ts", import.meta.url).pathname;

async function saved(fixture: PiFixture, file: string) {
	const root = join(fixture.agentDir, "omps", "runs");
	const paths = (await readdir(root, { recursive: true }).catch(() => [])).filter((path) => path.endsWith(`/${file}`));
	return Promise.all(
		paths.map(async (path) => ({ path, value: JSON.parse(await readFile(join(root, path), "utf8")) })),
	);
}

describe.skipIf(!PI_AVAILABLE)("real delegation target list", () => {
	it("refuses a target outside the list and starts the listed one", async () => {
		const fixture = await startPi({
			mcp: false,
			args: ["-e", index],
			env: { OMPS_PI_BIN: PI_BIN },
			seed: async ({ agentDir }) => {
				for (const name of ["delegator", "writer", "reviewer"]) {
					await writeFixturePersona(agentDir, `${name}.md`, `${name.toUpperCase()}-PERSONA-MARKER`);
				}
				await writeFile(
					join(agentDir, "omps/config.yaml"),
					[
						"version: 1",
						"limits: { maxConcurrentRuns: 4, maxDepth: 3 }",
						"agents:",
						"  delegator:",
						"    persona: ./personas/delegator.md",
						"    tools: [omps]",
						"    thinking: off",
						"    delegates: [writer]",
						"  writer:",
						"    persona: ./personas/writer.md",
						"    tools: [read]",
						"    thinking: off",
						"  reviewer:",
						"    persona: ./personas/reviewer.md",
						"    tools: [read]",
						"    thinking: off",
						"",
					].join("\n"),
				);
			},
		});
		try {
			fixture.model.script = (body) => {
				const messages = JSON.stringify(body.messages);
				const tools = body.messages.filter((message: { role: string }) => message.role === "tool").length;
				if (messages.includes("DELEGATOR-PERSONA-MARKER")) {
					if (tools === 0) return { tool: "omps", args: { action: "run", agent: "reviewer", task: "Review it" } };
					if (tools === 1) return { tool: "omps", args: { action: "run", agent: "writer", task: "Write it" } };
					return { text: "Delegator finished" };
				}
				if (messages.includes("WRITER-PERSONA-MARKER")) return { text: "Writer finished" };
				if (tools === 0) return { tool: "omps", args: { action: "run", agent: "delegator", task: "Go" } };
				return { text: messages.includes("OMPS run") ? "Root used results" : "Root early answer" };
			};
			await fixture.send({ type: "prompt", message: "Start" });
			await fixture.waitFor(
				(record) => record.message?.role === "assistant" && record.message.content?.[0]?.text === "Root used results",
			);
			const configurations = await saved(fixture, "config.json");
			const agents = configurations.map((entry) => entry.value.nesting.agent).sort();
			expect(agents).toEqual(["delegator", "writer"]);
			const delegator = configurations.find((entry) => entry.value.nesting.agent === "delegator")!;
			expect(delegator.value.nesting.delegates).toEqual(["writer"]);
			const log = await readFile(
				join(fixture.agentDir, "omps", "runs", delegator.path.replace("config.json", "events.jsonl")),
				"utf8",
			);
			expect(log).toContain('delegator cannot launch \\"reviewer\\": agents.delegator.delegates allows writer.');
			expect(await fixture.exit()).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
