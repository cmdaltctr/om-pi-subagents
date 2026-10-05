# Tasks

Root-test reorganisation is an explicit non-goal. Move existing root tests, including `nesting.launch.test.ts`, into `test/` in a separate change.
That follow-up must update imports, fixtures, test discovery and documentation while preserving the tests that run.
The tasks below implement the viewer and settings only; they do not move existing test files.

## 1. Worktree, host contracts and operator settings

- [x] 1.1 Verify the approved feature worktree and merged PR #8 base; obtain installation permission before preparing dependencies and host packages; verify the initial implementation diff contains only the approved planning files.
- [x] 1.2 Add disposable interactive-host fixtures for native expansion, custom entries, fullscreen mouse dispatch and overlay focus on Pi 0.99.1 and 1.0.2; verify actual Ctrl+O dispatch, configurable hints and keyboard-only regular mode without personal settings.

- [x] 1.3 Add failing settings-persistence tests for validation, malformed files, YAML comments, unrelated fields, concurrent edits and failed atomic writes. Confirm the intended failures before implementing persistence.
- [x] 1.4 Implement safe writes to existing YAML limits and the separate XDG-aware display config. Verify failed saves preserve files and cache, with concurrent sessions supported.
- [x] 1.5 Add failing `/subagents-settings` dialog tests for displayed values, confirmation, cancellation, invalid syntax, missing registries and unavailable UI. Confirm failures against the current command registry.
- [x] 1.6 Implement the operator-only settings command using native Pi dialogs and lazy configuration access. Verify TUI and supported RPC flows without new model calls, processes or todo writes.
- [x] 1.7 Verify saved limits through real fresh-launch tests, including lower capacity, depth zero and inherited ceilings. Confirm admitted runs, cleanup and result delivery remain unchanged.
- [x] 1.8 Document the menu, save destinations, validation and per-parent branching in README, docs/USAGE.md and the operational skill. Verify examples against settings tests.

## 2. Descendant observation

- [x] 2.1 Add failing tests for identity, ancestry, cross-root rejection, cycles, revisions, duplicate tool ids, before-parent events, bounds and terminal-state regression; confirm each failure before implementing the observer.
- [x] 2.2 Implement bounded display-only observation validation and state; verify the new tests pass, overflow is labelled incomplete and no admission or run-control state changes.
- [x] 2.3 Add failing real-child tests for root-to-great-grandchild observation, out-of-order snapshots, excluded sensitive fields, failed subscriptions and unchanged pipe-loss handling; verify the current direct-only progress path cannot pass them.
- [x] 2.4 Relay validated observation snapshots through managed-parent RPC subscriptions and detach them on shutdown; verify real nested progress reaches only its owning tree without extra model turns, duplicate results or extended tool execution.
- [x] 2.5 Document display-only ancestry and immediate-parent control in docs/USAGE.md; verify the examples agree with ownership tests and that cleanup and launch documentation stay unchanged.

## 3. Expandable tree cards

- [x] 3.1 Add failing renderer tests for parallel roots, nested indentation, identical agent names, short completed runs, missing observations, configurable visible-agent bounds, hidden counts, live preference changes, Unicode width and unsafe terminal text; confirm failure against the current flat display.
- [x] 3.2 Implement a shared tree-card renderer for tool launches and TUI-only entries for slash-command launches. Apply cached display preferences to the compact widget and expanded cards; verify matching hierarchy, accurate total status counts and preserved final previews.
- [x] 3.3 Wire live invalidation and native expanded state without overriding Ctrl+O or replacing the editor; verify host-driven expansion, remapped keys, unrelated tool cards and session replacement through the disposable host fixtures.
- [x] 3.4 Declare the Pi TUI host peer and shipped viewer modules; update README and operational-skill tree examples; verify package contents, peer-only host dependencies and documented keybinding hints.

## 4. Safe detail loading and modal interaction

- [x] 4.1 Add failing detail-read tests for invalid or foreign ids, symlink escapes, oversized files, missing output, partial results and late reads after selection, close or session replacement; confirm each safeguard fails before implementation.
- [x] 4.2 Implement bounded lazy detail reads from validated run files; verify the tests pass without reading personas, authentication files, raw event logs or stderr.
- [x] 4.3 Add failing input and overlay tests for row clicks, keyboard selection, hidden retained agents, Enter, Escape, resize, focus restoration and inspection during active work; verify current OMPSS lacks those interactions.
- [x] 4.4 Implement the read-only modal with fullscreen row clicks and keyboard access in both modes. Verify every retained hidden agent remains accessible, execution continues while viewing and closing releases only viewer resources.
- [x] 4.5 Update docs/USAGE.md and the operational skill with inspection, truncation and task/output privacy guidance; verify documented actions against renderer and modal tests.

## 5. Commands, modes and todo coexistence

- [x] 5.1 Add failing command tests for inspect with or without ids, empty sessions, invalid syntax and foreign nodes; verify the current parser rejects inspect and existing command assertions still pass.
- [x] 5.2 Implement `/ompss inspect [run-id]` and mode guards, with bounded RPC text fallback; verify no new tool action, process, registry read in an empty session or model request occurs.
- [x] 5.3 Extend the real-package todo fixtures to exercise tree expansion, modal opening and OMPSS settings changes in normal and OpenSpec modes, in both load orders; verify todo widget keys, parent bindings, preferences and child-local task ids remain unchanged.
- [x] 5.4 Run and verify reminder, settlement, cancellation, cleanup and no-UI regressions alongside the new viewer; confirm result delivery and truthful terminal-state gates remain separate from display errors.
- [x] 5.5 Update public setup/install/uninstall guidance only where the viewer changes supported actions or shipped files; record ADR-006 and its index entry; verify local links and tooling claims without changing accepted decisions beyond any scoped supersession note.

## 6. Integration verification and close-out

- [x] 6.1 Run disposable end-to-end viewer and settings scenarios on macOS and Linux, covering both interactive modes, a great-grandchild, simultaneous roots, hidden-agent inspection, cancelled saves, concurrent settings edits, delayed reads and shutdown; verify saved settings, output, final results, modal focus and process cleanup; report any unavailable platform as a gap.
- [x] 6.2 Break lineage validation, terminal revision ordering, native expansion, modal selection isolation, viewer disposal, settings validation and write-conflict safeguards in disposable copies; verify their tests fail and keep deliberate breaks outside committed files.
- [x] 6.3 Obtain approval for the full gate and run bun run ci, bun run audit and Aikido on changed first-party files; verify results, retain the existing documented development-only audit exception and keep scanner evidence local.
- [x] 6.4 Run openspec validate add-agent-tree-viewer --strict and the verify workflow; verify requirements, scenarios and design against implementation evidence before archive approval.
- [x] 6.5 Archive the verified change with specs synced, commit implementation and planning artifacts together, and run the approved fresh-clone gate; verify its results before a separately authorised push or pull request.
