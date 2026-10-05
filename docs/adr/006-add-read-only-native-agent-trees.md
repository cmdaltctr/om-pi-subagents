# ADR-006: Add read-only native agent trees and operator settings

- **Date:** 2026-10-05
- **Status:** Proposed
- **Deciders:** Project maintainer

## Context

Parallel delegation needs a view of descendants while preserving immediate-parent control.
The compact widget already reports direct runs and final previews. Todo owns a separate widget and preference store.
Pi supplies native tool expansion, custom entries and overlays on the supported hosts.

Operators also need confirmed edits to execution limits and a separate display bound.
Existing YAML remains the source for launch limits. Registration must perform no file access or process launch.

## Decision

Use the same bounded tree component for tool results and TUI slash-launch entries.
Leave `app.tools.expand` with Pi, including its default Ctrl+O and configured hints.
Use native overlay focus for read-only inspection, with keyboard navigation in both interactive modes.
Fullscreen additionally dispatches row clicks. RPC clients receive bounded text.

Keep observed ancestry in a display-only store. Bind child sessions through correlated `get_state` replies.
Each hop checks owner and branch identity before retaining snapshots.
Revisioned temporary evidence can clear after recovery; permanent loss stays labelled.
Observation failures cannot decide run outcomes or grant control authority.

Read selected task and output files lazily, with path checks and a 64 KiB bound per file.
Selection generations and abort signals prevent late results from reaching another view or session.
Result delivery retains its existing lifecycle gates and immediate-parent routing.

Use native dialogs for `/subagents-settings`. Save execution limits to existing registry YAML.
Keep the visible-agent preference in XDG-aware `pi-subagents/config.json`, with a default of four.
Confirmed atomic writes detect conflicting edits and preserve unrelated fields.
Rendering reads a cache; fresh launches continue to honour inherited depth ceilings.

Pi supplies the TUI package as an optional wildcard peer. No runtime package dependency is added.
Todo's keys, preferences and parent task bindings remain separate.

## Consequences

### Positive

- Operators can inspect hidden retained descendants without changing execution.
- Native expansion and focus follow the host's existing controls.
- Confirmed settings edits preserve the launch and cleanup boundaries.

### Negative

- Bounded observation can omit evidence. The view must state that limitation.
- Saved tasks and outputs can contain sensitive text, including in screenshots or RPC responses.
- Host compatibility requires disposable tests on both supported Pi versions and interactive modes.

### Neutral

- The compact widget remains available beside expandable cards.
- Existing branches retain their captured depth ceilings after a settings save.
- Status and cancellation continue to belong to the immediate parent.

## Alternatives considered

| Option                               | Rejected because                                                      |
| ------------------------------------ | --------------------------------------------------------------------- |
| Replace the editor and own Ctrl+O    | Would interfere with host expansion and unrelated tool cards.         |
| Show progress through model messages | Would add model turns and mix observation with result delivery.       |
| Reuse todo's preference file         | Would couple operator settings to another extension's task ownership. |
| Add a new runtime UI package         | Pi already supplies the required native components.                   |

## References

- [Native viewer](../../viewer.ts)
- [Read-only inspector](../../inspector.ts)
- [Observation validation](../../observation-validation.ts)
- [Observation relay](../../observation-relay.ts)
- [Bounded detail reads](../../details.ts)
- [Settings persistence](../../settings-persistence.ts)
- [Usage and privacy](../USAGE.md#agent-trees-and-inspection)
- [ADR-004: Parent-owned widget](004-show-child-progress-in-a-parent-owned-widget.md)
- [ADR-005: Concurrency and nesting](005-configure-per-session-concurrency-and-nesting.md)

This decision changes the visible-row policy recorded by ADR-004 and ADR-005 to an operator preference, default four.
Their execution, ownership and delivery decisions remain in force. Acceptance waits for the change's final verification.
