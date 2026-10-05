# Proposal

## Why

OMPSS now supports nested delegation, but the main session shows only flat summaries of direct children. Operators need to see the parent-child tree and inspect an agent's work without leaving the main conversation.

## What Changes

- Add a current-session agent tree with direct runs as roots and observed descendants underneath them.
- Render expandable live tree cards using Pi's existing tool-output expansion action, whose default key is Ctrl+O.
- Open a read-only detail modal when an operator clicks an agent in fullscreen mode.
- Add `/ompss inspect [run-id]` for keyboard access, with arrow-key navigation, Enter to inspect and Escape to close.
- Show task, state, model, current tool names and bounded saved output in the selected agent's detail view.
- Relay validated descendant display metadata up the existing child RPC connections. Missing observations remain labelled incomplete.
- Preserve the compact widget, immediate-parent run controls, normal result delivery and the separate `om-pi-todo` widget.
- Add `/subagents-settings` using Pi's native selection, input and confirmation dialogs, following `/todo-settings` in `om-pi-todo`.
- Let operators edit existing `limits.maxDepth` and `limits.maxConcurrentRuns` in their selected registry YAML. Concurrent direct children and parallel agents use the same per-parent limit.
- Save a separate display preference for how many agents appear in the compact widget and each expanded tree card. Show a hidden count and keep retained hidden agents accessible through `/ompss inspect`.
- Keep regular-terminal and RPC clients usable through keyboard or plain-text fallbacks. Viewing work starts no process or model turn.

This is an additive UI and settings change. It adds no YAML field, mapped tool or runtime package dependency.
Execution limits keep their existing validation and launch semantics. Display preferences use a separate config file, following todo's pattern.

## Non-Goals and Follow-up

Root-test cleanup is explicitly deferred from this change. A separate change must move root-level tests, including `nesting.launch.test.ts`, into `test/`.
That follow-up must update relative imports, fixture paths, test discovery and documentation, then verify the same tests still run.
This change records the cleanup requirement; it does not move existing test files.

## Capabilities

### New Capabilities

- `descendant-run-observation`: Observe descendant lineage and status within an owned run's subtree without granting ancestor control.
- `agent-tree-viewer`: Expand current-session run trees and inspect selected agents through a bounded, safe terminal viewer.

### Modified Capabilities

- `ompss-command-interface`: Add a read-only `inspect` subcommand and the operator-only `/subagents-settings` command while retaining the meaning and ownership of existing commands.

The existing `live-run-panel` requirements remain intact: the new tree cards complement its bounded summary widget.

## Impact

- Runtime hooks in `index.ts`, `supervisor.ts` and `protocol.ts` need a display-only observation path. Result judgement and launch permission rules stay unchanged.
- New focused modules own observation state, tree rendering, the modal, settings dialogs and safe preference writes. `panel.ts` uses the configured display bound; `notify.ts` retains its existing responsibility.
- Pi's tool and entry renderer APIs, `ctx.ui.custom()` overlays and fullscreen mouse components supply the UI. Declare the Pi TUI package as a host peer when imported.
- Tests cover real nested progress, both Pi UI modes, configurable expansion keys, delayed detail reads, foreign-session isolation and real todo coexistence.
- Settings tests cover cancelled dialogs, invalid values, preserved YAML content, concurrent edits, failed writes, hidden-agent access and unchanged active-run lifetimes.
- Update public guides, the packaged operational skill and an architecture decision record during implementation.
- No change to `om-pi-todo`, its OpenSpec bindings or its child-local normal-mode bootstrap.
