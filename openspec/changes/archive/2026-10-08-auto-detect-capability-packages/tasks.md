## 1. Confirm assumptions

- [x] 1.1 Check the pinned Pi host (`.pi-host/`) for where npm packages install and which `packages` entry forms exist. Record the result in `design.md` if it differs.

## 2. Detection

- [x] 2.1 Write failing tests in `test/settings.test.ts` for `detectPublishedPackages`: one match, no match, version/range/tag suffixes, object entry, relative local paths resolved against `agentDir`, ignored resource filters, duplicate roots, wrong package name, missing folder, missing or invalid `settings.json`, skipped unsupported sources, and a failing candidate followed by a valid candidate. Confirm each fails before the code exists.
- [x] 2.2 Add `detectPublishedPackages(agentDir, capability)` to `src/capabilities.ts`, reusing `published()`.
- [x] 2.3 Add a test that a detected package with a throwing entry file is detected without being imported.

## 3. Settings flow

- [x] 3.1 Write failing tests in `test/capability-settings.e2e.test.ts` for one match (no path prompt), several matches (choice prompt), no match (guidance then path prompt) and a cancelled fallback (YAML unchanged).
- [x] 3.2 Change `showCapabilities` in `src/settings.ts` to call detection before the path prompt and to follow the selection rules in the design.
- [x] 3.3 Confirm that the confirmation dialog, atomic save and conflict checks behave as before.

## 4. Records and docs

Write these in plain British English. Use short sentences, active voice and one action per step, as in ASD-STE100. Explain any term a new reader may not know.

- [x] 4.1 Write ADR `docs/adr/014-detect-capability-packages-from-the-pi-package-list.md` with the template in `docs/adr/ADR_README.md`. Record why detection reads Pi's `packages` list and not a folder scan, why a manual path stays as the fallback, and why detection never loads the sibling extension. Name every file the change touched in Consequences, so a later reader can find the code. Set the status to Proposed.
- [x] 4.2 Write a TDR in `docs/tdr/` (next number 009, template in `docs/tdr/TDR_README.md`) for the Pi install layout that task 1.1 confirmed (where npm packages install, and which `packages` entry forms exist), with the Pi version it was checked on. This is a platform finding, so the TDR is required.
- [x] 4.3 Add the new ADR and TDR rows to `docs/adr/ADR_README.md` and `docs/tdr/TDR_README.md`. Another change may use the same number. Check both indexes after each rebase on `integration/settings-inspector`, renumber if needed, and keep every row.
- [x] 4.4 Update the public guides for this change: the Memory and Todo enable steps in `docs/USAGE.md`, and the fallback path prompt. Update `README.md` and the shipped skill `skills/om-pi-subagents/SKILL.md` when a command, key or setting changes. Keep README example markers intact.
- [x] 4.5 Run `bun run test test/docs.test.ts` and confirm the docs checks pass.

## 5. Checks and close-out

- [x] 5.1 Break detection in a disposable copy and confirm the new tests fail. Keep the break out of committed files.
- [x] 5.2 Run `bun run ci`, then `openspec validate auto-detect-capability-packages --strict`.
- [x] 5.3 Check in real Pi: open `/omps-settings`, choose Agent capabilities, enable Memory and Todo, and confirm no path is asked.
- [x] 5.4 Commit the code, the ADR, the TDR, the docs and the OpenSpec artifacts together. Run `bun run ci:clean`.
- [x] 5.5 Run the `openspec-verify-change` skill. When it passes, set the ADR status to Accepted in its file and in the index, then archive the change.
