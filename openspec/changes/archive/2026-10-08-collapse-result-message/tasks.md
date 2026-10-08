## 1. Spike

- [x] 1.1 Find a supported way to make Pi redraw transcript messages from a shortcut handler. Record the result in `design.md`. If none exists, record the limit and adjust the spec scenario "The result key toggles every message".

## 2. Render helper

- [x] 2.1 Write failing tests in `test/result-render.test.ts` for `collapseResult`: a long result is cut at the limit with the right hidden count; a short result has zero hidden; a failed run keeps its `Error:` and `PARTIAL OUTPUT` lines; content without a `Result:` label is returned whole.
- [x] 2.2 Add `src/result-render.ts` with `collapseResult` and the limit constant. Confirm the tests pass.

## 3. Renderer and key

- [x] 3.1 Write a failing test that `omps-result` has a registered message renderer, that collapsed output shows the hint and expanded output shows the full text.
- [x] 3.2 Register the renderer in `src/index.ts` with `pi.registerMessageRenderer`, using `keyHint` for the key name and the defensive guard from the design.
- [x] 3.3 Add a test that the content sent to the model equals the content before this change, using the existing `test/notify.test.ts` fixtures.

- [x] 3.4 Write failing tests that `ui.resultKey` defaults to `ctrl+shift+e`, accepts `off`, rejects duplicates and unsafe keys, and appears in `/omps-settings`.
- [x] 3.5 Add `resultKey` to `UI_KEY_FIELDS`, the loader, `src/shortcuts.ts` and `src/settings.ts`, with the session flag from the design.

## 4. Records and docs

Write these in plain British English. Use short sentences, active voice and one action per step, as in ASD-STE100. Explain any term a new reader may not know.

- [x] 4.1 Write ADR `docs/adr/016-fold-result-messages-and-bind-ctrl-shift-e.md` with the template in `docs/adr/ADR_README.md`. Record why the result folds by default, the 8-line limit, why `ui.resultKey` defaults to `ctrl+shift+e` when other OMPS keys default to `off`, and why one session flag is used. Name every file the change touched in Consequences, so a later reader can find the code. Set the status to Proposed.
- [x] 4.2 Write a TDR in `docs/tdr/` (next number 011, template in `docs/tdr/TDR_README.md`) for the spike result from task 1.1: whether Pi can redraw transcript messages from a shortcut, and what Pi does with `ctrl+shift+e` in a terminal without the kitty keyboard protocol. This is a platform finding, so the TDR is required.
- [x] 4.3 Add the new ADR and TDR rows to `docs/adr/ADR_README.md` and `docs/tdr/TDR_README.md`. Another change may use the same number. Check both indexes after each rebase on `integration/settings-inspector`, renumber if needed, and keep every row.
- [x] 4.4 Update the public guides for this change: the "Getting the result" section of `docs/USAGE.md`, the `ui.resultKey` setting, and the fallback to the host expansion key. Update `README.md` and the shipped skill `skills/om-pi-subagents/SKILL.md` when a command, key or setting changes. Keep README example markers intact.
- [x] 4.5 Run `bun run test test/docs.test.ts` and confirm the docs checks pass.

## 5. Checks and close-out

- [x] 5.1 Break the fold in a disposable copy and confirm the new tests fail. Keep the break out of committed files.
- [x] 5.2 Run `bun run ci`, then `openspec validate collapse-result-message --strict`.
- [x] 5.3 Check in real Pi: finish a run with a long answer, see the folded message, expand it with `ctrl+shift+e` and with the host key, then remap a key and check the hint. Repeat in a terminal without the kitty protocol.
- [x] 5.4 Commit the code, the ADR, the TDR, the docs and the OpenSpec artifacts together. Run `bun run ci:clean`.
- [x] 5.5 Run the `openspec-verify-change` skill and resolve its implementation findings. Set the ADR status to Accepted in its file and index after the implementation checks pass.

Archive the change after all tasks are recorded complete. Recheck verification with the completed checklist before archiving. This keeps archive outside its own prerequisite checklist.
