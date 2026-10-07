import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLaunch } from "../src/runner.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";
import { PI_AVAILABLE, PI_BIN, startPi } from "./fixtures/pi-rpc.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Install only the locally packed tarball in a disposable consumer. Never edit the source worktree. */
async function installPackedPackage(): Promise<{ path: string; dispose(): Promise<void> }> {
	const temporary = await mkdtemp(join(tmpdir(), "omps-packed-skill-"));
	try {
		const output = execFileSync("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], {
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, HUSKY: "0" },
		});
		const packed = (JSON.parse(output.slice(output.indexOf("[\n"))) as Array<{ filename: string }>)[0];
		const consumer = join(temporary, "consumer");
		await mkdir(consumer);
		await writeFile(join(consumer, "bunfig.toml"), "peer = false\n");
		await writeFile(
			join(consumer, "package.json"),
			JSON.stringify({
				private: true,
				dependencies: { "om-pi-subagents": `file:${join(temporary, packed.filename)}` },
			}),
		);
		execFileSync("bun", ["install", "--production", "--ignore-scripts", "--backend", "copyfile"], {
			cwd: consumer,
			encoding: "utf8",
			env: { ...process.env, HUSKY: "0" },
		});
		return {
			path: join(consumer, "node_modules", "om-pi-subagents"),
			dispose: () => rm(temporary, { recursive: true, force: true }),
		};
	} catch (error) {
		await rm(temporary, { recursive: true, force: true });
		throw error;
	}
}

describe.skipIf(!PI_AVAILABLE)("disposable packed package skill", () => {
	it("discovers revised guidance through the installed manifest without an ambient child skill", async () => {
		const installed = await installPackedPackage();
		try {
			const manifest = JSON.parse(await readFile(join(installed.path, "package.json"), "utf8"));
			expect(manifest.files).toContain("skills/om-pi-subagents/SKILL.md");
			expect(manifest.pi.skills).toEqual(["./skills"]);
			const skill = join(installed.path, "skills", "om-pi-subagents", "SKILL.md");
			const text = await readFile(skill, "utf8");
			for (const link of text.matchAll(/\]\((\.\.\/\.\.\/docs\/[^)]+)\)/g))
				expect(await readFile(resolve(dirname(skill), link[1].split("#")[0]), "utf8")).not.toBe("");
			const parent = await startPi({ mcp: false, args: ["-e", installed.path] });
			try {
				const commands = (await parent.send({ type: "get_commands" })).data.commands;
				expect(commands.some((command: { name: string }) => command.name === "skill:om-pi-subagents")).toBe(true);
				await parent.send({ type: "prompt", message: "/skill:om-pi-subagents Explain fleet and capability settings" });
				await parent.waitFor((record) => record.type === "agent_settled");
				const request = JSON.stringify(parent.model.requests);
				for (const phrase of ["/omps fleet", "/omps-settings", "On (configured)", "parent's real memory tool"])
					expect(request).toContain(phrase);
				const child = await startPi({
					mcp: false,
					launch: ({ cwd, agentDir }) =>
						buildLaunch({
							snapshot: {
								name: "child",
								personaPath: "unused",
								persona: "Packed skill fixture",
								tools: ["read"],
								thinking: "off",
								skills: [],
								extensions: [],
							},
							cwd,
							personaFile: join(agentDir, "child.md"),
							guardPath: join(root, "src", "child-guard.ts"),
							runToken: "packed-skill-fixture",
							lineage: fixtureLineage(join(agentDir, "omps/config.yaml")),
							piBin: PI_BIN,
							parentModel: "fake/counter",
						}),
					seed: async ({ agentDir }) => writeFile(join(agentDir, "child.md"), "Packed skill fixture"),
				});
				try {
					const childCommands = (await child.send({ type: "get_commands" })).data.commands;
					expect(childCommands.some((command: { name: string }) => command.name === "skill:om-pi-subagents")).toBe(
						false,
					);
				} finally {
					await child.exit();
					await child.dispose();
				}
			} finally {
				await parent.exit();
				await parent.dispose();
			}
			// The installed source is a real copy in the disposable consumer, not the project checkout.
			expect(await realpath(installed.path)).not.toBe(await realpath(root));
		} finally {
			await installed.dispose();
		}
	});
});
