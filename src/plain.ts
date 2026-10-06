import { stripVTControlCharacters } from "node:util";

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
