import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerRuntime } from "./index.ts";
import { readChildPolicy } from "./protocol.ts";

/** Enable local delegation only when the launcher explicitly approves it. */
export default function managedChild(pi: ExtensionAPI): void {
	const policy = readChildPolicy();
	if (process.env.OMPSS_CHILD !== "1" || typeof policy === "string")
		throw new Error(`Cannot load managed child: ${typeof policy === "string" ? policy : "child marker is missing"}`);
	if (!policy.tools.includes("ompss")) throw new Error("Cannot load managed child: ompss is not approved");
	const currentRuntime = registerRuntime(pi, policy.lineage);
	// Pi 0.99.1 retains its abort signal here; pre-settlement has no active turn signal.
	pi.on("turn_end", async (event, ctx) => {
		if (event.outcome !== "completed" || event.message.role !== "assistant" || event.message.stopReason !== "stop")
			return;
		const runtime = currentRuntime();
		if (!runtime) return;
		const owner = ctx.sessionManager.getSessionId();
		try {
			await runtime.manager.waitForOwned(owner, ctx.signal);
		} catch (error) {
			await runtime.service.shutdown(owner);
			if (!ctx.signal?.aborted) throw error;
		}
	});
	// Let the host finish retries before treating a provider error as final.
	pi.on("agent_before_settle", async (event, ctx) => {
		if (event.outcome === "completed") return;
		await currentRuntime()?.service.shutdown(ctx.sessionManager.getSessionId());
	});
}
