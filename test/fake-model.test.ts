import { describe, expect, it } from "vitest";
import { startFakeModel } from "./fixtures/fake-model.ts";

// Deferred replies let process tests assert admission before any child can finish.
describe("fake model reply control", () => {
	it("awaits an asynchronous script before sending the reply", async () => {
		const model = await startFakeModel();
		let release!: () => void;
		let entered!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const requested = new Promise<void>((resolve) => {
			entered = resolve;
		});
		model.script = async () => {
			entered();
			await held;
			return { text: "Released synthetic reply" };
		};
		try {
			const response = fetch(`${model.baseUrl}/chat/completions`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ model: "counter", messages: [] }),
			});
			await requested;
			expect(model.requests).toHaveLength(1);
			release();
			expect(await (await response).text()).toContain("Released synthetic reply");
		} finally {
			release();
			await model.close();
		}
	});
});
