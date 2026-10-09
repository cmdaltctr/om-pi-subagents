import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { registerOmps } from "../src/index.ts";

const ROOT = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const pkg = JSON.parse(read("package.json"));
const steps = ["format:check", "lint", "typecheck", "test"];

// Restrict the privacy check to project files, including files not yet committed.
function projectFiles(directory = ROOT): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		if ([".git", "node_modules", ".pi-host", "graphify-out", "coverage", "_"].includes(entry.name)) return [];
		const path = join(directory, entry.name);
		if (path === join(ROOT, "docs/local-docs")) return [];
		return entry.isDirectory() ? projectFiles(path) : [path];
	});
}

describe("tooling agrees with the documentation", () => {
	it("publishes installation, usage and uninstall guides", () => {
		for (const name of ["INSTALL", "SETUP", "USAGE", "UNINSTALL"]) {
			expect(read("README.md")).toContain(`(docs/${name}.md)`);
			expect(existsSync(join(ROOT, `docs/${name}.md`))).toBe(true);
		}
		expect(read("docs/INSTALL.md")).toContain("bun install --production");
		expect(read("docs/INSTALL.md")).toContain("pi install npm:om-pi-subagents");
		expect(read("README.md")).toContain("pi install npm:om-pi-subagents");
		expect(read("docs/INSTALL.md")).toContain("No personas mapped.");
		expect(read("docs/USAGE.md")).toContain("/omps run reader Summarise the README");
		expect(read("docs/UNINSTALL.md")).toContain("~/.pi/agent/omps/runs/");
	});

	it("shows a packaged, self-contained SVG logo without executable content", () => {
		const path = "docs/assets/om-pi-subagents-logo.svg";
		expect(read("README.md")).toContain(`src="${path}"`);
		const image = read(path);
		expect(image).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
		expect(image).not.toMatch(/<script\b|<foreignObject\b|\b(?:href|src)\s*=|url\(|onload\s*=/i);
		expect(Buffer.byteLength(image)).toBeLessThan(32 * 1024);
		expect(pkg.files).toContain(path);
	});

	it("uses real tool actions and fields in the usage examples", () => {
		let properties: Record<string, { enum?: string[] }> = {};
		registerOmps(
			{
				registerTool: (tool: { parameters: { properties: typeof properties } }) => {
					properties = tool.parameters.properties;
				},
				registerCommand: () => {},
				registerEntryRenderer: () => {},
			} as never,
			() => {
				throw new Error("Documentation examples must not launch a run");
			},
		);
		const examples = [...read("docs/USAGE.md").matchAll(/```json\n([\s\S]*?)```/g)].map((match) =>
			JSON.parse(match[1]),
		);
		expect(examples).toHaveLength(4);
		for (const example of examples) {
			expect(properties.action.enum).toContain(example.action);
			for (const field of Object.keys(example)) expect(properties).toHaveProperty(field);
		}
	});

	it("documents default-off per-agent capability edits and ownership using existing YAML lists", () => {
		for (const path of ["docs/SETUP.md", "docs/USAGE.md"]) {
			const text = read(path);
			expect(text, path).toContain("Agent capabilities");
			expect(text, path).toMatch(/Off|off/);
			expect(text, path).toContain("Partial");
			expect(text, path).toContain("/omps-settings");
		}
		const usage = read("docs/USAGE.md");
		const example = usage.match(/```yaml\n(agents:\n  researcher:[\s\S]*?)```/)?.[1];
		expect(example).toBeDefined();
		const agent = parse(example!).agents.researcher;
		expect(agent.tools).toEqual(["read", "memory"]);
		expect(agent.extensions).toHaveLength(1);
		expect(agent.skills).toHaveLength(1);
		expect(Object.keys(agent).sort()).toEqual(["extensions", "persona", "skills", "thinking", "tools"]);
		expect(usage).toMatch(/whole.*tool|whole.*modes/i);
		expect(usage).toMatch(/parent.*checks.*saved output/i);
		expect(read("docs/SETUP.md")).toContain("Disable");
	});

	it("leaves the Release Please changelog out of format checks", () => {
		// Release Please writes its own layout, which oxfmt rejects. CHANGELOG.md must not be edited by hand.
		expect(JSON.parse(read(".oxfmtrc.json")).ignorePatterns).toContain("CHANGELOG.md");
	});

	it("keeps verification and suppression reports local and ignored", () => {
		expect(read(".gitignore")).toContain("docs/local-docs/");
		expect(JSON.parse(read(".oxfmtrc.json")).ignorePatterns).toContain("docs/local-docs/**");
		const tracked = execFileSync("git", ["ls-files", "docs"], { cwd: ROOT, encoding: "utf8" });
		expect(tracked).not.toMatch(/local-docs\/|VERIFICATION\.md|TEST-SECURITY-SUPPRESSIONS\.md/i);
		for (const match of read("README.md").matchAll(/\]\(([^)]+)\)/g))
			expect(match[1]).not.toMatch(/local-docs\/|VERIFICATION\.md|TEST-SECURITY-SUPPRESSIONS\.md/i);
	});

	it("documents every script with its exact command", () => {
		expect(read("docs/MAINTAINING.md")).toContain("! bun run release:approve");
		expect(read("docs/MAINTAINING.md")).toContain("bun run release:approve <stage-uuid>");
		expect(read("docs/MAINTAINING.md")).toContain("npm 11.15 or newer");
		expect(read("docs/MAINTAINING.md")).toContain("pi update npm:om-pi-subagents");
		expect(pkg.scripts["release:approve"]).toBe("./scripts/release-approve.sh");
		for (const name of Object.keys(pkg.scripts))
			expect(read("docs/MAINTAINING.md"), name).toContain(`\`bun run ${name}\``);
		expect(pkg.scripts.ci.split(" && ")).toEqual(steps.map((step) => `bun run ${step}`));
		expect(pkg.scripts.lint).toBe("oxlint --deny-warnings");
		expect(pkg.scripts.prepare).toBe("husky || true");
	});

	it("declares Vitest's Vite peer directly when automatic peers are disabled", () => {
		expect(pkg.devDependencies.vite).toBe("8.3.1");
	});

	it("pins the OpenSpec CLI used by the real todo compatibility tests", () => {
		expect(pkg.devDependencies["@fission-ai/openspec"]).toBe("1.14.0");
		expect(pkg.dependencies).not.toHaveProperty("@fission-ai/openspec");
		expect(execFileSync(join(ROOT, "node_modules/.bin/openspec"), ["--version"], { encoding: "utf8" }).trim()).toBe(
			"1.14.0",
		);
	});

	it("documents the accepted development-only advisory and keeps production audits unfiltered", () => {
		expect(pkg.scripts.audit).toBe("bun audit --prod && bun audit --ignore GHSA-vfj7-8cjw-p6xm");
		const warning = read("docs/MAINTAINING.md").match(/^> \[!CAUTION\]\n(?:>.*\n)+/m)?.[0];
		expect(warning).toContain("braces@3.0.3");
		expect(warning).toContain("GHSA-vfj7-8cjw-p6xm");
		expect(warning).toContain("No patched release exists");
		expect(warning).toContain("crash the OpenSpec CLI");
		expect(warning).toContain("development dependency");
	});

	it("borrows pinned host packages without installing private peers", () => {
		expect(read("bunfig.toml")).toMatch(/^peer = false$/m);
		for (const name of Object.keys(pkg.peerDependencies)) expect(pkg.dependencies).not.toHaveProperty(name);
		const setup = read("scripts/setup-host.sh");
		expect(setup).toContain('PI_HOST_VERSION="${PI_HOST_VERSION:-0.99.1}"');
		expect(setup).toContain('TYPEBOX_VERSION="${TYPEBOX_VERSION:-1.3.27}"');
		expect(setup).toContain("bun add");
		expect(read(".gitignore")).toContain(".pi-host/");
		expect(read("vitest.config.ts")).toContain("import.meta.dirname");
		const config = JSON.parse(read("tsconfig.json"));
		for (const paths of Object.values(config.compilerOptions.paths)) {
			for (const path of paths as string[]) expect(path).toMatch(/^\.\/\.pi-host\/node_modules\//);
		}
	});

	it("checks a committed clean clone with Husky disabled", () => {
		expect(pkg.scripts["ci:clean"]).toBe("./scripts/ci-clean.sh");
		const clean = read("scripts/ci-clean.sh");
		for (const command of ["git clone", "export HUSKY=0", "bun install --frozen-lockfile", "bun run ci"])
			expect(clean).toContain(command);
		expect(clean).toContain('export OMPS_PI_BIN="$PWD/.pi-host/node_modules/.bin/pi"');
		const hook = read(".husky/pre-push");
		expect(hook.indexOf("./scripts/setup-host.sh")).toBeLessThan(hook.indexOf("bun run ci:clean"));
		for (const path of ["scripts/setup-host.sh", "scripts/ci-clean.sh", ".husky/pre-push"])
			expect(() => accessSync(join(ROOT, path), constants.X_OK), path).not.toThrow();
	});

	it("runs the same ordered checks in GitHub Actions", () => {
		const workflow = parse(read(".github/workflows/ci.yml"));
		expect(workflow.permissions).toEqual({ contents: "read" });
		expect(workflow.concurrency["cancel-in-progress"]).toBe(true);
		expect(workflow.env.HUSKY).toBe("0");
		expect(Object.keys(workflow.jobs)).toEqual(["check", "audit"]);
		for (const job of Object.values(workflow.jobs) as Array<{ steps: any[]; "timeout-minutes": number }>) {
			expect(job["timeout-minutes"]).toBeGreaterThan(0);
			for (const step of job.steps.filter((candidate) => candidate.uses)) {
				expect(step.uses).toMatch(/@[0-9a-f]{40}$/);
				if (step.uses.startsWith("actions/checkout@")) expect(step.with["persist-credentials"]).toBe(false);
			}
		}
		const commands = workflow.jobs.check.steps.map((step: { run?: string }) => step.run).filter(Boolean);
		expect(commands).toEqual([
			"bun install --frozen-lockfile",
			"bun run setup:host",
			...steps.map((step) => `bun run ${step}`),
		]);
		expect(workflow.jobs.check.env.OMPS_PI_BIN).toBe("${{ github.workspace }}/.pi-host/node_modules/.bin/pi");
		expect(workflow.jobs.audit.steps.at(-1).run).toBe("bun run audit");
	});

	it("links to real local documents", () => {
		for (const match of read("README.md").matchAll(/\]\(([\w./-]+\.md)\)/g))
			expect(existsSync(join(ROOT, match[1])), match[1]).toBe(true);
	});

	it("holds no personal home paths", () => {
		for (const file of projectFiles())
			expect(readFileSync(file, "utf8"), file).not.toMatch(/\/Users\/|\/home\/[a-z]+\//);
	});
});
