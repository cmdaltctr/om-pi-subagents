# Design

## Context

See `proposal.md` for the motivation and the delta specs for observable behaviour.
`index.ts` binds a parent context and routes tool and slash-command actions.
`RunManager` sends lifecycle snapshots. `supervisor.ts` consumes child records through a replaying subscription.
`notify.ts` currently updates one status line and sends a final result message.

The empty command input falls through to the usage warning in `registerOmpss`.
Child progress remains in RPC pipes and private logs, so Orca has only the parent terminal.
Pi 0.99.1 supports string-array widgets above the editor in both TUI and RPC UI contexts.
Configuration currently allows omitted thinking and the runner inherits the parent value.
The revised requirement makes thinking explicit for every mapped agent while leaving model inheritance optional.

## Goals / Non-Goals

**Goals:**

- Keep run rules, persistence and process cleanup independent from the panel.
- Track tool identities accurately and retain a useful final view for short runs.
- Keep the panel scoped to its live parent and latest run.

**Non-Goals:**

- Extra Orca terminals, separate child TUIs or concurrent OMPSS workers within one parent.
- Streaming thinking, tool arguments, raw tool results or full answers into the panel.
- New packages, settings, timers, persistence formats or resumed-run support.
- Automatic model fallback.

## Decisions

### Use one built-in string widget

Use `ctx.ui.setWidget` with the `ompss` key above the editor.
Keep the existing status entry for compatibility.
Built-in text widgets handle terminal width and work through RPC without importing a second renderer.
A custom component or Orca terminal would add lifecycle work without meeting an extra requirement.

A small pure panel module will own display state and safe bounded text.
It will track active calls by tool-call identifier, clear them at terminal states and render a short list of names.
It will retain neither arguments nor tool-result bodies.

### Relay task-phase tool events from the supervisor

Add an optional injected progress callback alongside the supervisor's existing observers.
Keep logging and result judgement unchanged.
Enable progress immediately before submitting the new task, after the startup replay has completed.
This excludes guard activity while preserving short task tools that arrive before prompt acknowledgement.
The callback will handle start and end events only; other records remain outside the panel path.

Callbacks receive run identity so the parent can enforce ownership and ignore older runs.
A metadata update must use the latest lifecycle snapshot rather than the supervisor's initial `starting` snapshot.

### Draw through the notifier and live session binding

Extend the injected messenger with an optional widget setter.
Recheck the live owner before each draw and after asynchronous output reads.
Wrap each UI operation independently so a failed status update cannot block the widget, or vice versa.
UI exceptions must not escape into the manager or supervisor.

Use the saved output already read by the terminal-notification path for a short safe preview.
Do not perform file reads for each tool event.
Retain terminal state until the next run; clearing it immediately would hide short runs again.
Keep the full answer and delivery record on their existing path.

Clear widget and status entries before detaching the old context during shutdown.
Drop late tool events and old preview reads, including reads that finish after another run starts.

### Make the empty command a status alias

Handle `args.trim() === ""` with the same service call as explicit `status`.
Keep other validation branches and notifications unchanged.
This needs no registry refresh or process launch and gives a useful answer in an empty session.

### Require thinking at the configuration boundary

Reject an omitted `thinking` field in `config.ts` before producing a launch snapshot.
Keep the existing allowed levels and make the snapshot's thinking field required.
The runner must use that value directly rather than selecting the parent's thinking level.
Model selection keeps its existing optional parent fallback.

Update valid mapping examples and fixture snapshots with deliberate thinking values.
Use `off` for non-reasoning fake-model fixtures. Keep omission only in tests that expect rejection.
An empty shipped registry still needs no agent-level fields.
Do not introduce an implicit default or a configurable fallback in this change.

## Risks / Trade-offs

- Older mappings can omit thinking. Document the required explicit value and report its field before launch.
- Child tool events can precede prompt acknowledgement. Gate on task submission and test the ordering explicitly.
- Parallel or nested ends can arrive out of order. Match supplied identifiers rather than using one current-tool slot.
- Async previews can finish late. Recheck live ownership and current run identity after awaiting output.
- Child or model text can contain controls. Render bounded plain text and test malicious control sequences.
- RPC clients can ignore widgets. Preserve status output and explicit status commands as fallbacks.
- A UI exception can interrupt synchronous lifecycle callbacks. Catch display failures at the observer boundary.

## Verification approach

Write failing tests before implementation in the existing index, notifier and supervisor suites plus a focused panel suite.
Reuse real-Pi fixtures to observe widget requests while a controlled tool remains active.
Keep the gate unchanged: formatting, lint, types and tests.
Use deliberate scratch failures to prove event relay, ID matching, ownership, safe text and bare-command handling.
Also prove missing-thinking rejection and explicit thinking selection while preserving optional model inheritance.

For the Orca check, start an isolated temporary parent loaded from local source and inspect its rendered screen.
Use a local fake model and a controlled slow tool so the running panel can be captured reliably.
Do not overwrite the installed extension or edit files outside the agreed project scope.

## Deployment and rollback

After successful verification, reload the chosen extension copy to use the new panel.
Stop active runs before reloading. Saved run files remain unchanged.
Add a supported `thinking` value to any mapping that omits it before using the updated extension.
Reverting this change restores the earlier UI, command behaviour and optional-thinking validation.
Keep session reports and any suppression evidence in ignored `docs/local-docs/`.
