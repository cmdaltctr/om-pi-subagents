import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const root = resolve(import.meta.dirname, "..");
const read = (name: string) => readFileSync(resolve(root, name), "utf8");

describe("release auto-merge workflow", () => {
	it("waits for successful same-repository release PR CI", () => {
		const workflow = parse(read(".github/workflows/release-auto-merge.yml"));
		expect(workflow.on).toEqual({ workflow_run: { workflows: ["CI"], types: ["completed"] } });
		const gate = workflow.jobs.merge.if;
		for (const check of [
			"vars.RELEASE_PLEASE_ENABLED == 'true'",
			"github.event.workflow_run.conclusion == 'success'",
			"github.event.workflow_run.event == 'pull_request'",
			"github.event.workflow_run.head_repository.full_name == github.repository",
			"startsWith(github.event.workflow_run.head_branch, 'release-please--')",
		])
			expect(gate).toContain(check);
	});

	it("runs the guard from main with pinned actions and an App token", () => {
		const workflow = parse(read(".github/workflows/release-auto-merge.yml"));
		expect(workflow.permissions).toEqual({});
		expect(workflow.jobs.merge.permissions).toEqual({ contents: "read" });
		expect(workflow.jobs.merge.env.RELEASE_BOT).toBe("om-pi-subagents-release[bot]");
		const steps = workflow.jobs.merge.steps;
		for (const step of steps.filter((entry: { uses?: string }) => entry.uses)) {
			expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
		}
		expect(steps[0].with.ref).toBe("main");
		expect(steps[0].with["persist-credentials"]).toBe(false);
		expect(steps[0].with["sparse-checkout"]).toBe("scripts/release-pr-guard.mjs");
		expect(steps[1].with["client-id"]).toBe("${{ secrets.RELEASE_APP_ID }}");
		expect(steps[1].with["private-key"]).toBe("${{ secrets.RELEASE_APP_PRIVATE_KEY }}");
		const guard = steps.findIndex((step: { run?: string }) => step.run?.includes("node scripts/release-pr-guard.mjs"));
		const merge = steps.findIndex((step: { run?: string }) => step.run?.includes("gh pr merge"));
		expect(guard).toBeGreaterThan(-1);
		expect(merge).toBeGreaterThan(guard);
		expect(steps[merge].env.GH_TOKEN).toBe("${{ steps.app-token.outputs.token }}");
		expect(steps[merge].run).toContain("--squash");
		expect(steps[merge].run).toContain('--match-head-commit "$HEAD_SHA"');
	});

	it("notifies the maintainer after staging and reports failures before staging", () => {
		const workflow = parse(read(".github/workflows/release.yml"));
		const publish = workflow.jobs.publish;
		expect(publish.outputs.staged).toBe("${{ steps.stage.outputs.staged }}");
		expect(publish.permissions["pull-requests"]).toBe("write");
		const stage = publish.steps.find((step: { id?: string }) => step.id === "stage");
		expect(stage.run.indexOf("staged=true")).toBeGreaterThan(stage.run.indexOf("npm stage publish"));
		const notice = publish.steps.find((step: { name: string }) => step.name === "Tell the maintainer to approve");
		expect(notice.run).toContain("@$OWNER");
		expect(notice.run).toContain("bun run release:approve");
		expect(notice.run).toContain("gh pr comment");
		expect(workflow.jobs["report-failure"].needs).toEqual(["release-please", "publish"]);
		expect(workflow.jobs["report-failure"].if).toContain("always()");
		expect(workflow.jobs["report-failure"].if).toContain("needs.publish.outputs.staged != 'true'");
		expect(workflow.jobs["report-failure"].steps[0].run).toContain("was not published to npm");
	});
});
