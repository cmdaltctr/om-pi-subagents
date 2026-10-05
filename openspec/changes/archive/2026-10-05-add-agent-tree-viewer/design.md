# Design

## Context

See [proposal.md](proposal.md) for the requested UI. PR #8 is merged; this change starts from that implementation.

`panel.ts` keeps a bounded direct-child widget. `notify.ts` reads saved output and delivers terminal results separately.
`RunManager` owns direct runs; `supervisor.ts` relays only their task tool start/end records to the panel.
Validated policy already carries `runId`, `parentRunId`, `depth` and `rootSessionId`.
The child RPC channel emits `entry_appended` records, currently used for readiness, guard and cleanup evidence.
Run directories already contain private configuration, status and output files.

Pi 0.99.1 and 1.0.2 support expanded-aware tool and custom-entry renderers, renderer invalidation, custom overlays and mouse components.
Their built-in expansion action is `app.tools.expand`, default Ctrl+O.
Mouse input belongs to Pi in fullscreen mode; regular mode leaves it to the terminal.
RPC cannot render custom terminal components. Children use RPC with `--no-session`, so an OpenCode-style switch into a persisted child session is outside this change.

## Goals / Non-Goals

**Goals:**

- Observe descendant work in the owning root's UI without changing immediate-parent authority.
- Keep background launch acknowledgement immediate and display updates outside model context.
- Reuse native expansion and modal APIs, including configured shortcuts and keyboard access.
- Bound memory, file reads and rendering independently of configured execution limits.
- Provide `/subagents-settings` using Pi's native dialogs, following todo's settings flow.
- Edit existing depth and per-parent child limits safely, with a separate preference for visible agents.

**Non-Goals:**

- Opening additional terminals, resuming child sessions or switching the main session into a child.
- Cancelling descendants individually from an ancestor viewer.
- Rendering raw tool arguments/results, thinking, stderr or provider credentials.
- Extending Pi's built-in `/settings` menu, adding YAML UI options, another process broker or a new runtime dependency.
- Changing todo task ownership, its widget key or its OpenSpec mode.
- Moving existing root-level tests into `test/`, including `nesting.launch.test.ts`. This cleanup remains an explicit follow-up.

The separate test-cleanup change must update imports, fixture paths, test discovery and documentation while preserving test coverage.
No existing test file moves as part of the viewer and settings work.

## Decisions

### 1. Add a display-only observation path

Keep `RunManager` as the source of authoritative direct-run states.
Create a small observation store separate from execution admission and result judgement.
Index each node by root session plus run id, with immutable parent and depth fields.
Track active tools by node and full tool-call id; use monotonically increasing revisions for snapshots.
Terminal state cannot regress after replay or out-of-order delivery.

In managed delegators, publish bounded snapshots through a new private custom-entry type.
A parent receives them through its existing child RPC subscription and forwards validated descendants towards the root.
Each hop rewrites the immediate connection token and retains validated lineage and node revision.
Validate against the connection's expected direct branch, root identity, registered parent and depth ceiling before accepting a node.
Reject malformed identities, conflicting parent assignments, cycles, foreign branches and oversized display records.
Correlating tokens identify the source connection; they do not create an operating-system sandbox.

The allowlisted snapshot contains identity, parent/session identifiers, depth, agent name, state, known model, timestamps and bounded tool names/ids.
It excludes task text, output bodies, raw arguments, raw results, thinking and stderr.
Task and output are read only after an operator selects a node.
Suppress irrelevant startup replay; valid display snapshots use a dedicated revision path.
An event arriving before its parent is known is retained briefly within a bounded queue or rejected with an incomplete-observation marker.

Use fixed implementation bounds, initially 256 observed nodes per owned root, four active tool names per node and a 16 KiB observation-record limit.
Overflow is visible and never changes admission. Retain incomplete evidence explicitly rather than inventing terminal states.
Use the existing RPC record bound in addition to the smaller display-message bound.
Reject invalid display metadata within valid RPC records without changing outcomes; actual transport errors and pipe loss retain their existing failure semantics.

**Alternative:** crawl all saved run directories on each render. Rejected because it adds filesystem work and stale cross-session discovery to the interactive path.

### 2. Use native expandable transcript cards

Add custom rendering for an `ompss run` result, keyed to its acknowledged run id.
The tool still returns immediately after admission; it does not remain open to stream UI.
The renderer consults the observation store and uses its supplied invalidation callback when a snapshot changes.
A slash-command launch appends a TUI-only custom entry with the same card renderer and stable identity.
Neither path inserts a progress message into model context.

Collapsed cards show the root's agent, state, short id and child count.
Expanded cards show the observed subtree with ASCII branch markers and bounded active tool names.
Retain full identifiers in the inspector even when a card shortens them for display.
The compact widget retains `live-run-panel` ownership, active-run priority and final-preview behaviour, with a configurable display bound.
It does not gain focus or consume todo's space or widget key.
Use the cached `maxVisibleAgents` preference for direct-run summaries and for node rows in each expanded card, including its root.
Keep parent rows before child rows and use stable ordering, so truncation never creates an orphaned branch.
Show the count of retained hidden nodes and an `/ompss inspect` hint. Distinguish hidden rows from observations lost to the retention bound.
Status counts include every active direct run. The inspector scrolls through all retained nodes, including those hidden in cards.

Use the renderer's `expanded` value and the configured `app.tools.expand` hint.
Do not register a replacement Ctrl+O shortcut or replace the main editor.
Preserve Pi's normal global tool-output expansion semantics.

Proposed expanded presentation:

```text
a-build running (run-id)
|- a-test running (child-id)
|  `- a-review completed (grandchild-id)
`- a-explore completed (child-id)
```

**Alternative:** intercept Ctrl+O to expand a widget. Rejected because widgets do not receive the native expanded flag, and replacing the shortcut risks unrelated tool output and editor behaviour.

### 3. Make the inspector a read-only overlay

Add `/ompss inspect [run-id]` as an operator command, not another tool action.
Without an id, show the current-session tree. With an id, validate membership and select that node.
Use `ctx.ui.custom(..., { overlay: true })` with a fresh component per interaction.
Arrow keys choose an agent, Enter shows its details and Escape closes the interaction.
Keep keyboard behaviour in fullscreen and regular modes.

In fullscreen mode, wrap rendered agent rows in mouse components whose handled click opens the selected node's modal.
Pi's mouse wrapper dispatches to the child component first, so row handlers can consume the click before ordinary tool-card expansion.
Leave unused click areas to the host's normal behaviour. Regular mode offers keyboard hints instead of claiming mouse support.
The overlay retains a breadcrumb to the selected node's parents and a bounded scrollable detail area.
Closing it releases UI subscriptions and reads only; it never cancels execution.

**Alternative:** navigate into the child's native session. Rejected because OMPSS children are headless RPC processes without persisted Pi sessions.

### 4. Read details lazily and safely

The observer supplies validated owner and run ids, not arbitrary file paths.
Resolve the selected node beneath the same private store root using constant filenames.
Check canonical paths, including symlinks, remain within the allowed run directory before reading.
Use a bounded read, initially 64 KiB per selected text view, with an explicit truncation marker and the saved output location.
Do not load all output into memory before applying the bound.

Show task, state, known model, active tool names and `output.md` when present.
Keep missing output labelled unavailable and failed output labelled partial.
Use the existing display sanitisation rules to remove terminal controls and directional overrides.
Do not read personas, authentication settings, raw event logs or stderr for the viewer.
Tasks and saved output can still contain sensitive text; inspection is an explicit operator action within the same session.

Use a selection generation and the live session binding to reject late reads after a node change, close or session replacement.
Rendering callbacks contain their own errors and never alter run outcomes.

### 5. Preserve mode, lifecycle and todo boundaries

Terminal cards and overlays run only when `ctx.mode === "tui"`.
RPC inspection uses a bounded textual view through supported notifications; JSON and print execution receive no terminal-only UI calls.
Existing list, run, status and cancel semantics remain unchanged, including bare status and direct-owner cancellation.

Register the new UI without I/O or background activity. Construct observation resources on first use.
Detach renderer listeners, close overlays and abort detail reads when the owning session ends.
Root result delivery still occurs once, after saved output, clean exit and confirmed subtree cleanup.
Display telemetry cannot change that judgement.
Keep the `om-pi-todo` bootstrap and both extension load orders intact.

**Alternative:** reuse todo's widget or task tree. Rejected because run lineage and todo ownership have different lifetimes and meanings.

### 6. Keep modules and dependencies small

Use focused root-level modules for observation validation/state, tree-card rendering, detail loading, modal interaction and settings.
Keep dialog handling separate from preference persistence.
Keep registration in `index.ts`, transport integration in `supervisor.ts`/`protocol.ts`, and existing result/persistence responsibilities intact.
Reuse `@earendil-works/pi-tui` from the host; declare it as a wildcard optional peer when imported.
Do not add it to runtime dependencies or copy UI implementations from another agent harness.

### 7. Follow todo's settings pattern with separate storage responsibilities

Register `/subagents-settings` as an operator-only command, outside the model-callable `ompss` tool.
Use `ctx.ui.select()`, `input()` and `confirm()`, as in `om-pi-todo`'s `src/settings.ts`.
Show current values, their save destinations and a Done option. Cancelling an input or declining confirmation changes nothing.
Each confirmed setting saves independently. Closing the menu does not undo an earlier confirmed save.
Use supported dialogs in TUI and RPC modes when `ctx.hasUI` is true. Otherwise report an actionable error before reading or writing settings.
Reject extra command arguments before accessing files. Do not register a replacement for Pi's built-in `/settings`.

| Menu item                           | Field and validation                                               | Save destination                        |
| ----------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| Maximum nesting depth               | `limits.maxDepth`: safe integer, at least zero; root depth is zero | Selected registry YAML                  |
| Parallel direct children per parent | `limits.maxConcurrentRuns`: safe integer, at least one             | Selected registry YAML                  |
| Visible agents                      | `maxVisibleAgents`: safe integer from 1 to 256, default 4          | `<config-dir>/pi-subagents/config.json` |

Use the existing registry-path resolution, including `OMPSS_REGISTRY`; display the resolved destination before confirming an execution-limit edit.
Keep YAML as the only source for execution limits. Reuse full registry validation and preserve agent mappings, resource paths and comments.
A missing registry requires explicit confirmation before creating a version-one file with `agents: {}` and the selected limits.
Refuse malformed or unreadable YAML; never overwrite it with defaults or silently reuse stale launch settings.
Write only the selected limit and preserve the other limit. Confirm the value and warn that nested branching can multiply process and provider load.

For display preferences, use absolute `XDG_CONFIG_HOME` when set, otherwise `~/.config`, matching todo's path convention.
Store only the visible-agent preference; never write todo's config or Pi's `settings.json`.
Load asynchronously on first settings or viewer use, with no file access during registration or rendering.
Render from a cache and repaint after a successful local save. Refresh on the next settings opening to pick up another session's changes.
Absent display config uses the default. Invalid display config reports a diagnostic and uses the default for rendering; saving requires fixing that file first.
Preserve unrelated JSON keys when merging a valid display file. Read-only settings failures leave the existing file and active runs unchanged.

Validate a proposed write before replacing its destination. Use a private temporary file and atomic replacement.
Coordinate read-merge-write operations across concurrent Pi sessions, and reject external edits made after the value was displayed.
Ask the operator to reopen settings on a conflict; never silently overwrite another session's value.
Any write lock is short-lived and scoped to the target file; it must not restrict Pi to one session.
Only update the preference cache and report success after the write succeeds. Contain settings errors within the command.

Saved execution limits apply through the existing fresh-configuration check on later launches.
Lowering a limit does not cancel admitted runs. A lower concurrency limit blocks new launches until capacity becomes available.
Existing branches retain their inherited depth ceiling; a saved increase applies to new branches and cannot raise an existing ceiling.
Depth zero disables new launches. Settings never grant the exact `ompss` permission to a mapped agent.
Display changes repaint the widget and tree cards without discarding observation state, changing admission or cancelling work.
Observation and detail-read safety bounds remain fixed regardless of the visible-agent preference.

**Alternative:** duplicate execution limits in JSON preferences or Pi's global settings. Rejected because launches already validate the operator's YAML.

## Risks / Trade-offs

- Missing or dropped descendant snapshots: show incomplete observation, with no invented state or execution side effect.
- Large trees or output: fixed bounds, scrolling and truncation markers; execution limits remain independent.
- Duplicate callbacks or stale renders: stable ids, revision ordering and live session/selection checks.
- Mouse differences across terminal modes: fullscreen mouse tests and keyboard access in both modes.
- Sensitive task/output text: lazy explicit inspection, safe paths and sanitised bounded rendering; warn in the usage guide.
- Host differences: exercise the pinned Pi 0.99.1 and current 1.0.2 contracts before relying on them.
- Shared settings files: preserve unrelated content, detect conflicting edits and verify atomic writes across disposable concurrent sessions.
- Larger saved execution limits: explain per-parent branching and require confirmation before changing the operator's YAML.

## Migration Plan

1. Implement in this feature worktree after proposal approval, using failing tests for each boundary.
2. Add the host peer, package file entries and public guide/skill updates with the implementation.
3. Record the UI decision in ADR-006; leave accepted ADR-004 and ADR-005 unchanged except scoped supersession notes if needed.
4. Verify keyboard and mouse behaviour on macOS and Linux with disposable settings and the real todo package.
5. Run approved CI, audit and security scans; validate the change strictly before archiving.

Existing mappings need no changes. Execution limits stay in their current YAML fields; a missing display preference keeps four visible agents.
Rollback removes the viewer, observation path and settings command while retaining the compact panel, run files and existing YAML limits.
Saved execution-limit edits remain operator configuration and must not be reset by rollback.

## References

- [Pi terminal UI](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/tui.md)
- [Pi expansion key](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/keybindings.md)
- [Pi subagent rendering example](https://github.com/earendil-works/pi/tree/v0.99.1/packages/coding-agent/examples/extensions/subagent)
- [Existing panel contract](../../specs/live-run-panel/spec.md)
- [ADR-005](../../../docs/adr/005-configure-per-session-concurrency-and-nesting.md)
- Todo's `src/settings.ts` and `src/preferences.ts`, inspected in the sibling `om-pi-todo` checkout. Reuse the pattern without changing todo.
