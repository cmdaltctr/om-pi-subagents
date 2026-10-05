import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerRuntime } from "../../index.ts";

/** Expose retained display state only in disposable RPC hosts. */
export default function observationHost(pi: ExtensionAPI): void {
	const runtime = registerRuntime(pi);
	pi.registerCommand("fixture-observations", {
		description: "Read disposable observation state",
		handler: async (_args, ctx) => {
			const observations = runtime()?.observations;
			pi.appendEntry("fixture-observations", {
				trees: observations?.trees(ctx.sessionManager.getSessionId()) ?? [],
			});
		},
	});
	pi.registerCommand("fixture-broken-display", {
		description: "Inject a disposable display failure",
		handler: async (_args, ctx) => {
			runtime()?.observations.subscribe(ctx.sessionManager.getSessionId(), () => {
				throw new Error("disposable renderer failed");
			});
		},
	});
}
