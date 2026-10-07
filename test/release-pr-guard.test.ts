import { describe, expect, it } from "vitest";
// @ts-expect-error The release guard is a standalone Node.js script.
import { releasePrProblems } from "../scripts/release-pr-guard.mjs";

const BOT = "om-pi-subagents-release[bot]";
const SHA = "c".repeat(40);

function releasePr() {
	return {
		pr: {
			user: { login: BOT, type: "Bot" },
			base: { ref: "main", repo: { full_name: "cmdaltctr/om-pi-subagents" } },
			head: { sha: SHA, repo: { full_name: "cmdaltctr/om-pi-subagents" } },
		},
		commits: [
			{
				sha: SHA,
				author: { login: BOT },
				committer: { login: "web-flow" },
				commit: { verification: { verified: true } },
			},
		],
		files: [
			{ filename: ".release-please-manifest.json", status: "modified", deletions: 1 },
			{ filename: "package.json", status: "modified", deletions: 1 },
			{ filename: "CHANGELOG.md", status: "modified", deletions: 0 },
		],
		contents: {
			base: {
				"package.json": JSON.stringify({ name: "om-pi-subagents", version: "0.5.0", scripts: {} }),
				".release-please-manifest.json": JSON.stringify({ ".": "0.5.0" }),
			} as Record<string, string>,
			head: {
				"package.json": JSON.stringify({ name: "om-pi-subagents", version: "0.6.0", scripts: {} }),
				".release-please-manifest.json": JSON.stringify({ ".": "0.6.0" }),
			} as Record<string, string>,
		},
		bot: BOT,
		testedSha: SHA,
	};
}

describe("release pull request guard", () => {
	it("accepts untouched signed release App output", () => {
		expect(releasePrProblems(releasePr())).toEqual([]);
	});

	it.each(["login", "type"])("rejects a spoofed PR author %s", (field) => {
		const input = releasePr();
		input.pr.user[field as "login" | "type"] = "contributor";
		expect(releasePrProblems(input)).toContainEqual(expect.stringContaining("author is"));
	});

	it.each(["author", "committer", "signature"])("rejects an untrusted commit %s", (field) => {
		const input = releasePr();
		if (field === "signature") input.commits[0].commit.verification.verified = false;
		else input.commits[0][field as "author" | "committer"].login = "contributor";
		expect(releasePrProblems(input).length).toBeGreaterThan(0);
	});

	it.each([0, 100])("rejects an incomplete commit listing of %i commits", (count) => {
		const input = releasePr();
		input.commits = Array.from({ length: count }, () => input.commits[0]);
		expect(releasePrProblems(input)).toContain("unexpected commit count");
	});

	it.each(["fork", "base", "head"])("rejects a changed %s", (field) => {
		const input = releasePr();
		if (field === "fork") input.pr.head.repo.full_name = "someone/om-pi-subagents";
		if (field === "base") input.pr.base.ref = "next";
		if (field === "head") input.pr.head.sha = "d".repeat(40);
		expect(releasePrProblems(input).length).toBeGreaterThan(0);
	});

	it.each(["src/index.ts", ".github/workflows/release.yml", "new.json"])("rejects unexpected file %s", (filename) => {
		const input = releasePr();
		input.files.push({ filename, status: "modified", deletions: 0 });
		expect(releasePrProblems(input)).toContain(`unexpected file ${filename}`);
	});

	it.each(["added", "removed", "renamed"])("rejects a release file with status %s", (status) => {
		const input = releasePr();
		input.files[1].status = status;
		expect(releasePrProblems(input)).toContain(`package.json is ${status}`);
	});

	it("rejects changelog deletions", () => {
		const input = releasePr();
		input.files[2].deletions = 1;
		expect(releasePrProblems(input)).toContain("CHANGELOG.md removes lines");
	});

	it("rejects a package change beyond the version", () => {
		const input = releasePr();
		const head = JSON.parse(input.contents.head["package.json"]);
		head.scripts.postinstall = "untrusted-command";
		input.contents.head["package.json"] = JSON.stringify(head);
		expect(releasePrProblems(input)).toContain("package.json changes more than the version");
	});

	it("rejects a new manifest key", () => {
		const input = releasePr();
		input.contents.head[".release-please-manifest.json"] = JSON.stringify({ ".": "0.6.0", extra: "0.6.0" });
		expect(releasePrProblems(input)).toContain(".release-please-manifest.json changes more than the version");
	});

	it("rejects a manifest without the root package version", () => {
		const input = releasePr();
		input.contents.head[".release-please-manifest.json"] = "{}";
		expect(releasePrProblems(input)).toContain(".release-please-manifest.json has version undefined");
	});

	it.each(["package.json", ".release-please-manifest.json"])("requires version file %s", (name) => {
		const input = releasePr();
		input.files = input.files.filter((file) => file.filename !== name);
		expect(releasePrProblems(input)).toContain(`missing version file ${name}`);
	});

	it.each(["missing", "invalid"])("rejects %s JSON", (kind) => {
		const input = releasePr();
		if (kind === "missing") delete input.contents.head["package.json"];
		else input.contents.head["package.json"] = "{";
		expect(releasePrProblems(input)).toContain("package.json cannot be read");
	});

	it("rejects disagreeing versions", () => {
		const input = releasePr();
		input.contents.head[".release-please-manifest.json"] = JSON.stringify({ ".": "0.6.1" });
		expect(releasePrProblems(input)).toContain("version files disagree");
	});

	it("rejects a non-release version", () => {
		const input = releasePr();
		input.contents.head[".release-please-manifest.json"] = JSON.stringify({ ".": "0.6.0-evil" });
		expect(releasePrProblems(input)).toContain(".release-please-manifest.json has version 0.6.0-evil");
	});
});
