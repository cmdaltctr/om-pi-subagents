# ADR-007: Use a compact fleet with independent sibling capabilities

- **Date:** 2026-10-06
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

OMPSS 0.3.0 has an above-editor panel, a live tree card for each run and a saved-file inspector.
Parallel delegation consumes editor space and spreads navigation across those surfaces.
The maintainer wants the compact interaction of `tintinweb/pi-subagents`, with descendants visible on demand.

Todo already owns its tasks, OpenSpec bindings, reminders and widget.
OMMS owns shared project memory and its Pi recall/capture lifecycle.
Coupling OMPSS to either sibling's internal state would make normal sibling updates harder to support.

Pi reserves Ctrl+O for tool expansion. The current key parser treats the Tab byte as Ctrl+I too.
The reference's top-level fleet hides descendants and uses in-process sessions; OMPSS has native child processes.

## Decision

Use one below-editor fleet strip, collapsed to one content row by default.
Expansion shows bounded direct-agent rows. A single read-only modal contains retained descendants and selected details.
Keep compact transcript acknowledgements and move live hierarchy out of per-run cards.

Use Alt+O and Alt+I as configurable defaults with slash-command access.
Preserve native Pi expansion, editor input and todo shortcuts.
Reject unsafe bindings; do not bypass Pi's shortcut rules or depend on private focus fields.

Implementation facts from the settings work: Pi's extension-shortcut dispatch matches a Kitty
key release the same as its press, so each OMPSS shortcut handler ignores a repeat inside a
short guard window. Shortcuts register while the interactive session starts, before the host
snapshots editor bindings. OMPSS refuses a key that an effective built-in action still owns,
including Ctrl+O while `app.tools.expand` keeps its default; Pi's own diagnostics cover
collisions with other extensions. One declared shortcut that equals the other shortcut's
effective value is rejected as a duplicate.

Put UI fields and execution limits in the operator YAML.
Use `/ompss-settings` to edit that same file with confirmation, revision checks and atomic replacement.
Keep the older settings command as an alias.
Read the old visible-row JSON value only as a labelled fallback; import it into YAML only after confirmation.

Keep the existing process supervision, exact permissions, readiness and confirmed-cleanup gates.
Presentation consumes validated evidence and cannot change a result.
Relay only limited task labels and provisional visible assistant previews, not full conversations or raw tool content.

Keep both siblings optional and off in new child mappings unless explicitly configured.
Expose per-agent Memory/Todo switches through `/ompss-settings`, usable later without another OMPSS code change.
Each switch manages confirmed existing tool/resource lists; it adds no permission flag or shared integration store.
Show incomplete mappings as Partial and preserve existing explicit configurations.
Enablement validates installed resources; disabling removes the sibling entry and approval together for future launches.
Admitted children, other agents and parent extensions remain unchanged. Install no dependency automatically.
Preserve the existing isolated todo bootstrap. Parent tasks still require explicit verification and update.
Let OMMS choose memory scope from the child cwd; create no second memory store or direct memory-save path.
Use OMMS's existing child-process maintenance opt-outs without changing parent configuration.

No runtime dependency on sibling internals is introduced.
Real-package compatibility checks cover the small session-mode, tool, lifecycle and maintenance-flag contracts.

This decision replaces the presentation and display-storage choices in ADR-004 and ADR-006.
Their result-delivery, permission, observation and ownership constraints remain in force.

## Consequences

### Positive

- Parallel work has a fixed compact default footprint.
- Operators use one descendant inspection path.
- YAML and native settings agree on saved values.
- Operators can enable sibling capabilities later for selected agents.
- Sibling stores and task ownership stay independent.

### Negative

- The modal provides a limited live answer preview, not the reference's complete conversation.
- Shortcut changes need reload and custom extension collisions require distinct operator bindings.
- Optional memory-enabled children can incur OMMS embedding and capture costs.
- Resource identification and coherent removal need explicit confirmation when custom wrappers are ambiguous.
- Legacy preference import and package downgrade need clear operator guidance.

### Neutral

- Per-parent capacity still rejects excess launches; queueing remains outside this change.
- Observed descendants remain read-only to ancestors.
- Automatic memory capture remains OMMS evidence rather than proof of verified subagent completion.
- Linux OMMS integration remains unverified; macOS real-package tests passed and the Linux runner lacked optional OMMS.

## Alternatives Considered

| Option                                           | Rejected Because                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Copy the reference extension wholesale           | Would replace process boundaries and omit the descendant visibility the maintainer needs. |
| Add FleetView alongside the existing panel/cards | Would preserve duplicate state and excessive persistent content.                          |
| Hijack Ctrl+O or Ctrl+I                          | Would conflict with native expansion or Tab.                                              |
| Share sibling task stores or memory clients      | Would couple OMPSS to internal implementations.                                           |
| Keep another JSON for new UI settings            | Would give the operator multiple settings authorities.                                    |
| Add full conversation relay and steering now     | Would broaden sensitive content and input-control scope beyond this compact-view change.  |

## References

- [Proposal](../../openspec/changes/archive/2026-10-07-redesign-compact-fleet/proposal.md)
- [Design and evidence](../../openspec/changes/archive/2026-10-07-redesign-compact-fleet/design.md)
- [Tasks](../../openspec/changes/archive/2026-10-07-redesign-compact-fleet/tasks.md)
- [ADR-005: Concurrency and nesting](005-configure-per-session-concurrency-and-nesting.md)
- [ADR-006: Native agent trees](006-add-read-only-native-agent-trees.md)
- [Reference extension](https://github.com/tintinweb/pi-subagents/tree/e955e29c51b7a6cce37e1108cd2d6c57a77e151c)
