# TDR-012: At-mention autocomplete on Pi

- **Date:** 2026-10-08
- **Status:** Accepted (application decision partly superseded by TDR-013)
- **Superseded by:** [TDR-013](013-replace-the-whole-agent-completion-token.md) for OMPS-owned item application
- **Deciders:** Project maintainer
- **Tags:** pi, autocomplete, input

## Context

OMPS needs to add agent names to Pi's existing `@` file list.
The host pinned in `.pi-host/` is Pi 0.99.1. Installed source identifies the API and application rules.
The disposable executable spike passed on that version; the approved design records its runtime results.
Acceptance covers this platform finding. ADR-017 remains Proposed until final feature verification.

### Source evidence

Paths below are relative to `.pi-host/node_modules/@earendil-works/`.

| Source                                                                         | Finding                                                                                         |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `pi-coding-agent/dist/core/extensions/types.d.ts:66,141`                       | `ctx.ui.addAutocompleteProvider(factory)` wraps the current provider.                           |
| `pi-coding-agent/dist/modes/interactive/interactive-mode.js:521–534,2004–2006` | Factories stack in registration order; Pi does no item merge.                                   |
| `pi-tui/dist/autocomplete.d.ts:1–30`                                           | A suggestion result has items and one shared replacement prefix.                                |
| `pi-tui/dist/autocomplete.js:215–232,315–332`                                  | Built-in `@` completion returns file items and adds a space when applying a non-directory item. |
| `pi-tui/dist/components/editor.js:1138–1151`                                   | The editor trims expanded text before calling `onSubmit`.                                       |
| `pi-coding-agent/dist/modes/interactive/interactive-mode.js:2455–2459`         | The interactive submit handler trims again.                                                     |

The executable spike below confirms native editor selection and submission with this wrapper.

## Decision

Register `ctx.ui.addAutocompleteProvider(factory)` during TUI `session_start`.
The factory receives `current`; call its asynchronous `getSuggestions` with the original arguments and abort signal.
Offer mapped names only at the start of editor line zero, with the cursor in the first word.
Use items such as `{ value: "@reader", label: "reader" }`; omit descriptions and trailing whitespace.

Merge agent items above existing items only when their replacement prefixes are compatible.
Keep Pi's items in their original order. Preserve `triggerCharacters` and `shouldTriggerFileCompletion`.
Delegate `applyCompletion` to `current`; the built-in `@` branch adds the space and places the cursor after it.
A value of `@reader ` would add another space through that branch.

Read mappings afresh on each triggered request. If the read fails, keep the wrapped suggestions without OMPS items.
Accept Pi-trimmed submissions for launch. The parser cannot recover the editor's original leading spaces.

### Runtime evidence

`test/fixtures/at-mention-spike.mjs` binds a real disposable SDK session to TUI mode.
Its inline wrapper registers through the real UI context during `session_start`.
`test/fixtures/at-mention-host.mjs` supplies the native interactive host and editor with a memory terminal.
The spike compares the full retained file items against the original list and prints JSON evidence.

| Check                          | Observed on Pi 0.99.1                            |
| ------------------------------ | ------------------------------------------------ |
| Native file values, in order   | `@reader.md`, `@README.md`                       |
| Merged labels, in order        | `reader`, `reader.md`, `README.md`               |
| Replacement prefix             | Same as the native provider: `@`                 |
| Type `@`, then select with Tab | Text `@reader `, with exactly one trailing space |
| Cursor after selection         | `{ line: 0, col: 8 }`                            |
| Submit `@reader inspect this`  | SDK session receives `@reader inspect this`      |

The fixture headers do not record the original invocation. Replay the spike from the repository root
with installed development dependencies and the pinned host:

```sh
bun run test test/at-mention.e2e.test.ts -t "executes the pinned-host spike"
```

That test calls `runAtMentionNative("at-mention-spike")` in `test/fixtures/at-mention-native.ts`.
The harness runs Bun with `--tsconfig-override`, the spike path and the host module directory as arguments.
It checks the host version and isolates the home, configuration and agent directories.
These results verify the platform wrapper; feature-wide launch and result checks have separate coverage.

## Consequences

### Positive

- The wrapper uses Pi's editor and keeps existing file suggestions.

### Negative

- A shared prefix limits which suggestion sets can be merged safely.
- A preceding extension wrapper can change application behaviour; the executable check must exercise delegated application.

### Neutral

- The spike uses Pi's native editor with a memory terminal. Physical terminal key reporting needs its own check.

## Alternatives Considered

| Option                                         | Rejected Because                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Register `pi.addAutocompleteProvider`          | The inspected API belongs to `ctx.ui`.                             |
| Replace Pi's suggestions with agent items      | Removes file items required by the contract.                       |
| Include a trailing space in agent values       | Built-in `@` application adds its own space.                       |
| Test interactive interception only through RPC | RPC supplies a different input source and cannot prove TUI launch. |

## How to Recognise / Handle This Again

1. If file items disappear, check the wrapper's merge and shared replacement prefix.
2. If completion inserts two spaces, remove trailing whitespace from the agent item value.
3. If the cursor is misplaced, inspect the wrapped `applyCompletion` and repeat the native-editor spike.
4. If a leading-space submission launches, check Pi's trimming before changing the parser.
5. After a host upgrade, inspect the installed API and rerun the executable spike.

## Revisit Triggers

Revisit when Pi changes provider stacking, replacement prefixes, completion spacing or submission trimming.
Also revisit when another extension wraps the provider before OMPS.

## References

- [Approved design](../../openspec/changes/archive/2026-10-08-at-mention-agent-launch/design.md)
- [Executable spike](../../test/fixtures/at-mention-spike.mjs) and [native host](../../test/fixtures/at-mention-host.mjs)
- [Isolated runner](../../test/fixtures/at-mention-native.ts) and [spike replay test](../../test/at-mention.e2e.test.ts)
- [ADR-017: direct launch](../adr/017-launch-agents-directly-from-an-at-mention.md)
- Pinned source files listed above; line numbers apply to Pi 0.99.1.
