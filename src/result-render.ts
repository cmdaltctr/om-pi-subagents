/** Number of answer lines shown before a long result folds. */
export const RESULT_LINE_LIMIT = 8;

/** Keep result metadata and partial-output warnings visible while folding answer lines. */
export function collapseResult(content: string, limit: number): { head: string[]; hidden: number } {
	const lines = content.split("\n");
	const label = lines.indexOf("Result:");
	if (label < 0) return { head: lines, hidden: 0 };
	const head = lines.slice(0, label + 1);
	let shown = 0;
	let hidden = 0;
	for (const line of lines.slice(label + 1)) {
		if (line.startsWith("Error:") || line.includes("PARTIAL OUTPUT")) head.push(line);
		else if (shown < limit) {
			head.push(line);
			shown += 1;
		} else hidden += 1;
	}
	return { head, hidden };
}
