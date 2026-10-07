# Proposal

## Why

OMPSS spreads agent activity across an above-editor panel, per-run tree cards and a separate inspector. Parallel work takes too much editor space, and the user wants the compact fleet interaction of `tintinweb/pi-subagents` with visible descendants and dependable memory/todo coexistence.

## What Changes

- Replace the persistent multi-row panel with one below-editor fleet strip. It starts collapsed to one content row, regardless of active-run count.
- Let an operator expand a bounded, keyboard-accessible list of direct agents. Each row shows the task summary, state, elapsed time and current tool activity. Every active root remains reachable through scrolling.
- Use one read-only modal for the complete retained descendant tree and selected details. It updates while agents run, supports keyboard navigation in both terminal modes, and permits row clicks in fullscreen mode.
- Add a bounded live preview of visible assistant text to selected details. Keep the submitted task and saved final output available there. Label previews as provisional; omit tool arguments, raw results, hidden thinking and stderr.
- Propose Alt+O for fleet expansion and Alt+I for inspection. Both are configurable or can be disabled. Preserve Pi's Ctrl+O action and todo's shortcuts. The user's suggested Ctrl+I conflicts with Tab on legacy terminals.
- Add `/ompss fleet` as a shortcut-independent entry point. Preserve `/ompss inspect [run-id]` and existing execution commands.
- Add `/ompss-settings` as the canonical settings command. Retain `/subagents-settings` as an alias during this change.
- Put display bounds and shortcut settings in the operator's `om-pi-subagents.yaml`, beside execution limits. The command edits that same file with confirmation and conflict checks.
- **BREAKING presentation change:** replace expandable per-run live trees with compact launch acknowledgements. Hierarchy moves to the session modal. Historical `ompss-tree` entries keep a bounded renderer.
- **BREAKING preference-location change:** stop writing the separate display JSON. Preserve its existing visible-agent value through a read-only compatibility fallback and offer an explicit import into YAML. YAML wins when it declares the value.
- Keep `om-pi-todo` and `om-memory-system` optional and off for new agent mappings. Add per-agent Memory and Todo switches in `/ompss-settings`, usable after installation or later without another OMPSS code change.
- Make each switch edit the selected agent's existing `tools`, `extensions` and optional `skills` lists after confirmation. Enablement validates operator-selected installed resources; disabling removes the approved capability and its mapped sibling resources for future launches. Preserve existing explicit mappings and parent extension settings.
- Add compatibility checks for both siblings without importing their internal state, creating a second memory store or adding runtime dependencies on them.
- Update `README.md`, the public setup/install/usage/uninstall guides, ADR-007 and its index, and the bundled `skills/om-pi-subagents/SKILL.md` in this change. Verify the revised skill is shipped through package `files`/`pi.skills` and discoverable after a disposable package installation.

## Capabilities

### New Capabilities

- `memory-compatibility`: default-off child memory, later settings enablement, real OMMS project scoping, lifecycle coexistence and limits on coupling.

### Modified Capabilities

- `live-run-panel`: one-row default fleet, bounded expansion and compact terminal summaries.
- `agent-tree-viewer`: a session-wide descendant modal, live answer previews, independent fleet shortcuts, bounded historical entries and updated operator guidance/packaged skill.
- `descendant-run-observation`: bounded task labels and assistant previews over the existing validated display path.
- `ompss-command-interface`: `/ompss fleet`, `/ompss-settings`, unified YAML display settings, confirmed per-agent capability switches and explicit preference migration.
- `todo-compatibility`: default-off child todo, later settings enablement, protected task ownership and shortcuts; keep the existing bootstrap as the sole narrow compatibility seam.

## Impact

The change affects OMPSS presentation, observation metadata, configuration validation, operator settings, tests and public guides. Its native child processes, readiness checks, exact tool permissions, per-parent capacity, inherited depth limits, saved-result gates and cleanup blocking remain in place.

No implementation changes are planned in `om-pi-todo` or OMMS. No scheduling, workflow language, automatic worktree creation, agent-session switching, steering UI, automatic parent task completion or new memory backend is included. Existing excess-launch rejection remains unchanged. Test reorganisation and unrelated refactoring are outside scope.

The reference investigation used `pi-subagents` commit `e955e29`, version 0.19.0. Its four focused UI suites passed 147 tests in a disposable checkout using Pi 0.84.2. A synthetic component demonstration exercised list navigation and the conversation overlay. These checks do not verify this proposed OMPSS implementation or sibling integration.
