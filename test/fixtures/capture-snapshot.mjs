import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

/** Capture the focused component, not the editor underneath a regular-mode overlay. */
export function createSnapshotCapture({ ui, terminal, directory, version, mode, theme }) {
	return async (stage, suppliedLines) => {
		const destination = process.env.OMPS_CAPTURE_DIR;
		if (!destination) return;
		if (!/^[a-z-]+$/.test(stage)) throw new Error("Snapshot stage must use lowercase words and hyphens.");
		ui.renderNow();
		const lines = suppliedLines ?? ui.getFocusedComponent()?.render(terminal.columns);
		if (!lines?.length) throw new Error(`No focused content to capture for ${stage}.`);
		const canonical = await realpath(directory).catch(() => directory);
		let afterSavedPath = false;
		const visible = lines.map((line) => {
			const text = stripVTControlCharacters(line);
			if (!stage.endsWith("detail")) return text;
			if (text.includes("Saved output:")) {
				afterSavedPath = true;
				return text.replace(/Saved output:.*/, "Saved output: <disposable>");
			}
			if (!afterSavedPath || /Escape back|Arrows select/.test(text)) return text;
			// In the wide modal, retain the tree pane while hiding wrapped output-path fragments.
			return terminal.columns < 80 ? "" : text.slice(0, Math.floor(terminal.columns * 0.4) + 1).trimEnd();
		});
		const safe = visible
			.join("\n")
			.replaceAll(directory, "<disposable>")
			.replaceAll(canonical, "<disposable>")
			.replace(/\/(?:private\/)?var\/folders\/[^\s]+|\/(?:Users|home)\/[^\s]+/g, "<disposable>");
		await mkdir(destination, { recursive: true, mode: 0o700 });
		await writeFile(join(destination, `${version}-${mode}-${theme}-${stage}.txt`), safe, { mode: 0o600 });
	};
}
