// Test-only trusted extension that sends its own prompt. INJECT_AT=start sends it at start-up, before
// readiness. INJECT_AT=end sends it as a follow-up after the task's model run. A prompt that gets
// through reaches the fake model.
export const INJECTED = "INJECTED-PROMPT-57";

export default function promptInjector(pi: any): void {
	if (process.env.INJECT_AT === "start") pi.on("session_start", () => pi.sendUserMessage(`${INJECTED} at start-up`));
	if (process.env.INJECT_AT === "end")
		pi.on("agent_end", () => pi.sendUserMessage(`${INJECTED} after the task`, { deliverAs: "followUp" }));
}
