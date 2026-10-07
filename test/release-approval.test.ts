import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { approvalFixture, STAGE, type ApprovalOptions } from "./fixtures/release-approval.ts";

const script =
	process.env.OMPS_APPROVAL_SCRIPT ?? fileURLToPath(new URL("../scripts/release-approve.sh", import.meta.url));
const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function fixture(options: ApprovalOptions = {}) {
	const fake = approvalFixture(options);
	folders.push(fake.folder);
	return { ...fake, run: (...args: string[]) => fake.run(script, ...args) };
}

describe("human-run release approval", () => {
	it("discovers the UUID, displays the stage, uses fresh reads and prints an update without running it", () => {
		const f = fixture({ visibleAfter: 2 });
		const result = f.run();
		expect(result.status, result.stderr).toBe(0);
		expect(f.calls()).toContain(`npm stage view ${STAGE}`);
		expect(f.calls()).toContain(`npm stage approve ${STAGE}`);
		const views = f.calls().filter((call) => call.startsWith("npm view "));
		expect(views).toHaveLength(3);
		expect(views.every((call) => call.endsWith(" version --prefer-online"))).toBe(true);
		expect(result.stdout).toContain("om-pi-subagents@4.5.0");
		expect(result.stdout).toContain("pi update npm:om-pi-subagents");
		expect(f.calls().some((call) => /^(pi|git|claude) |^gh (workflow|run) /.test(call))).toBe(false);
		expect(f.calls()[0]).toContain("--repo cmdaltctr/om-pi-subagents");
	});

	it("uses a supplied UUID without reading release notes", () => {
		const f = fixture({ bodyExit: 1 });
		const id = "11111111-2222-3333-4444-555555555555";
		expect(f.run(id).status).toBe(0);
		expect(f.calls()).toContain(`npm stage approve ${id}`);
		expect(f.calls().some((call) => call.includes("--json body"))).toBe(false);
	});

	it.each(["invalid", "--help", `${STAGE};touch nope`])(
		"rejects invalid explicit UUID %s before stage access",
		(id) => {
			const f = fixture();
			const result = f.run(id);
			expect(result.status).not.toBe(0);
			expect(result.stderr).toContain("npm stage list om-pi-subagents");
			expect(f.calls().some((call) => call.startsWith("npm stage "))).toBe(false);
		},
	);

	it("gives the explicit-ID fallback when notes contain only a placeholder", () => {
		const f = fixture({ body: "Run `npm stage approve <stage-id>`" });
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("npm stage list om-pi-subagents");
		expect(result.stderr).toContain("bun run release:approve");
		expect(f.calls().some((call) => call.startsWith("npm stage approve"))).toBe(false);
	});

	it.each(["v4.5.0-beta.1", "not-a-tag", "v01.5.0"])("rejects an invalid stable tag %s", (tag) => {
		const f = fixture({ tag });
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(/stable|version|tag/);
		expect(f.calls().some((call) => call.startsWith("npm stage "))).toBe(false);
	});

	it.each([
		[{ discoveryExit: 1 }, /gh auth|gh release/],
		[{ bodyExit: 1 }, /gh release|npm stage list/],
		[{ stageViewExit: 1 }, /npm stage view|npm login/],
	] as const)("stops on discovery or stage display failure %j", (options, guidance) => {
		const f = fixture(options);
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toMatch(guidance);
		expect(f.calls().some((call) => call.startsWith("npm stage approve"))).toBe(false);
	});

	it("stops when the release is already published", () => {
		const f = fixture({ latest: "4.5.0" });
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Nothing is waiting for approval");
		expect(f.calls().some((call) => call.startsWith("npm stage "))).toBe(false);
	});

	it("stops before polling after failed approval", () => {
		const f = fixture({ approveExit: 1 });
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("npm login");
		const approval = f.calls().findIndex((call) => call.startsWith("npm stage approve"));
		expect(approval).toBeGreaterThan(-1);
		expect(f.calls().slice(approval + 1)).toEqual([]);
		expect(result.stdout).not.toContain("pi update");
	});

	it("bounds polling and distinguishes visibility timeout from failed approval", () => {
		const f = fixture({ visibleAfter: 100 });
		const result = f.run();
		expect(result.status).not.toBe(0);
		expect(f.calls().filter((call) => call.startsWith("npm view "))).toHaveLength(31);
		expect(result.stderr).toMatch(/visibility|visible/);
		expect(result.stderr).toMatch(/before.*retry|before.*again/);
		expect(result.stdout).not.toContain("pi update");
	});
});
