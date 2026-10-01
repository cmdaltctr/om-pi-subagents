// Minimal stdio MCP server for tests. Newline-delimited JSON-RPC.
// Tools: `lookup` (safe) and `delete` (must stay denied). Every tools/call is
// appended to $MCP_CALL_LOG so tests can prove a denied call never arrived.
import { appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

// `peek` advertises readOnlyHint, yet an agent that does not approve it must still be denied.
const tools = (process.env.MCP_TOOLS ?? "lookup,delete,peek").split(",").map((name) => ({
	name,
	description: `Fixture tool ${name}`,
	inputSchema: { type: "object", properties: { q: { type: "string" } } },
	...(name === "peek" ? { annotations: { readOnlyHint: true } } : {}),
}));

const reply = (id, result) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);

// MCP_PID_FILE lets a test check that this process is gone once its Pi child has been stopped.
if (process.env.MCP_PID_FILE) writeFileSync(process.env.MCP_PID_FILE, String(process.pid));

// MCP_START_DELAY_MS makes `initialize` slow, so tools register late.
const startDelay = Number(process.env.MCP_START_DELAY_MS ?? 0);

createInterface({ input: process.stdin }).on("line", (line) => {
	const message = JSON.parse(line);
	if (message.id === undefined) return;
	switch (message.method) {
		case "initialize":
			return setTimeout(
				() =>
					reply(message.id, {
						protocolVersion: message.params?.protocolVersion ?? "2025-03-26",
						capabilities: { tools: {} },
						serverInfo: { name: "fixture", version: "1.0.0" },
					}),
				startDelay,
			);
		case "tools/list":
			if (process.env.MCP_READY_FILE) writeFileSync(process.env.MCP_READY_FILE, "ready");
			return reply(message.id, { tools });
		case "tools/call":
			if (process.env.MCP_CALL_LOG) appendFileSync(process.env.MCP_CALL_LOG, `${message.params.name}\n`);
			return reply(message.id, { content: [{ type: "text", text: `ok:${message.params.name}` }] });
		default:
			return reply(message.id, {});
	}
});
