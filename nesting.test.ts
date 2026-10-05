import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistryStore } from "./config.ts";
import { parseChildPolicy } from "./protocol.ts";
import { buildLaunch } from "./runner.ts";
import { RunManager, type Supervisor } from "./runs.ts";
import { createService } from "./service.ts";

const lineage = {
	registryPath: "/operator/om-pi-subagents.yaml",
	depth: 1,
	maxDepth: 3,
	rootSessionId: "root",
	runId: "child",
};
const policy = { tools: ["ompss"], startupDeadlineMs: 1000, lineage };
const agent = {
	name: "reader",
	personaPath: "/personas/reader.md",
	persona: "Read.",
	tools: ["read"],
	thinking: "off",
	skills: [],
	extensions: [],
};
const launch = {
	snapshot: agent,
	cwd: "/work",
	personaFile: "/runs/persona.md",
	guardPath: "/ext/child-guard.ts",
	runToken: "token",
	piBin: "/bin/pi",
	lineage,
};

describe("validated child lineage", () => {
	it("accepts a child and a grandchild with safe lineage and depth ceilings", () => {
		expect(parseChildPolicy(policy)).toEqual(policy);
		expect(
			parseChildPolicy({ ...policy, lineage: { ...lineage, depth: 2, parentRunId: "child", runId: "grandchild" } }),
		).toMatchObject({ lineage: { depth: 2 } });
	});

	it.each([
		undefined,
		{ ...lineage, depth: 0 },
		{ ...lineage, depth: "1" },
		{ ...lineage, depth: 1.5 },
		{ ...lineage, depth: 4 },
		{ ...lineage, maxDepth: Number.MAX_SAFE_INTEGER + 1 },
		{ ...lineage, depth: 2 },
		{ ...lineage, depth: 1, parentRunId: "parent" },
		{ ...lineage, runId: "../escape" },
		{ ...lineage, rootSessionId: "" },
		{ ...lineage, registryPath: "relative.yaml" },
	])("rejects missing, malformed or inconsistent metadata %j", (value) => {
		expect(parseChildPolicy({ ...policy, lineage: value })).toMatch(/lineage/);
	});

	it.each([
		{ ...policy, tools: [1] },
		{ ...policy, startupDeadlineMs: -1 },
		{ ...policy, model: false },
	])("rejects malformed child policy %j", (value) => {
		expect(typeof parseChildPolicy(value)).toBe("string");
	});
});

describe("isolated nested launcher", () => {
	it("carries canonical registry selection and validated lineage into every child", () => {
		const plan = buildLaunch({
			...launch,
			env: { OMPSS_REGISTRY: "/wrong/registry.yaml", PI_CODING_AGENT_DIR: "/isolated/agent" },
		});
		expect(plan.env.OMPSS_REGISTRY).toBe(lineage.registryPath);
		expect(plan.env.PI_CODING_AGENT_DIR).toBe("/isolated/agent");
		expect(JSON.parse(plan.env.OMPSS_POLICY!).lineage).toEqual(lineage);
	});

	it("loads a managed entry only for exact ompss approval, including at maximum depth", () => {
		const delegated = buildLaunch({
			...launch,
			snapshot: { ...agent, tools: ["ompss"] },
			lineage: { ...lineage, maxDepth: 1 },
		});
		expect(delegated.args).toContain(new URL("./managed-child.ts", import.meta.url).pathname);
		expect(buildLaunch(launch).args).not.toContain(new URL("./managed-child.ts", import.meta.url).pathname);
		for (const flag of ["--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes"])
			expect(delegated.args).toContain(flag);
	});

	it("inherits the immediate parent's model and preserves target-specific thinking", () => {
		const plan = buildLaunch({ ...launch, parentModel: "fake/immediate", snapshot: { ...agent, thinking: "low" } });
		expect(JSON.parse(plan.env.OMPSS_POLICY!).model).toBe("fake/immediate");
		expect(plan.args[plan.args.indexOf("--thinking") + 1]).toBe("low");
	});
});

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "ompss-depth-"));
	await mkdir(join(dir, "personas"));
	await writeFile(join(dir, "personas", "reader.md"), "Read.");
});
afterEach(() => rm(dir, { recursive: true, force: true }));
async function service(maxDepth: number, branch?: typeof lineage) {
	await writeFile(
		join(dir, "om-pi-subagents.yaml"),
		`version: 1\nlimits:\n  maxConcurrentRuns: 4\n  maxDepth: ${maxDepth}\nagents:\n  reader:\n    persona: ./personas/reader.md\n    tools: [write]\n    thinking: off\n`,
	);
	const requests: Parameters<Supervisor>[1][] = [];
	const supervisor = vi.fn<Supervisor>((_view, request) => {
		requests.push(request);
		return new Promise(() => {});
	});
	const manager = new RunManager(supervisor);
	return {
		requests,
		supervisor,
		manager,
		service: createService({
			registry: createRegistryStore(join(dir, "om-pi-subagents.yaml")),
			manager,
			branch,
			directoryFor: () => dir,
		}),
	};
}

describe("depth admission", () => {
	const input = { agent: "reader", task: "Read the task" };
	it("counts root as zero, launches at one and captures the selected registry", async () => {
		const setup = await service(3);
		await setup.service.run("root", input, { cwd: dir, model: "fake/root" });
		expect(setup.requests[0].nesting).toEqual({
			registryPath: await realpath(join(dir, "om-pi-subagents.yaml")),
			depth: 1,
			maxDepth: 3,
			rootSessionId: "root",
		});
		expect(setup.manager.list("root")[0].nesting).toEqual(setup.requests[0].nesting);
	});

	it("allows listings and status at depth zero but launches nothing", async () => {
		const setup = await service(0);
		expect(await setup.service.list()).toContain("reader");
		expect(setup.service.status("root")).toBe("No runs in this session.");
		await expect(setup.service.run("root", input, { cwd: dir })).rejects.toThrow(
			/current depth 0.*attempted depth 1.*maxDepth.*0/,
		);
		expect(setup.supervisor).not.toHaveBeenCalled();
	});

	it("increments exactly once and keeps the immediate parent run", async () => {
		const setup = await service(5, { ...lineage, maxDepth: 4 });
		await setup.service.run("child-session", input, { cwd: dir, model: "fake/child" });
		expect(setup.requests[0]).toMatchObject({
			nesting: { depth: 2, maxDepth: 4, rootSessionId: "root", parentRunId: "child" },
			parent: { model: "fake/child" },
			agent: { tools: ["write"] },
		});
	});

	it.each([
		[3, 1],
		[1, 3],
	])("uses the smaller fresh %i and inherited %i ceilings", async (fresh, inherited) => {
		const setup = await service(fresh, { ...lineage, maxDepth: inherited });
		await expect(setup.service.run("child-session", input, { cwd: dir })).rejects.toThrow(
			/current depth 1.*attempted depth 2.*maxDepth.*1/,
		);
		expect(setup.supervisor).not.toHaveBeenCalled();
	});
});
