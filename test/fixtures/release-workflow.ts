import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { parse } from "yaml";
import { STAGE } from "./release-approval.ts";

/** Execute only the workflow's publish/note shell blocks through local command doubles. */
export function workflowFixture(options: { output?: string; publishExit?: number; workflow?: string } = {}) {
	const workflow = parse(
		options.workflow ?? readFileSync(new URL("../../.github/workflows/release.yml", import.meta.url), "utf8"),
	);
	const steps = workflow.jobs.publish.steps as Array<{
		name?: string;
		id?: string;
		run?: string;
		env?: Record<string, string>;
	}>;
	const stage = steps.find((step) => step.name === "Stage on npm")!;
	const note = steps.find((step) => step.name === "Add the approval steps to the GitHub release")!;
	const folder = mkdtempSync(join(tmpdir(), "omps-workflow-stage-"));
	const bin = join(folder, "bin");
	mkdirSync(bin);
	writeFileSync(join(folder, "stage-output"), options.output ?? `om-pi-subagents@4.5.0 staged with id ${STAGE}\n`);
	writeFileSync(join(folder, "outputs"), "");
	writeFileSync(
		join(bin, "npm"),
		`#!/bin/bash
printf '%s\\n' "npm $*" >> "$CALLS"
[ "$*" = 'stage publish --access public' ] || exit 97
cat "$STAGE_OUTPUT"
exit ${options.publishExit ?? 0}
`,
		{ mode: 0o755 },
	);
	writeFileSync(
		join(bin, "gh"),
		`#!/bin/bash
printf '%s\\n' "gh $*" >> "$CALLS"
case "$1 $2" in
  'release view') printf '%s\\n' 'Original release notes' ;;
  'release edit') for last in "$@"; do :; done; cp "$last" "$NOTE_CAPTURE" ;;
  *) exit 97 ;;
esac
`,
		{ mode: 0o755 },
	);
	const env = {
		...process.env,
		PATH: `${bin}${delimiter}${process.env.PATH}`,
		GITHUB_OUTPUT: join(folder, "outputs"),
		GITHUB_REPOSITORY: "cmdaltctr/om-pi-subagents",
		RUNNER_TEMP: folder,
		TAG_NAME: "v4.5.0",
		RELEASE_VERSION: "4.5.0",
		CALLS: join(folder, "calls"),
		STAGE_OUTPUT: join(folder, "stage-output"),
		NOTE_CAPTURE: join(folder, "notes-captured.md"),
	};
	return {
		folder,
		stage,
		note,
		runStage: () => spawnSync("bash", ["-c", stage.run!], { cwd: folder, env, encoding: "utf8" }),
		outputs: () => readFileSync(env.GITHUB_OUTPUT, "utf8"),
		runNote: (id: string) =>
			spawnSync("bash", ["-c", note.run!], { cwd: folder, env: { ...env, STAGE_ID: id }, encoding: "utf8" }),
		body: () => readFileSync(env.NOTE_CAPTURE, "utf8"),
	};
}
