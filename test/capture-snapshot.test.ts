import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshotCapture } from "./fixtures/capture-snapshot.mjs";

const created: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const directory of created.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("disposable snapshot capture", () => {
	it("records the focused modal in regular mode rather than the underlying editor", async () => {
		const destination = await mkdtemp(join(tmpdir(), "omps-capture-check-"));
		created.push(destination);
		vi.stubEnv("OMPS_CAPTURE_DIR", destination);
		const capture = createSnapshotCapture({
			ui: {
				renderNow: () => undefined,
				render: () => ["Underlying editor"],
				getFocusedComponent: () => ({ render: () => ["\u001b[36mOMPS inspector\u001b[0m", "Selected child"] }),
			},
			terminal: { columns: 45, rows: 20 },
			directory: join(destination, "session"),
			version: "fixture",
			mode: "regular",
			theme: "light",
		});
		await capture("narrow-detail");
		const file = join(destination, "fixture-regular-light-narrow-detail.txt");
		const text = await readFile(file, "utf8");
		expect(text).toContain("OMPS inspector");
		expect(text).toContain("Selected child");
		expect(text).not.toContain("Underlying editor");
		expect(text).not.toContain("\u001b");
		expect((await stat(file)).mode & 0o777).toBe(0o600);
	});

	it("removes wrapped saved-output path fragments while keeping narrow detail text", async () => {
		const destination = await mkdtemp(join(tmpdir(), "omps-capture-check-"));
		created.push(destination);
		vi.stubEnv("OMPS_CAPTURE_DIR", destination);
		const capture = createSnapshotCapture({
			ui: {
				renderNow: () => undefined,
				getFocusedComponent: () => ({
					render: () => [
						"OMPS inspector",
						"Task:",
						"Selected task child-19",
						"Saved output:",
						"/private/var/folders/synthetic-run/output",
						"n/T/omps-native-viewer-private/child/output.md",
						"Escape back · PageUp/PageDown output",
					],
				}),
			},
			terminal: { columns: 45, rows: 20 },
			directory: "/private/var/folders/synthetic-run",
			version: "fixture",
			mode: "regular",
			theme: "dark",
		});
		await capture("narrow-detail");
		const text = await readFile(join(destination, "fixture-regular-dark-narrow-detail.txt"), "utf8");
		expect(text).toContain("Selected task child-19");
		expect(text).toContain("Saved output: <disposable>");
		expect(text).not.toContain("omps-native-viewer-private");
		expect(text).not.toContain("synthetic-run");
		expect(text).toContain("Escape back");
	});

	it.each([
		[45, "wide-detail"],
		[120, "wide-detail"],
		[45, "narrow-answer-bottom"],
		[120, "answer-bottom"],
	] as const)(
		"keeps single-column footer controls after a wrapped path at %i columns in %s",
		async (columns, stage) => {
			const destination = await mkdtemp(join(tmpdir(), "omps-capture-check-"));
			created.push(destination);
			vi.stubEnv("OMPS_CAPTURE_DIR", destination);
			const footer = "↑↓ scroll · PgUp/PgDn page · ←→ agent · Esc back · Lines 1–16/48";
			const capture = createSnapshotCapture({
				ui: { renderNow: () => undefined, getFocusedComponent: () => null },
				terminal: { columns, rows: 20 },
				directory: "/private/var/folders/synthetic-run",
				version: "fixture",
				mode: "fullscreen",
				theme: "dark",
			});
			await capture(stage, [
				"Saved output: /private/var/folders/synthetic-run",
				"wrapped-private-fragment/output.md",
				footer,
			]);
			const text = await readFile(join(destination, `fixture-fullscreen-dark-${stage}.txt`), "utf8");
			expect(text).toContain(footer);
			expect(text).not.toContain("wrapped-private-fragment");
		},
	);

	it("redacts disposable paths and accepts fleet lines without opening a terminal", async () => {
		const destination = await mkdtemp(join(tmpdir(), "omps-capture-check-"));
		created.push(destination);
		vi.stubEnv("OMPS_CAPTURE_DIR", destination);
		const capture = createSnapshotCapture({
			ui: { renderNow: () => undefined, getFocusedComponent: () => null },
			terminal: { columns: 45, rows: 6 },
			directory: "/private/var/folders/synthetic-run",
			version: "fixture",
			mode: "fullscreen",
			theme: "dark",
		});
		await capture("fleet-narrow", ["Agents: 5 active", "Saved output: /private/var/folders/synthetic-run/output.md"]);
		const text = await readFile(join(destination, "fixture-fullscreen-dark-fleet-narrow.txt"), "utf8");
		expect(text).toContain("Agents: 5 active");
		expect(text).toContain("<disposable>");
		expect(text).not.toContain("/private/var/folders");
	});
});
