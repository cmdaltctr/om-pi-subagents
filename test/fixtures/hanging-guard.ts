// Test-only guard whose preflight never finishes, so a child never becomes ready.
export default (pi: any) =>
	pi.registerCommand("omps-child-preflight", { description: "hangs", handler: () => new Promise(() => {}) });
