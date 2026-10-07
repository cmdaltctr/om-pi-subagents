import { readFileSync, rmSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { approvalFixture, STAGE } from "./fixtures/release-approval.ts";
import { workflowFixture } from "./fixtures/release-workflow.ts";

const folders: string[] = [];
afterEach(() => {
	for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});
function fixture(output?: string, publishExit?: number) {
	const workflow = process.env.OMPS_RELEASE_WORKFLOW
		? readFileSync(process.env.OMPS_RELEASE_WORKFLOW, "utf8")
		: undefined;
	const f = workflowFixture({ output, publishExit, workflow });
	folders.push(f.folder);
	return f;
}

describe("executable release workflow", () => {
	it("captures the stage UUID and hands the exact approval command to the helper", () => {
		const f = fixture();
		expect(f.runStage().status).toBe(0);
		expect(f.stage.id).toBe("stage");
		expect(f.outputs()).toContain("staged=true\n");
		expect(f.outputs()).toContain(`stage_id=${STAGE}`);
		const id = /^stage_id=(.*)$/m.exec(f.outputs())![1];
		expect(f.note.env?.STAGE_ID).toBe("${{ steps.stage.outputs.stage_id }}");
		expect(f.runNote(id).status).toBe(0);
		expect(f.body()).toContain(`npm stage approve ${STAGE}`);
		expect(f.body()).toContain("bun run release:approve");
		expect(f.body()).toContain("Original release notes");
		const approve = approvalFixture({ body: f.body() });
		folders.push(approve.folder);
		const script = new URL("../scripts/release-approve.sh", import.meta.url).pathname;
		expect(approve.run(script).status).toBe(0);
		expect(approve.calls()).toContain(`npm stage approve ${STAGE}`);
	});

	it("retains manual list and explicit-ID guidance when npm reports no UUID", () => {
		const f = fixture("Staged, but output format changed\n");
		expect(f.runStage().status).toBe(0);
		expect(f.outputs()).toContain("staged=true\n");
		expect(f.outputs()).toContain("stage_id=\n");
		expect(f.runNote("").status).toBe(0);
		expect(f.body()).toContain("npm stage list om-pi-subagents");
		expect(f.body()).toContain("bun run release:approve <stage-uuid>");
		expect(f.body()).not.toMatch(/npm stage approve [0-9a-f]{8}-/i);
	});

	it("fails a publish despite successful tee and emits no stage output", () => {
		const f = fixture("npm failed\n", 1);
		expect(f.stage.run).toContain("tee");
		expect(f.runStage().status).not.toBe(0);
		expect(f.outputs()).toBe("");
	});
});
