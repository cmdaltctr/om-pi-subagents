// Adapted from OMMS's fake-PATH approval fixture. Every release operation stays local.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

export const STAGE = "2e27b81a-5edd-4ea8-b586-989b9d6c2480";
export interface ApprovalOptions {
	tag?: string;
	latest?: string;
	body?: string;
	discoveryExit?: number;
	bodyExit?: number;
	stageViewExit?: number;
	approveExit?: number;
	visibleAfter?: number;
	pollSeconds?: string;
}

/** Provide fake npm/gh and command traps; the caller owns the disposable folder. */
export function approvalFixture(options: ApprovalOptions = {}) {
	const folder = mkdtempSync(join(tmpdir(), "omps-release-approve-"));
	const bin = join(folder, "bin");
	mkdirSync(bin);
	const state = (name: string) => join(folder, name);
	writeFileSync(state("tag"), options.tag ?? "v4.5.0");
	writeFileSync(state("latest"), options.latest ?? "4.4.2");
	writeFileSync(state("body"), options.body ?? `Approve with \x60npm stage approve ${STAGE}\x60 (2FA).`);
	const tool = (name: string, body: string) =>
		writeFileSync(join(bin, name), `#!/bin/bash\nprintf '%s\\n' "${name} $*" >> "${state("calls")}"\n${body}\n`, {
			mode: 0o755,
		});
	tool(
		"gh",
		`case "$*" in
  *tagName*) [ ${options.discoveryExit ?? 0} = 0 ] || exit ${options.discoveryExit ?? 0}; cat "${state("tag")}" ;;
  *body*) [ ${options.bodyExit ?? 0} = 0 ] || exit ${options.bodyExit ?? 0}; cat "${state("body")}" ;;
  *) exit 97 ;;
esac`,
	);
	tool(
		"npm",
		`case "$1 $2" in
  "stage view") exit ${options.stageViewExit ?? 0} ;;
  "stage approve") [ ${options.approveExit ?? 0} = 0 ] || exit ${options.approveExit ?? 0}; touch "${state("approved")}" ;;
  "view om-pi-subagents")
    case " $* " in
      *" --prefer-online "*)
        if [ -f "${state("approved")}" ]; then
          count=0; [ ! -f "${state("count")}" ] || count=$(cat "${state("count")}")
          count=$((count + 1)); echo "$count" > "${state("count")}"
          if [ "$count" -ge ${options.visibleAfter ?? 1} ]; then echo 4.5.0; exit 0; fi
        fi
        cat "${state("latest")}" ;;
      *) echo 4.4.2 ;;
    esac ;;
  *) exit 97 ;;
esac`,
	);
	for (const name of ["pi", "git", "claude"]) tool(name, "exit 97");
	tool("sleep", "exit 0");
	const env = {
		...process.env,
		PATH: `${bin}${delimiter}${process.env.PATH}`,
		OMPS_RELEASE_POLL_SECONDS: options.pollSeconds ?? "0",
	};
	return {
		folder,
		env,
		state,
		run: (script: string, ...args: string[]) =>
			spawnSync("bash", [script, ...args], { env, cwd: folder, encoding: "utf8", timeout: 10_000 }),
		calls: () => (existsSync(state("calls")) ? readFileSync(state("calls"), "utf8").trim().split("\n") : []),
	};
}
