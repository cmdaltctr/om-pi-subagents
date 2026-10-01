import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/** What the fake model answers on one request: plain text, one tool call, nothing at all (`hang`), or an HTTP error (`status`). */
export type Turn =
	| { text: string; delayMs?: number }
	| { tool: string; args: object }
	| { hang: true }
	| { status: number };

export interface FakeModel {
	/** Base URL ending in /v1, for models.json. */
	readonly baseUrl: string;
	/** Every chat-completion request body received. The count is the number of model requests. */
	readonly requests: unknown[];
	/** Answers by request order (the last turn repeats), or chosen per request from its body and index. */
	script: Turn[] | ((body: any, index: number) => Turn);
	close(): Promise<void>;
}

const readBody = async (request: IncomingMessage): Promise<string> => {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
};

const chunk = (delta: object, finish: string | null, extra: object = {}) =>
	`data: ${JSON.stringify({ id: "fake-1", object: "chat.completion.chunk", created: 0, model: "counter", choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;

/** Local OpenAI-compatible endpoint that counts requests and answers from `script`. */
export async function startFakeModel(): Promise<FakeModel> {
	const requests: unknown[] = [];
	const model = { script: [{ text: "fake reply" }] as FakeModel["script"] };
	const server: Server = createServer(async (request, response) => {
		if (request.method === "POST" && request.url?.endsWith("/chat/completions")) {
			requests.push(JSON.parse(await readBody(request)));
			const body = requests[requests.length - 1];
			const turn =
				typeof model.script === "function"
					? model.script(body, requests.length - 1)
					: model.script[Math.min(requests.length, model.script.length) - 1];
			if ("status" in turn) {
				response.writeHead(turn.status, { "content-type": "application/json" });
				response.end(
					JSON.stringify({ error: { message: `fake provider error ${turn.status}`, type: "overloaded_error" } }),
				);
				return;
			}
			if ("text" in turn && turn.delayMs) await new Promise((done) => setTimeout(done, turn.delayMs));
			response.writeHead(200, { "content-type": "text/event-stream" });
			const usage = { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
			if ("hang" in turn) return; // keep the connection open and never answer
			if ("tool" in turn) {
				const call = {
					index: 0,
					id: `call_${requests.length}`,
					type: "function",
					function: { name: turn.tool, arguments: JSON.stringify(turn.args) },
				};
				response.write(chunk({ role: "assistant", tool_calls: [call] }, null));
				response.write(chunk({}, "tool_calls", usage));
			} else {
				response.write(chunk({ role: "assistant", content: turn.text }, null));
				response.write(chunk({}, "stop", usage));
			}
			response.end("data: [DONE]\n\n");
			return;
		}
		response.writeHead(404).end();
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	const { port } = server.address() as AddressInfo;
	return {
		baseUrl: `http://127.0.0.1:${port}/v1`,
		requests,
		get script() {
			return model.script;
		},
		set script(turns) {
			model.script = turns;
		},
		close: () =>
			new Promise((done) => {
				server.close(() => done());
				server.closeAllConnections();
			}),
	};
}
