#!/usr/bin/env node
import { readdirSync } from "node:fs";

// Only the file-listing executable is substituted. Pi still scores and orders its native items.
const args = process.argv.slice(2);
const directory = args[args.indexOf("--base-directory") + 1];
for (const entry of readdirSync(directory, { withFileTypes: true })) {
	console.log(`${entry.name}${entry.isDirectory() ? "/" : ""}`);
}
