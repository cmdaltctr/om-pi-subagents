import { stripVTControlCharacters } from "node:util";

/** Preserve visible Markdown structure while removing terminal instructions and direction overrides. */
export function previewText(text: string): string {
	return (
		stripVTControlCharacters(
			// Complete sequences must go first: Node can otherwise consume printable text up to a later bell.
			// oxlint-disable-next-line no-control-regex -- Remove complete ANSI sequences before the host stripper.
			text.replace(/(?:\x1b\[|\x9b)[0-?]*[ -/]*[@-~]/g, ""),
		)
			.replace(/\r\n?/g, "\n")
			.replace(/\t/g, "    ")
			// oxlint-disable-next-line no-control-regex -- Keep safe line breaks and indentation in provisional text.
			.replace(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, "")
			.trimEnd()
	);
}

/** Remove terminal instructions and flatten text before putting it near the editor. */
export function plain(text: string, limit: number): string {
	return (
		stripVTControlCharacters(text)
			// oxlint-disable-next-line no-control-regex -- Remove terminal controls and direction overrides from untrusted display text.
			.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, limit)
	);
}
