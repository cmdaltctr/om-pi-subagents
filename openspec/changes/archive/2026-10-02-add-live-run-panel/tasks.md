# Tasks

## 1. Test first

- [x] 1.1 Add bare-command and whitespace regressions in `index.test.ts`; confirm status expectations fail on the current handler.
- [x] 1.2 Add panel tests for concurrent and nested identifiers; confirm missing panel behaviour fails.
- [x] 1.3 Add notifier tests for final previews, stale reads, ownership and throwing UI callbacks; confirm each intended failure.
- [x] 1.4 Add supervisor tests for startup replay and tool events before acknowledgement; confirm task-phase relay expectations fail.
- [x] 1.5 Test missing and invalid thinking, empty registries and model inheritance; confirm missing-thinking rejection fails before implementation.

## 2. Implement the scoped fixes

- [x] 2.1 Route empty command input to status; verify new regressions and existing invalid-command cases pass.
- [x] 2.2 Implement bounded plain-text panel state; verify lifecycle, tool matching and control-sequence tests pass.
- [x] 2.3 Inject task-phase progress delivery into the supervisor; verify fast tools, replay exclusion and cleanup tests pass.
- [x] 2.4 Wire the widget through the live parent binding; verify owner checks, shutdown clearing and no-UI tests pass.
- [x] 2.5 Add retained final previews through the existing result path; verify partial labels and late-read guards pass.
- [x] 2.6 Require thinking in registry snapshots and launch arguments; verify validation and explicit-thinking tests pass.
- [x] 2.7 Update valid fixture mappings and snapshots with deliberate thinking values; verify affected tests pass without weakening rejection cases.

## 3. Integration and documentation

- [x] 3.1 Test real Pi widget events with a controlled slow tool; verify running activity and final state are observable.
- [x] 3.2 Update `README.md` and public guides for the panel, bare status and thinking requirement; verify documentation tests pass.
- [x] 3.3 Run Aikido on changed code; trace findings and record any justified suppressions only in ignored local reports.
- [x] 3.4 Run focused tests and `bun run ci`; require passing checks and report all skipped tests.

## 4. Prove the result

- [x] 4.1 Break relay, identifier matching, ownership, text safety, bare handling and required thinking in scratch copies; verify tests fail.
- [x] 4.2 Inspect an isolated parent in Orca; verify the rendered screen shows an active tool and retained final summary.
- [x] 4.3 Verify the diff stays scoped and local reports remain ignored; check tracked files for personal paths.
- [x] 4.4 Commit when authorised and run `bun run ci:clean`; require the committed gate to pass without pushing.
