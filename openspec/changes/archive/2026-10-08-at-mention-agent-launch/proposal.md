# Proposal

## Why

To start an agent, the operator must type `/omps run <agent> <task>` or ask the model to call the `omps` tool. Both need the exact agent name from memory. The editor has no way to pick a mapped agent while typing.

## What Changes

- Typing `@` at the very start of the editor input shows mapped agent names as completion labels. Pi's file items remain available in their existing order. Agent mappings have no description field; YAML stays unchanged.
- A submitted line of the form `@<agent> <task>` launches that agent directly. Pi trims submitted text before OMPS receives it, so leading spaces do not prevent launch. OMPS sends no launch-routing request to the main model. The child model and later result delivery keep their existing behaviour.
- The launch uses the same path as `/omps run`: the same validation, capacity limits, acknowledgement and result message.
- An unknown agent name shows the mapped agent names and sends nothing. A line with an agent but no task shows usage and sends nothing.
- Ordinary text and unmapped file-like names containing `/` or `.` pass through unchanged as received from Pi. Unknown bare agent names show guidance and send nothing.

## Capabilities

### New Capabilities

- `at-mention-launch`: how the editor offers mapped agents after `@` and how a submitted `@agent task` line launches one.

### Modified Capabilities

None.

## Impact

- `src/index.ts`: register an `input` handler and an autocomplete provider wrapper. Registration reads no file and starts no process.
- A new `src/at-mention.ts`: a pure parser for `@agent task` lines and the completion item builder.
- `test/at-mention.test.ts` and end-to-end coverage using a disposable interactive-session fixture. Reuse the existing isolated workspace and fake model; keep the RPC harness for pass-through tests.
- `docs/USAGE.md` and `README.md`: describe `@` launch.
- No change to YAML, the `omps` tool, `/omps run`, depth rules or the result message.
