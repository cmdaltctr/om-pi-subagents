# TDR-002: Allow tool events before the prompt response in tests

- **Date:** 2026-10-02
- **Status:** Accepted
- **Deciders:** Maintainer
- **Tags:** tests, timing, rpc, linux

## Context

The real-Pi panel test waited for the first widget that showed `Tools: bash`. It then required that widget to show `reader running`.

The test passed on macOS. A review found that it depends on how the parent reads the child's output pipe.

### Root Cause Analysis

| Step | What happens                                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Pi 0.99.1 writes the `started` prompt response just before the agent loop starts (`agent-session.js`, `preflightResult`).        |
| 2    | The first tool event follows after one model round trip.                                                                         |
| 3    | A busy parent can read both lines from the pipe in one chunk. `rpc.ts` handles every line in a chunk before any `await` resumes. |
| 4    | The tool event reaches the panel while the run is still `starting`. The supervisor marks the run `running` a moment later.       |

A scratch wrapper that batched child output every 300 ms reproduced the failure:
`expected 'OMPSS: reader starting\nTools: bash' to contain 'reader running'`.

The product behaviour is correct. The specification requires the panel to show task tools that arrive before acknowledgement.

## Decision

1. Make the test wait for the exact view `OMPSS: reader running` with `Tools: bash`.
2. Add a panel unit test: a tool that starts while `starting` stays listed after the run becomes `running`.
3. Keep the batching wrapper in ignored `docs/local-docs/` to repeat the check.

## Consequences

### Positive

- The test no longer depends on pipe read timing, which differs between machines.
- A change that drops active tools on a state change now fails both tests.

### Negative

- The real-Pi test no longer checks the first widget that shows the tool.

### Neutral

- Rerun the batched check: `OMPSS_PI_BIN="$PWD/docs/local-docs/review-pi-batched.sh" bunx vitest run test/parent.e2e.test.ts`.

## References

- `parent.e2e.test.ts`, `panel.test.ts`, `rpc.ts`, `supervisor.ts`
- [ADR-004](../adr/004-show-child-progress-in-a-parent-owned-widget.md)
