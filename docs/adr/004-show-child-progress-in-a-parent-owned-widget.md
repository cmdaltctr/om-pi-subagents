# ADR-004: Show child progress in a parent-owned widget

- **Date:** 2026-10-01
- **Status:** Accepted
- **Deciders:** Project maintainer
- **Partly superseded by:** [ADR-005](./005-configure-per-session-concurrency-and-nesting.md) for the single-current-run display choice; this record's ownership, saved-output and cleanup safety rules remain in force.

## Context

OMPSS children use RPC pipes and have no interactive terminal. Tool activity stays in private run logs.
The parent needs a compact view that remains useful when a run finishes quickly.
Display work must preserve the rules for ownership, saved output and process cleanup.

## Decision

Use Pi's built-in string-array widget above the parent editor. Keep the existing status entry.
A small display module tracks calls by identifier and bounds tool names and output previews.
It retains no tool arguments or result bodies.

The supervisor relays tool start and end events after startup replay, immediately before task submission.
This includes task events that arrive before prompt acknowledgement.
Such a tool can first appear while the run is still `starting`. It stays visible after the change to `running`.
The notifier draws through the live parent binding and rechecks ownership after reading saved output.
A result sent after the session has ended is rejected, so its delivery record shows a failure.
Each UI operation contains its own exceptions. Display failures cannot change the run outcome.

Use the existing terminal result path to read saved output once for both the preview and full message.
Retain the latest final panel until another run starts or the session ends.

## Consequences

### Positive

- Interactive Pi and RPC clients receive the same compact text display.
- Supervision and persistence keep their existing responsibilities.
- Terminal controls are removed from names and previews without changing saved output.

### Negative

- RPC clients can ignore widgets. The status line and `/ompss` remain available.
- The panel shows only a short preview. Operators read `output.md` for the complete saved answer.
- Tests cannot assume the prompt response arrives before the first tool event. See [TDR-002](../tdr/002-allow-tool-events-before-the-prompt-response-in-tests.md).

### Neutral

- No renderer dependency, child terminal, timer or new persistence format is needed.
- Cancelled runs retain their state without an automatic result message.

## Alternatives Considered

| Option                   | Rejected because                                                                 |
| ------------------------ | -------------------------------------------------------------------------------- |
| Separate Orca terminals  | Adds terminal ownership and shutdown work to children that already use RPC.      |
| Custom Pi component      | Adds rendering work without a requirement for input or custom layout.            |
| Stream raw child records | Exposes arguments and result bodies and would mix progress with result delivery. |

## References

- [Panel state](../../src/panel.ts)
- [Notifier](../../src/notify.ts)
- [Supervisor](../../src/supervisor.ts)
- [Usage](../USAGE.md)
- [Pi widget example](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/examples/extensions/widget-placement.ts)
