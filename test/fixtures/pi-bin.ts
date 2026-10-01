import { accessSync, constants } from "node:fs";
import { delimiter, join, resolve } from "node:path";

const HOST_PI = resolve(import.meta.dirname, "../../.pi-host/node_modules/.bin/pi");

function executable(path: string): boolean {
	try {
		accessSync(path, constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

/** Find the test CLI without borrowing a machine-specific installation. */
export function resolveTestPi(env: NodeJS.ProcessEnv = process.env, canRun = executable): string | undefined {
	if (env.OMPSS_PI_BIN) return canRun(env.OMPSS_PI_BIN) ? env.OMPSS_PI_BIN : undefined;
	if (canRun(HOST_PI)) return HOST_PI;
	return (env.PATH ?? "")
		.split(delimiter)
		.filter(Boolean)
		.map((directory) => join(directory, "pi"))
		.find(canRun);
}
