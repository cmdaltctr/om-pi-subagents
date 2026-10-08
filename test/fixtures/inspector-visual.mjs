import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

const escapeHtml = (text) =>
	text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const ansiColours = [
	"#111",
	"#a22",
	"#2a2",
	"#aa2",
	"#22a",
	"#a2a",
	"#2aa",
	"#ddd",
	"#777",
	"#f55",
	"#5f5",
	"#ff5",
	"#55f",
	"#f5f",
	"#5ff",
	"#fff",
];
function palette(index) {
	if (index < 16) return ansiColours[index];
	if (index >= 232) {
		const value = 8 + (index - 232) * 10;
		return `rgb(${value},${value},${value})`;
	}
	const offset = index - 16;
	const channel = (value) => (value === 0 ? 0 : 55 + value * 40);
	return `rgb(${channel(Math.floor(offset / 36))},${channel(Math.floor(offset / 6) % 6)},${channel(offset % 6)})`;
}
function styled(line) {
	let result = "";
	let colour;
	let bold = false;
	let offset = 0;
	// oxlint-disable-next-line no-control-regex -- Decode trusted host SGR colours in synthetic visual evidence.
	for (const match of line.matchAll(/\x1b\[([\d;]*)m/g)) {
		const content = stripVTControlCharacters(line.slice(offset, match.index));
		result += `<span style="${colour ? `color:${colour};` : ""}${bold ? "font-weight:bold;" : ""}">${escapeHtml(content)}</span>`;
		const codes = match[1].split(";").map(Number);
		for (let index = 0; index < codes.length; index++) {
			const code = codes[index];
			if (code === 0) {
				colour = undefined;
				bold = false;
			} else if (code === 1) bold = true;
			else if (code === 22) bold = false;
			else if (code === 39) colour = undefined;
			else if (code >= 30 && code <= 37) colour = ansiColours[code - 30];
			else if (code >= 90 && code <= 97) colour = ansiColours[code - 90 + 8];
			else if (code === 38 && codes[index + 1] === 2) {
				colour = `rgb(${codes.slice(index + 2, index + 5).join(",")})`;
				index += 4;
			} else if (code === 38 && codes[index + 1] === 5) {
				colour = palette(codes[index + 2]);
				index += 2;
			}
		}
		offset = match.index + match[0].length;
	}
	return (
		result +
		`<span style="${colour ? `color:${colour};` : ""}${bold ? "font-weight:bold;" : ""}">${escapeHtml(stripVTControlCharacters(line.slice(offset)))}</span>`
	);
}

/** Local synthetic evidence only. Preserve semantic colour without disclosing disposable paths. */
export async function captureInspectorVisual({ version, mode, theme, stage, lines, width }) {
	const destination = process.env.OMPS_CAPTURE_DIR;
	if (!destination) return;
	let path = false;
	const safe = lines.map((line) => {
		const plain = stripVTControlCharacters(line);
		if (plain.includes("Saved output:")) {
			path = true;
			return "Saved output: <synthetic>";
		}
		if (/Lines \d|↑↓/.test(plain)) path = false;
		return path ? "" : line;
	});
	const filename = `${version}-${mode}-${theme}-${width}-${stage}`;
	const html = `<!doctype html><meta charset="utf-8"><title>${filename}</title><style>body{background:${theme === "light" ? "#fff" : "#181818"};color:${theme === "light" ? "#222" : "#ddd"}}pre{font:14px/1.5 monospace;white-space:pre}</style><pre>${safe.map(styled).join("\n")}</pre>`;
	await mkdir(destination, { recursive: true, mode: 0o700 });
	await writeFile(join(destination, `${filename}.ansi`), safe.join("\n"), { mode: 0o600 });
	await writeFile(join(destination, `${filename}.html`), html, { mode: 0o600 });
}
