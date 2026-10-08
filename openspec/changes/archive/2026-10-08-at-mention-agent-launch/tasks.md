## 1. Spike

- [x] 1.1 In the pinned Pi host, run an executable spike for `ctx.ui.addAutocompleteProvider` during TUI `session_start`. Confirm agent and file items merge with compatible prefixes, file order stays unchanged, applying an agent leaves exactly one space and the correct cursor, and editor submission trims leading spaces. Record source and runtime evidence separately in `design.md`. If the wrapper cannot support this, adjust the completion requirement before coding.

## 2. Parser

- [x] 2.1 Write failing tests in `test/at-mention.test.ts` for `parseAtMention`: mapped agent with task, mapped agent without task, unknown name, file-like names (`README.md`, `src/x.ts`), a direct helper input with leading space, whitespace-only task, bare `@`, multi-line task, empty line and a line that does not start with `@`. Pi-normalised interactive leading spaces are covered separately.
- [x] 2.2 Add `src/at-mention.ts` with `parseAtMention` and the completion item builder. Confirm the tests pass.

## 3. Launch

- [x] 3.1 Move the `run` branch of the `/omps` command into one shared function in `src/index.ts`. Confirm the existing `/omps run` tests still pass unchanged.
- [x] 3.2 Write failing end-to-end tests using a disposable interactive SDK session with the existing isolated workspace and fake model. Hold the child reply to prove `@agent task` launches without a parent routing request. Cover Pi-trimmed leading spaces through the native editor, unknown agent and no-task guidance, file-reference pass-through, registry errors, admission refusal and later readiness failure. Reuse the RPC harness to prove RPC pass-through; also test extension-source pass-through.
- [x] 3.3 Register the interactive-TUI `input` handler. Return `handled` for a launch, unknown agent, missing task or initial-`@` registry failure. Catch launch errors locally and handle the input. Share `/omps run` acknowledgement and later result behaviour.
- [x] 3.4 Add a test that registration reads no file and starts no process.

## 4. Completion

- [x] 4.1 Write failing tests for the completion wrapper: name-only labels on editor line zero, nothing mid-line or on later lines, fresh registry reads, no OMPS items on a failed read, Pi's own item order kept, compatible replacement prefixes, delegated hooks and exactly one trailing space after application.
- [x] 4.2 Register the autocomplete wrapper through `ctx.ui.addAutocompleteProvider` during TUI `session_start`. Use values without trailing whitespace. Apply OMPS-owned items by replacing the whole initial token with exactly one task separator; preserve task text and later lines. Delegate native file application to Pi.

## 5. Records and docs

Write these in plain British English. Use short sentences, active voice and one action per step, as in ASD-STE100. Explain any term a new reader may not know.

- [x] 5.1 Write ADR `docs/adr/017-launch-agents-directly-from-an-at-mention.md` with the template in `docs/adr/ADR_README.md`. Record why `@agent task` launches without a model call, why completion requires the start of editor line zero, why launch accepts Pi-trimmed input, how file-like names stay file references, and why only interactive TUI input launches. Name every file the change touched in Consequences, so a later reader can find the code. Set the status to Proposed.
- [x] 5.2 Write a TDR in `docs/tdr/` (next number 012, template in `docs/tdr/TDR_README.md`) for the spike result from task 1.1: whether `ctx.ui.addAutocompleteProvider` can add items to Pi's `@` list, how the wrapper merges compatible prefixes, how Pi applies exactly one space, and how Pi trims editor submission. This is a platform finding, so the TDR is required.
- [x] 5.3 Add the new ADR and TDR rows to `docs/adr/ADR_README.md` and `docs/tdr/TDR_README.md`. Another change may use the same number. Check both indexes after each rebase on `integration/settings-inspector`, renumber if needed, and keep every row.
- [x] 5.4 Update the public guides for this change: `@` launch in `docs/USAGE.md`: how to type it, what happens with an unknown agent, and how file references still work. Update `README.md` and the shipped skill `skills/om-pi-subagents/SKILL.md` when a command, key or setting changes. Keep README example markers intact.
- [x] 5.5 Run `bun run test test/docs.test.ts` and confirm the docs checks pass.

## 6. Checks and close-out

- [x] 6.1 Break the parser and the handler in a disposable copy and confirm the new tests fail. Keep the break out of committed files.
- [x] 6.2 Run `bun run ci`, then `openspec validate at-mention-agent-launch --strict`.
- [x] 6.3 Check in real Pi: type `@`, pick an agent, add a task, submit, and confirm the run, the acknowledgement and the result message. Also submit an `@file` line.
- [x] 6.4 Commit the code, the ADR, the TDR, the docs and the OpenSpec artifacts together. Run `bun run ci:clean`.
- [x] 6.5 Run the `openspec-verify-change` skill. When it passes, set the ADR status to Accepted in its file and in the index, then archive the change.
