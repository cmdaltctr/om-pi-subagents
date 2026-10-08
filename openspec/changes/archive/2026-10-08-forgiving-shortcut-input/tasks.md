## 1. Conversion

- [x] 1.1 Write failing tests in `test/config.test.ts` for `typedKeyToSpec`: every alias, upper case, spaces around `+`, `off`, an unknown modifier left unchanged, and an already canonical key.
- [x] 1.2 Add `typedKeyToSpec` beside `normaliseKey` in `src/config.ts`. Confirm the tests pass.
- [x] 1.3 Add a test that the YAML loader still rejects `control+1`.

## 2. Settings flow

- [x] 2.1 Write failing tests in `test/settings.test.ts`: the prompt text names typing, `ctrl+1`, `ctrl`, `shift` and `alt`; `Control + 1` proposes `ctrl+1`; the confirmation shows both forms; the saved YAML holds `ctrl+1`.
- [x] 2.2 Write failing tests in `test/settings.test.ts` and `test/shortcuts.test.ts` for shared conflict validation: reject a converted `tab`, `ctrl+i`, duplicate or Pi-conflicting key before confirmation without saving; preserve permitted direction-specific default Up/Down overlaps; reject other owners of those keys; accept a key freed by effective Pi remapping. Check settings and registration use the same owner-specific guidance.
- [x] 2.3 Extract the existing Pi-conflict policy into a shared exported helper in `src/shortcuts.ts`. Preserve modifier-order comparison, effective bindings, `off`, the permitted default navigation overlaps and registration behaviour. Run the focused shortcut tests.
- [x] 2.4 Change `editShortcut` in `src/settings.ts` to show the prompt note, convert the answer, run the existing unsafe-key and duplicate checks plus the shared Pi-conflict check before confirmation or saving, and show the conversion in the confirmation. Confirm the conversion, settings and shortcut tests pass.
- [x] 2.5 Add the accepted-modifier list to the settings error for a bad specification.

## 3. Records and docs

Write these in plain British English. Use short sentences, active voice and one action per step, as in ASD-STE100. Explain any term a new reader may not know.

- [x] 3.1 Write ADR `docs/adr/015-convert-typed-shortcuts-only-in-settings.md` with the template in `docs/adr/ADR_README.md`. Record why the alias conversion lives in the settings input and the YAML loader stays strict, the alias table, why `meta` is left out, and why settings and registration share Pi-conflict validation with default navigation exceptions. Name every file the change touched in Consequences, so a later reader can find the code. Set the status to Proposed.
- [x] 3.2 Write a TDR in `docs/tdr/` (next number 010, template in `docs/tdr/TDR_README.md`) for any new key finding. The macOS Option key problem is already in TDR-007, so link to it and do not repeat it. Skip a new TDR if nothing new was found, and say so in the ADR.
- [x] 3.3 Add the new ADR and TDR rows to `docs/adr/ADR_README.md` and `docs/tdr/TDR_README.md`. Another change may use the same number. Check both indexes after each rebase on `integration/settings-inspector`, renumber if needed, and keep every row.
- [x] 3.4 Update the public guides for this change: the shortcut section of `docs/USAGE.md`: type the key as text, for example `ctrl+1`, list the accepted spellings, and link the macOS Option note. Update `README.md` and the shipped skill `skills/om-pi-subagents/SKILL.md` when a command, key or setting changes. Keep README example markers intact.
- [x] 3.5 Run `bun run test test/docs.test.ts` and confirm the docs checks pass.

## 4. Checks and close-out

- [x] 4.1 Break the conversion in a disposable copy and confirm the new tests fail. Keep the break out of committed files.
- [x] 4.2 Run `bun run ci`, then `openspec validate forgiving-shortcut-input --strict`.
- [x] 4.3 Check the prompt in real Pi: type `Control + 1`, confirm, `/reload`, and confirm the key works.
- [x] 4.4 Commit the code, the ADR, the TDR, the docs and the OpenSpec artifacts together. Run `bun run ci:clean`.
- [x] 4.5 Run the `openspec-verify-change` skill. When it passes, set the ADR status to Accepted in its file and in the index, then archive the change.
