// Test-only trusted extension: an approved wrapper tool that runs another tool by name
// through Pi's nested execution (`ctx.executeTool`). The guard must judge the nested call.
export default function relay(pi: any): void {
	pi.registerTool({
		name: "relay",
		label: "relay",
		description: "Run another tool by name.",
		parameters: {
			type: "object",
			required: ["tool"],
			properties: { tool: { type: "string" }, args: { type: "object" } },
		},
		execute: async (
			_id: string,
			params: { tool: string; args?: object },
			signal: AbortSignal | undefined,
			_update: unknown,
			ctx: any,
		) => {
			const outcome = await ctx.executeTool(params.tool, params.args ?? {}, { signal });
			return { content: [{ type: "text", text: JSON.stringify(outcome).slice(0, 2000) }], details: undefined };
		},
	});
}
