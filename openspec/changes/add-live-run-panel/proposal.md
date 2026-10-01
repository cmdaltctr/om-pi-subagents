# Proposal

## Why

OMPSS children run through pipes, so Orca cannot show their tool activity in separate terminal panes.
Bare `/ompss` also produces a usage warning even when the user only wants to inspect the current run.

## What Changes

- Add a compact parent Pi widget showing the agent, run state and active child tools.
- Update the widget from task-phase tool events without forwarding arguments or raw tool results.
- Keep the final state and a bounded answer preview visible until another run starts or the session ends.
- Preserve the existing full result message and its separate delivery record.
- Treat bare and whitespace-only `/ompss` as status requests. Keep warnings for invalid subcommands.
- **BREAKING**: Require an explicit `thinking` variant on every mapped agent; reject missing values before launch.
- Keep `model` optional so it can inherit the parent. Update examples and valid test fixtures with explicit thinking.
- Update usage guidance and add regression, real-Pi and scratch-failure checks.

## Capabilities

### New Capabilities

- `live-run-panel`: Parent-owned run progress, tool activity and a safe final summary.
- `ompss-command-interface`: Friendly bare status and validated per-agent thinking, with existing subcommands preserved.

### Modified Capabilities

None. This project has no existing OpenSpec capability files.

## Impact

Likely changes affect `index.ts`, `notify.ts`, `supervisor.ts`, `config.ts`, `runner.ts`, a small panel module and their tests.
`README.md` and the public guides will describe the panel, bare status and required thinking values.
Existing mappings without `thinking` need an explicit supported value before they can launch.
Pi 0.99.1 supports string-array widgets in its interactive UI and RPC UI protocol.
No dependencies, extra child terminals, runtime settings or permission changes are required.
Automatic model fallback remains a separate follow-up.
Local verification and security evidence remain in ignored `docs/local-docs/`.
