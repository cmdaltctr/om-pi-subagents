import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTestPi } from "./fixtures/pi-bin.ts";

const host = join(import.meta.dirname, "../.pi-host/node_modules/.bin/pi");

describe("portable test CLI", () => {
	it("honours an explicit executable", () => {
		expect(resolveTestPi({ OMPS_PI_BIN: "/test/bin/pi" }, (path) => path === "/test/bin/pi")).toBe("/test/bin/pi");
	});
	it("refuses a missing explicit override", () => {
		expect(resolveTestPi({ OMPS_PI_BIN: "/missing/pi" }, () => false)).toBeUndefined();
	});
	it("uses the pinned host CLI before PATH", () => {
		expect(resolveTestPi({ PATH: "/test/bin" }, (path) => path === host || path === "/test/bin/pi")).toBe(host);
	});
	it("falls back to PATH", () => {
		expect(resolveTestPi({ PATH: "/missing:/test/bin" }, (path) => path === "/test/bin/pi")).toBe("/test/bin/pi");
	});
	it("reports a missing CLI so callers can skip real-CLI tests", () => {
		expect(resolveTestPi({}, () => false)).toBeUndefined();
	});
});
