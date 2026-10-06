import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnSpy = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("node:child_process", () => ({ spawn: spawnSpy }));

import type { AgentSnapshot } from "../src/config.ts";
import { buildLaunch, spawnChild, type LaunchInput } from "../src/runner.ts";
import { fixtureLineage } from "./fixtures/lineage.ts";

const snapshot = (overrides: Partial<AgentSnapshot> = {}): AgentSnapshot => ({
	name: "reader",
	personaPath: "/ext/personas/reader.md",
	persona: "Read things.",
	tools: ["read", "grep"],
	thinking: "off",
	skills: [],
	extensions: [],
	...overrides,
});

const input = (overrides: Partial<AgentSnapshot> = {}, extra: Partial<LaunchInput> = {}): LaunchInput => ({
	snapshot: snapshot(overrides),
	cwd: "/work",
	personaFile: "/runs/r1/persona.md",
	guardPath: "/ext/child-guard.ts",
	runToken: "token-1",
	lineage: fixtureLineage(),
	piBin: "/bin/pi",
	env: { PATH: "/usr/bin" },
	...extra,
});

const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];
const valuesOf = (args: string[], flag: string) =>
	args.flatMap((arg, index) => (arg === flag ? [args[index + 1]] : []));

describe("buildLaunch", () => {
	it("starts RPC mode with every ambient resource disabled", () => {
		const { args } = buildLaunch(input());
		for (const flag of [
			"--no-session",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-themes",
			"--no-approve",
		]) {
			expect(args, flag).toContain(flag);
		}
		expect(valueAfter(args, "--mode")).toBe("rpc");
	});

	it("passes persona by file path and keeps the task and persona text out of the arguments", () => {
		const { args } = buildLaunch(input({ persona: "SECRET PERSONA TEXT" }));
		expect(valueAfter(args, "--append-system-prompt")).toBe("/runs/r1/persona.md");
		expect(args.join(" ")).not.toContain("SECRET PERSONA TEXT");
	});

	it("uses the working directory, the child marker and the run token", () => {
		const plan = buildLaunch(input());
		expect(plan).toMatchObject({ command: "/bin/pi", cwd: "/work" });
		expect(plan.env).toMatchObject({ PATH: "/usr/bin", OMPSS_CHILD: "1", OMPSS_RUN_TOKEN: "token-1" });
	});

	it("opts managed children out of sibling maintenance without touching the parent environment", () => {
		const parent = { ...input().env, OMSS_DISABLE_WEB_AUTOSTART: "0" };
		const plan = buildLaunch({ ...input(), env: parent });
		// A mapped memory sibling must not become a web-app controller or history importer.
		expect(plan.env).toMatchObject({
			OMSS_DISABLE_WEB_AUTOSTART: "1",
			OMSS_DISABLE_AUTO_BACKFILL: "1",
		});
		// The parent's own environment stays untouched.
		expect(parent.OMSS_DISABLE_WEB_AUTOSTART).toBe("0");
		expect(process.env.OMSS_DISABLE_WEB_AUTOSTART).toBeUndefined();
	});
	it("selects exactly the approved tools, and none for an empty list", () => {
		expect(valueAfter(buildLaunch(input({ tools: ["read", "grep"] })).args, "--tools")).toBe("read,grep");
		const none = buildLaunch(input({ tools: [] })).args;
		expect(none).toContain("--no-tools");
		expect(none).not.toContain("--tools");
	});

	it("loads only the built-ins the approved tools need, then the guard", () => {
		expect(valuesOf(buildLaunch(input()).args, "-e")).toEqual(["/ext/child-guard.ts"]);
		expect(valuesOf(buildLaunch(input({ tools: ["read", "mcp__ctx__lookup"] })).args, "-e")).toEqual([
			"builtin:mcp",
			"/ext/child-guard.ts",
		]);
		expect(valuesOf(buildLaunch(input({ tools: ["tool_search", "mcp__ctx__lookup"] })).args, "-e")).toEqual([
			"builtin:mcp",
			"builtin:tool-search",
			"/ext/child-guard.ts",
		]);
		expect(valuesOf(buildLaunch(input({ tools: ["codemode"] })).args, "-e")).toEqual([
			"builtin:codemode",
			"/ext/child-guard.ts",
		]);
	});

	it("adds explicit skills and trusted extensions after the guard", () => {
		const { args } = buildLaunch(input({ skills: ["/s/one/SKILL.md"], extensions: ["/e/provider.ts"] }));
		expect(valuesOf(args, "--skill")).toEqual(["/s/one/SKILL.md"]);
		expect(valuesOf(args, "-e")).toEqual(["/ext/child-guard.ts", "/e/provider.ts"]);
	});

	it.each(["off", "minimal", "low", "medium", "high", "xhigh", "max"])(
		"inherits only the model and keeps explicit thinking %s",
		(thinking) => {
			const inherited = buildLaunch(input({ thinking }, { parentModel: "p/parent" })).args;
			expect([valueAfter(inherited, "--model"), valueAfter(inherited, "--thinking")]).toEqual(["p/parent", thinking]);
			const overridden = buildLaunch(input({ model: "p/own", thinking: "low" }, { parentModel: "p/parent" })).args;
			expect([valueAfter(overridden, "--model"), valueAfter(overridden, "--thinking")]).toEqual(["p/own", "low"]);
			expect(buildLaunch(input()).args).not.toContain("--model");
		},
	);
});

describe("spawnChild", () => {
	beforeEach(() => spawnSpy.mockClear());

	it("spawns with an argument array, no shell, its own process group and the plan's cwd", () => {
		const plan = buildLaunch(input());
		spawnChild(plan);
		expect(spawnSpy).toHaveBeenCalledWith(
			"/bin/pi",
			plan.args,
			expect.objectContaining({ cwd: "/work", shell: false, detached: true, stdio: ["pipe", "pipe", "pipe"] }),
		);
	});
});
