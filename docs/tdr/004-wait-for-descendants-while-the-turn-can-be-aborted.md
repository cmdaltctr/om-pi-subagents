# TDR-004: Wait for descendants while the turn can be aborted

- **Date:** 2026-10-05
- **Status:** Accepted
- **Deciders:** Maintainer
- **Tags:** pi, nesting, cancellation, settlement

## Context

A delegating child must use its descendants' results before Pi accepts its final answer.
The first implementation waited at `agent_before_settle` in the pinned Pi 0.99.1 host.
RPC abort then timed out while a descendant remained active.

### Root Cause Analysis

Pi obtains `ctx.signal` from the low-level agent's active run.
That run has ended when `agent_before_settle` fires, so the signal is undefined.
The descendant wait cannot observe cancellation, and RPC abort waits for idle.

A disposable probe found a live signal at `turn_end` and no signal at `agent_before_settle`.
Aborting a held `turn_end` completed immediately in that probe.
The regression reproduced the pre-settlement abort timeout before the fix.

## Decision

1. Wait in `managed-child.ts` at final-answer `turn_end` using `ctx.signal`.
2. Require outcome `completed`, assistant role and stop reason `stop` before waiting.
3. Skip tool-use turns so the model can launch several descendants across turns.
4. Wait for each owned supervisor and its separate result-delivery attempt.
5. On cancellation, close admission and cancel owned runs through the existing shutdown service.
6. Keep `agent_before_settle` for final error or abort teardown after host retries.

Use queued custom follow-ups for results. The handler returns no continuation request.
Todo reminders stay at their own pre-settlement boundary.
The supervisor still requires final `agent_settled` evidence before accepting output.

## Consequences

### Positive

Cancellation breaks the descendant wait without another parent model response.
The parent still consumes nested results before final settlement.

### Negative

The handler depends on the host retaining an abort signal at `turn_end`.
Tool-use turns require an explicit exclusion to preserve parallel launches.

### Neutral

The host version, deadlines and permission boundary stay unchanged.
Linux verification remains part of the broader change's validation work.

## Alternatives Considered

| Option                               | Rejected because                                                      |
| ------------------------------------ | --------------------------------------------------------------------- |
| Wait at `agent_before_settle`        | Pi 0.99.1 supplies no active abort signal there.                      |
| Wait after every turn                | A hanging first descendant prevents the model from launching another. |
| Return an unconditional continuation | Can request unnecessary model turns or create a loop.                 |

## How to Recognise / Handle This Again

1. Run `bun run test test/nesting.launch.test.ts test/runs.settlement.test.ts`.
2. Check that abort returns while the parent waits for a hanging descendant.
3. Check that the parent receives results and settles once.
4. Check that two launches succeed across tool-use turns.
5. Probe `ctx.signal` at both boundaries if a host upgrade changes these checks.

## Revisit Triggers

- The pinned Pi version changes its abort or boundary dispatch contract.
- Result messages stop draining after a held final-answer turn.

## References

- [Managed child](../../src/managed-child.ts)
- [Run manager](../../src/runs.ts)
- [Real Pi regression tests](../../test/nesting.launch.test.ts)
- [Gated delivery tests](../../test/runs.settlement.test.ts)
- [ADR-005](../adr/005-configure-per-session-concurrency-and-nesting.md)
