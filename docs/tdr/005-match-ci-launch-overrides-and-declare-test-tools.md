# TDR-005: Match CI launch overrides and declare test tools

- **Date:** 2026-10-05
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

PR #8 passed the local pre-push gate but failed four tests in GitHub Actions.
Formatting, lint and types passed on the runner.

### Root cause

CI sets `OMPSS_PI_BIN` to the pinned host CLI. The nested cleanup fixture relied
on a lower-priority launcher in the agent directory to inject a `ps` failure.
The inherited override bypassed that launcher, so no failure was injected.
Two tests then reported successful or cancelled runs instead of uncertain cleanup.

The real `om-pi-todo` package invokes `openspec` for linked parent tasks.
Local tests used a global installation. The runner had no OpenSpec CLI, so
both OpenSpec-mode load-order tests failed with `spawn openspec ENOENT`.

All four failures reproduced on macOS by matching these environment conditions.
The cause was test setup; Linux process handling was not established as a cause.

## Decision

Select the cleanup fixture launcher explicitly through its own `OMPSS_PI_BIN`.
Keep that environment local to the supervisor and its children.
The test process retains its original environment.

Export the pinned-host `OMPSS_PI_BIN` in `scripts/ci-clean.sh`, matching CI.
Keep `@fission-ai/openspec` pinned to `1.14.0` in development dependencies.
`bun install --frozen-lockfile` now supplies the CLI locally and in CI.
Add tooling assertions for the override and installed OpenSpec version.

OpenSpec brings in `braces@3.0.3`, affected by high-severity advisory
`GHSA-vfj7-8cjw-p6xm`. No patched release exists. The maintainer accepts this
risk for personal development and tests using trusted schema patterns.
Document the risk in a red GitHub caution alert in `README.md`.
The audit script checks production dependencies without exclusions, then all
dependencies with only this advisory excluded.

## Consequences

### Positive

- The pre-push gate exercises CI's child-launch selection.
- Parent OpenSpec tests use a declared CLI and still test the real todo package.

### Negative

- Development installs include OpenSpec's dependencies.
- Deeply nested brace patterns can crash OpenSpec. The accepted audit exception remains until a patch is available.

### Neutral

- OMPSS runtime behaviour and production dependencies stay unchanged.
- A local clean clone still runs on the local operating system.

## Alternatives Considered

| Option                           | Rejected because                                               |
| -------------------------------- | -------------------------------------------------------------- |
| Skip the failing tests           | Removes required coverage of cleanup and parent ownership.     |
| Install a global CLI only in CI  | Leaves local tests dependent on machine settings.              |
| Change runtime override priority | Changes supported operator behaviour to accommodate a fixture. |

## How to Recognise / Handle This Again

1. Read the failed step, since the job name includes several checks.
2. Run `OMPSS_PI_BIN="$PWD/.pi-host/node_modules/.bin/pi" bun run test test/nesting.cleanup.test.ts`.
3. Verify `node_modules/.bin/openspec --version` reports `1.14.0`.
4. Run `bun run ci:clean` after committing.
5. Confirm GitHub's Linux check passes before merging.

## Revisit Triggers

Remove the audit exception when a patched dependency becomes available.
Revisit when CI's executable settings change or the pinned todo package needs another OpenSpec CLI version.

## References

- [PR #8](https://github.com/cmdaltctr/om-pi-subagents/pull/8)
- [Failed CI run](https://github.com/cmdaltctr/om-pi-subagents/actions/runs/37300759307)
- [Accepted advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [Cleanup fixture](../../test/nesting.cleanup.test.ts)
- [Parent todo tests](../../test/todo.parent.test.ts)
- [Tooling assertions](../../test/docs.test.ts)
- [Fresh-clone gate](../../scripts/ci-clean.sh)
