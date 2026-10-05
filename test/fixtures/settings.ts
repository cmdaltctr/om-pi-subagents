import type { PiFixture, PiRecord } from "./pi-rpc.ts";

/** Drive Pi's native RPC settings dialogs with explicit operator responses. */
export async function editRpcSettings(
	fixture: PiFixture,
	field: 0 | 1 | 2,
	value: string,
	confirmed = true,
): Promise<PiRecord> {
	const seen = new Set<string>(fixture.records.map((record) => record.id).filter(Boolean));
	const command = fixture.send({ type: "prompt", message: "/subagents-settings" });
	void command.catch(() => undefined);
	const dialog = async (method: string) => {
		const request = await fixture.waitFor(
			(record) => record.type === "extension_ui_request" && record.method === method && !seen.has(record.id),
		);
		seen.add(request.id);
		return request;
	};
	const reply = (request: PiRecord, data: PiRecord) => {
		fixture.child.stdin!.write(`${JSON.stringify({ type: "extension_ui_response", id: request.id, ...data })}\n`);
	};
	const menu = await dialog("select");
	reply(menu, { value: menu.options[field] });
	reply(await dialog("input"), { value });
	reply(await dialog("confirm"), { confirmed });
	const done = await dialog("select");
	reply(done, { value: "Done" });
	return command;
}
