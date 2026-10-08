# ADR-017: Launch agents directly from an at-mention

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

Operators currently use `/omps run <agent> <task>` or ask the parent model to call `omps`.
They need a way to choose a mapped agent while typing. Pi already uses `@` for file completion.
The mapping has no description field, and this change keeps YAML unchanged.

The maintainer approved direct launch. The executable spike passed on pinned Pi 0.99.1.
It confirmed native file ordering, merged labels, completion spacing and submission trimming;
[TDR-012](../tdr/012-at-mention-autocomplete-on-pi.md) records the platform evidence.
This architectural decision remains Proposed until final feature verification.

## Decision

Intercept `@<agent> <task>` through Pi's `input` event and call the shared `/omps run` launch function.
Return `handled` after launch or guidance. This avoids a parent model request for launch routing
and passes the received task to the existing service. Child model calls and later result delivery stay unchanged.

Require `event.source === "interactive"` and `ctx.mode === "tui"`.
RPC and extension input continue unchanged. This keeps the shortcut tied to operator input in the terminal interface.
Catch registry and launch errors locally, show guidance and return `handled`;
Pi otherwise continues prompt processing after an input-handler exception.

Register the completion wrapper with `ctx.ui.addAutocompleteProvider` during TUI `session_start`.
Offer names-only labels when input starts with `@`, on editor line zero, with the cursor still in the first word.
This position identifies the launch target and avoids treating mid-sentence file references as agents.
Read fresh mappings for each request. Merge agent items above Pi's unchanged items only with compatible replacement prefixes.
Preserve the wrapped provider's hooks. Values contain `@<agent>` without trailing whitespace;
OMPS applies its own items by replacing the whole initial token and adding one space before the existing task.
This prevents an old name suffix from becoming task text when the cursor is inside the name.
Native file items keep Pi's delegated application. Extension registration reads no file and starts no process.

Accept Pi's submission trimming. Leading spaces typed by the operator still allow launch after submission.
The pure parser matches only an initial `@` in the text it receives; it needs no earlier editor hook.
A mapped name without a task shows usage. Unknown bare names show mapped names and send nothing.
Unmapped names containing `/` or `.` continue as file references, including `@README.md` and `@src/x.ts`.
Bare `@` and ordinary text pass through. A registry failure for initial-`@` input shows the error and handles the line.

## Consequences

### Positive

- Operators can choose mapped agents in the editor without recalling a slash command.
- The shared launch path keeps validation, limits, acknowledgement and result delivery together.

### Negative

- A mapped bare name such as `docs` takes priority over the same bare file-reference name.
  Use `@./docs` to keep the file path explicit.
- Completion and launch differ for leading spaces: completion needs an initial `@`, while Pi trims submitted input.

### Neutral

- YAML, tool approvals and child readiness checks keep their existing rules.
- The file map links the implementation, test fixtures and public guidance.

| File                                                                                          | Role                                                                                      |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/index.ts`                                                                                | Shared command/input launch and TUI completion registration.                              |
| `src/at-mention.ts`                                                                           | Pure parser, completion item builder, provider wrapper and interactive input handler.     |
| `test/at-mention.test.ts`                                                                     | Parser cases and names-only completion items.                                             |
| `test/at-mention-completion.test.ts`                                                          | Prefix compatibility, native item order, delegated application, hooks and fresh mappings. |
| `test/at-mention.e2e.test.ts`                                                                 | Spike replay, interactive launch scenarios and RPC pass-through checks.                   |
| `test/at-mention-registration.test.ts`                                                        | File-free and process-free registration checks.                                           |
| `test/index.test.ts`                                                                          | Shared command launch and lifecycle registration assertions.                              |
| `test/fixtures/interactive-shortcuts.mjs`                                                     | Host UI fixture exposes autocomplete registration.                                        |
| `test/fixtures/at-mention-fd.mjs`                                                             | Disposable file-listing executable for native-host fixtures.                              |
| `test/fixtures/at-mention-spike.mjs`                                                          | Executable platform spike with JSON evidence.                                             |
| `test/fixtures/at-mention-host.mjs`                                                           | Native interactive host and editor bound to a memory terminal.                            |
| `test/fixtures/at-mention-native.ts`                                                          | Isolated Bun process with pinned peer paths and host-version assertion.                   |
| `test/fixtures/interactive-at-mention.mjs`                                                    | Disposable SDK session, held child reply, result delivery and refusal scenarios.          |
| `README.md`                                                                                   | Feature overview and operator shortcut.                                                   |
| `docs/USAGE.md`                                                                               | Operator instructions and pass-through cases.                                             |
| `skills/om-pi-subagents/SKILL.md`                                                             | Operator shortcut and agent delegation guidance.                                          |
| `docs/README.md`                                                                              | Public documentation index.                                                               |
| `docs/adr/017-launch-agents-directly-from-an-at-mention.md`                                   | This Accepted decision.                                                                   |
| `docs/adr/ADR_README.md`                                                                      | Accepted ADR index entry.                                                                 |
| `docs/tdr/012-at-mention-autocomplete-on-pi.md`                                               | Verified source and runtime platform findings.                                            |
| `docs/tdr/TDR_README.md`                                                                      | Accepted TDR index entry.                                                                 |
| `openspec/changes/archive/2026-10-08-at-mention-agent-launch/proposal.md`                     | Approved scope.                                                                           |
| `openspec/changes/archive/2026-10-08-at-mention-agent-launch/design.md`                       | Launch design and recorded spike results.                                                 |
| `openspec/changes/archive/2026-10-08-at-mention-agent-launch/tasks.md`                        | Implementation and verification checklist.                                                |
| `openspec/changes/archive/2026-10-08-at-mention-agent-launch/specs/at-mention-launch/spec.md` | Launch and completion contract.                                                           |

Additional changed files:

- `test/fixtures/todo-viewer.mjs`: initialise autocomplete in the native Todo integration fixture.
- `docs/tdr/013-replace-the-whole-agent-completion-token.md`: record whole-token application and regression evidence.
- `openspec/specs/at-mention-launch/spec.md`: retain the verified launch and completion contract.
- `openspec/changes/archive/2026-10-08-at-mention-agent-launch/.openspec.yaml`: retain change metadata with the archived plan.

## Alternatives Considered

| Option                                                    | Rejected Because                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Transform the mention into a request for the parent model | Adds a routing turn and lets the model alter the task.                                |
| Offer agent completion anywhere in the editor             | Makes task text and existing file references ambiguous.                               |
| Reject editor submissions with leading spaces             | Pi trims them before the input event; enforcing this requires an earlier editor hook. |
| Treat every unknown name as an agent                      | Consumes file-like references that Pi already supports.                               |
| Enable the shortcut for RPC and extension input           | Extends operator-only launch syntax into programmatic input.                          |

## References

- [Approved proposal](../../openspec/changes/archive/2026-10-08-at-mention-agent-launch/proposal.md)
- [Approved design](../../openspec/changes/archive/2026-10-08-at-mention-agent-launch/design.md)
- [Launch contract](../../openspec/changes/archive/2026-10-08-at-mention-agent-launch/specs/at-mention-launch/spec.md)
- [TDR-012: verified Pi autocomplete findings](../tdr/012-at-mention-autocomplete-on-pi.md)
- [Current registration and command launch](../../src/index.ts)
- [Existing launch service](../../src/service.ts)
- [At-mention usage](../USAGE.md#at-mention-launch)
