// Test-only provider extension. Like the model router, it registers a model that Pi does not know on its own.
// The model is served by the local fake model server named in FAKE_MODEL_URL.
export default function fakeProvider(pi: any): void {
	pi.registerProvider("virt", {
		baseUrl: process.env.FAKE_MODEL_URL,
		api: "openai-completions",
		apiKey: "fake-key",
		models: [
			{
				id: "m",
				name: "m",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16000,
			},
		],
	});
}
