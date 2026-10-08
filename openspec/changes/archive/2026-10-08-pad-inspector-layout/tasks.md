## 1. Margin and wrapping tests

- [x] 1.1 Write failing tests in `test/inspector.test.ts` for the four margins at 80x24, and for zero margins at width 30 and at height 8, on both screens. Include a check that the footer hint stays visible.
- [x] 1.2 Write failing tests for a long task summary: wraps, stops at 3 lines, ends with an ellipsis, indent matches the agent line.
- [x] 1.3 Write a failing test that a long "Tree observation incomplete" warning wraps.
- [x] 1.4 Write a failing test in `test/inspector.navigation.test.ts` that a click on any wrapped line selects its agent.
- [x] 1.5 Write a failing test in `test/inspector.presentation.test.ts` that each section heading has a blank line before and after.

## 2. Implementation

- [x] 2.1 Add the margin constants (2 columns, 40 columns, 1 row, 10 rows) and apply them in `renderView` in `src/inspector.ts`, including the body budget.
- [x] 2.2 Wrap the task summary and warning in `treeLines`. Cap summaries at 3 lines with an ellipsis; wrap warnings fully without a separate cap.
- [x] 2.3 Add the blank line after each heading in `src/inspector-presentation.ts`.
- [x] 2.4 Update any existing test that asserted the old exact output. State the reason in the test.

## 3. Records and docs

Write these in plain British English. Use short sentences, active voice and one action per step, as in ASD-STE100. Explain any term a new reader may not know.

- [x] 3.1 Write ADR `docs/adr/013-keep-a-margin-and-wrap-text-in-the-inspector.md` with the template in `docs/adr/ADR_README.md`. Record the four-side margin and its sizes (2 columns, 1 row, and the 40-column and 10-row cutoffs), the 3-line wrap cap, and the heading spacing. Say whether ADR-012 (`full-width content`) is now partly superseded, and mark it in the index if so. Name every file the change touched in Consequences, so a later reader can find the code. Set the status to Proposed.
- [x] 3.2 Write a TDR in `docs/tdr/` (next number 008, template in `docs/tdr/TDR_README.md`) for any terminal behaviour found while wrapping (for example wide characters or ANSI codes that change line width). Skip the TDR if nothing was found, and say so in the ADR.
- [x] 3.3 Add the new ADR and TDR rows to `docs/adr/ADR_README.md` and `docs/tdr/TDR_README.md`. Another change may use the same number. Check both indexes after each rebase on `integration/settings-inspector`, renumber if needed, and keep every row.
- [x] 3.4 Update the public guides for this change: the inspector layout in `docs/USAGE.md`. Update `README.md` and the shipped skill `skills/om-pi-subagents/SKILL.md` when a command, key or setting changes. Keep README example markers intact.
- [x] 3.5 Run `bun run test test/docs.test.ts` and confirm the docs checks pass.

## 4. Checks and close-out

- [x] 4.1 Break the wrapping and the margin in a disposable copy and confirm the new tests fail. Keep the break out of committed files.
- [x] 4.2 Run `bun run ci`, then `openspec validate pad-inspector-layout --strict`.
- [x] 4.3 Check the result in real Pi against the screenshot case: a long task summary and the incomplete-tree warning.
- [x] 4.4 Commit the code, the ADR, the TDR, the docs and the OpenSpec artifacts together. Run `bun run ci:clean`.
- [x] 4.5 Run the `openspec-verify-change` skill. When it passes, set the ADR status to Accepted in its file and in the index, then archive the change.
