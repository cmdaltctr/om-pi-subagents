# TDR-001: Make process, path and clean-up tests pass on Linux

- **Date:** 2026-10-01
- **Status:** Accepted
- **Deciders:** Maintainer
- **Tags:** ci, linux, tests

## Context

The project had only run its tests on macOS. The first GitHub Actions runs on Ubuntu failed tests that pass on macOS. Each run failed a different set, so some failures were timing races.

### Root Cause Analysis

| Test                                             | Symptom on Linux                                          | Cause                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `processes.test.ts` (3 tests)                    | `expected [ 3688, 3689 ] to deeply equal [ 3688 ]`        | The grandchild ran as `sh -c "sleep 300"`. macOS `sh` replaces itself with `sleep`. Linux `dash` keeps itself, so the tree had two processes. |
| `startup.test.ts`, wrong working directory       | `ENOENT ... /private/tmp`                                 | `/private/tmp` exists only on macOS. The `realpath` call failed before the check ran.                                                         |
| `cleanup.test.ts`, lost output pipe              | `child exited without a settled result`                   | On Linux the child dies of the broken pipe inside the grace period, so the run reports the early exit. Both outcomes fail the run.            |
| `child-contract.test.ts` and others, at clean-up | `ENOTEMPTY: directory not empty, rmdir /tmp/ompss-pi-...` | A stopping Pi still writes files while the test deletes its folder.                                                                           |
| `startup.test.ts`, model run before readiness    | No `StartupError`                                         | A real race in the start-up gate. See [ADR-002](../adr/002-refuse-child-prompts-that-do-not-come-from-the-parent.md).                         |

## Decision

1. Start the test grandchild as `sleep 300` with no shell. Keep the shell only for the case that traps `TERM`.
2. Use `/` as the wrong working directory. It exists on every platform.
3. Accept either failure reason for a lost output pipe. The run must still fail and the process group must be gone.
4. Delete test folders with `rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })`.
5. Run the GitHub check several times on a branch before publishing, to expose timing races.

## Consequences

### Positive

- CI passed 3 separate times on Linux after the fixes.
- The tests now check the behaviour, not one platform's process layout.

### Negative

- The pipe test no longer proves which signal ended the run on Linux.

### Neutral

- There is no local Linux runner. GitHub Actions is the Linux check.

## References

- `processes.test.ts`, `startup.test.ts`, `cleanup.test.ts`
- `test/fixtures/pi-rpc.ts`, `test/fixtures/install.ts`
