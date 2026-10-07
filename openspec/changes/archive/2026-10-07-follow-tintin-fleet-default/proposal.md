# Proposal

## Why

The fleet strip starts collapsed to one row. Only the toggle key expands it into the agent tree.
The shipped toggle key is Alt+O. On macOS, most terminals send Option+O as the character "ø" unless the operator enables Option as Alt.
The result: operators on macOS never see the agent tree, and the inspection key Alt+I fails the same way.

The maintainer wants the look and default behaviour of `tintinweb/pi-subagents`.
A first pass showed flat rows below the editor. In a real Orca session the maintainer saw nothing like tintin's tree and asked for a close port of tintin's widget instead.
`tintinweb/pi-subagents` is MIT licensed. Its widget code can be adapted with credit.

## What Changes

- **BREAKING (display default):** port tintin's `● Agents` tree widget (`src/ui/agent-widget.ts`, commit `e955e29`) close to verbatim and show it **above the editor** while direct runs are active. It has `├─` and `└─` connectors, two lines for each running agent (spinner, name, task, tool uses and elapsed time, then a `⎿ activity` line), `✓`, `✗` and `■` finished lines, and a 12-line cap with a `+N more` row.
- Keep a separate below-editor agent list for keyboard navigation. Align it with tintin's `src/ui/fleet-list.ts`: a hint row, `●` for the selected row and `○` for the others, and `↑ N more` and `↓ N more` window markers.
- Replace the 10-second clear with tintin's linger rules. Finished agents stay in the tree until the parent's next turn starts. Failed and cancelled agents stay for two turns. Finished agents stay in the below-editor list for 4 seconds.
- Add the registry setting `ui.fleetView` with the values `expanded` (default), `collapsed` and `off`. `collapsed` shows only the tree heading. `off` shows neither widget. Validate it in YAML and edit it in `/omps-settings`.
- Add a per-run tool-use count from observed tool starts. Pass the existing assistant preview to the tree for the activity line.
- Add empty-prompt navigation. When the editor has focus and an empty draft and the list shows rows, Down enters selection. Up and Down move the selection. Enter opens inspection at the selected run. Escape leaves selection.
- Outside selection, OMPS no longer takes Up, Escape or Enter. Pi keeps prompt history on Up and abort on Escape.
- **BREAKING (shortcut defaults):** `ui.toggleKey` and `ui.inspectKey` default to `off`. Saved explicit keys stay unchanged.
- Fix the built-in conflict check. Normalise modifier order before comparison, so `ctrl+shift+o` matches Pi's `shift+ctrl+o`.
- Compact `omps list`. Show one line for each agent, for example `a-researcher: 24 tools (read-only)`. The tool result keeps the full list for the model and shows it to the operator only when the tool output is expanded with Ctrl+O.
- Credit tintin. Each ported file starts with `Adapted from tintinweb/pi-subagents (MIT), commit e955e29`. Add `THIRD_PARTY_NOTICES.md` with tintin's licence text and ship it in the package.
- Update the README, the public guides and the shipped operational skill. Record the decision in ADR-009.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-run-panel`: an above-editor tintin-style tree plus a below-editor navigation list, tintin linger rules, `ui.fleetView`, and tool-use counts with activity lines.
- `agent-tree-viewer`: shortcut defaults become `off`, empty-prompt navigation uses tintin's list markers, Escape and Up pass to Pi outside selection, and conflict checks ignore modifier order.
- `omps-command-interface`: YAML and `/omps-settings` accept and edit `ui.fleetView`, default shortcut values change, and `list` output becomes compact.

## Impact

- Code: `src/config.ts`, `src/ui-settings.ts`, `src/settings.ts`, `src/settings-persistence.ts`, `src/fleet.ts`, `src/fleet-widget.ts`, `src/fleet-view.ts`, `src/shortcuts.ts`, `src/service.ts`, `src/index.ts`, `src/observation-relay.ts`, and a new ported `src/agent-tree-widget.ts`.
- Packaging: `package.json` `files`, `test/release.test.ts` allow-list, new `THIRD_PARTY_NOTICES.md`.
- Tests: configuration, settings, shortcut, fleet, widget, service list, release and interactive real-Pi suites.
- Docs: `README.md`, `docs/SETUP.md`, `docs/USAGE.md`, `docs/INSTALL.md`, `skills/om-pi-subagents/SKILL.md`, new `docs/adr/009-*.md`.
- Operators who relied on the implicit Alt+O and Alt+I defaults must add the keys to YAML.
- No change to launches, limits, supervision, saved output or result delivery.
