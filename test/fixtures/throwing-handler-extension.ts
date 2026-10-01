// Test-only trusted extension whose handler throws. Pi reports it as an `extension_error` and carries on.
export default function throwing(pi: any): void {
	pi.on("turn_end", () => {
		throw new Error("handler exploded");
	});
}
