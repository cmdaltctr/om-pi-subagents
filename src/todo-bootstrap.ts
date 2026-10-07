import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readChildPolicy } from "./protocol.ts";

/** Seed the real todo extension's child-local mode before its session-start replay. */
export default function todoBootstrap(pi: ExtensionAPI): void {
	const policy = readChildPolicy();
	if (process.env.OMPS_CHILD !== "1" || typeof policy === "string")
		throw new Error(`Cannot initialise child todo: ${typeof policy === "string" ? policy : "child marker is missing"}`);
	if (!policy.tools.includes("todo")) throw new Error("Cannot initialise child todo: todo is not approved");
	pi.on("session_start", () => {
		// This entry changes only the new child's branch, leaving global preferences and parent bindings intact.
		pi.appendEntry("pi-todo-session", { mode: "normal" });
	});
}
