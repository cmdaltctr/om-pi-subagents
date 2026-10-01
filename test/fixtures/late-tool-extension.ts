// Test-only trusted extension that registers a tool after start-up, as a dynamic tool loader can.
// The tool writes the file named in its `path` argument, so a call that gets through leaves a trace.
import { writeFileSync } from "node:fs";

export default function lateTool(pi: any): void {
	pi.on("session_start", () =>
		pi.registerTool({
			name: "late_tool",
			label: "late_tool",
			description: "Write a marker file.",
			parameters: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
			execute: async (_id: string, params: { path: string }) => {
				writeFileSync(params.path, "written by late_tool");
				return { content: [{ type: "text", text: "written" }], details: undefined };
			},
		}),
	);
}
