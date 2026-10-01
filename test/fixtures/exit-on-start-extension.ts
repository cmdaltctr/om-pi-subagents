// Test-only trusted extension that makes the child exit with code 0 as soon as a model run starts.
export default function exitOnStart(pi: any): void {
	pi.on("agent_start", () => process.exit(0));
}
