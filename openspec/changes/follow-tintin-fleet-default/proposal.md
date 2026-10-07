# Proposal

## Why

The fleet strip starts collapsed to one row. Only the toggle key expands it into the agent tree.
The shipped toggle key is Alt+O. On macOS, most terminals send Option+O as the character "ø" unless the operator enables Option as Alt.
The result: operators on macOS never see the agent tree, and the inspection key Alt+I fails the same way.

The maintainer wants the default behaviour of `tintinweb/pi-subagents`.
That widget shows the agent tree while agents run, hides it when they finish, and needs no modifier key to navigate.

## What Changes

- **BREAKING (display default):** the fleet shows the expanded agent tree by default while direct runs are active.
- Add the registry setting `ui.fleetView` with the values `expanded` (default), `collapsed` and `off`. Validate it in YAML and edit it in `/omps-settings`.
- The fleet widget clears 10 seconds after the last active direct run ends. Retained evidence stays available through `/omps inspect` and `/omps status`. This replaces the rule that kept one terminal summary row until the next launch.
- Add empty-prompt navigation. When the editor has focus and an empty draft and the fleet shows rows, Down enters fleet selection. Up and Down move the selection. Enter opens inspection at the selected run. Escape leaves selection and returns to the editor.
- Outside fleet selection, OMPS no longer takes Up, Escape or Enter. Pi keeps prompt history on Up and abort on Escape.
- **BREAKING (shortcut defaults):** `ui.toggleKey` and `ui.inspectKey` default to `off`. Operators opt in through YAML or `/omps-settings`. Saved explicit keys stay unchanged.
- Fix the built-in conflict check. It compares key strings exactly, so `ctrl+shift+o` does not match Pi's `shift+ctrl+o`. Normalise modifier order before comparison.
- Update the README, the public guides and the shipped operational skill. Explain the macOS Option-as-Alt setting for operators who choose Alt keys.
- Record the decision in ADR-009. It supersedes the collapsed-default and Alt-key parts of ADR-007.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `live-run-panel`: the fleet starts expanded by default, honours `ui.fleetView`, and clears after a fixed linger once no direct run is active.
- `agent-tree-viewer`: shortcut defaults become `off`, empty-prompt navigation is added, Escape and Up pass to Pi outside fleet selection, and conflict checks ignore modifier order.
- `omps-command-interface`: YAML and `/omps-settings` accept and edit `ui.fleetView`; the default shortcut values change.

## Impact

- Code: `src/config.ts`, `src/ui-settings.ts`, `src/settings.ts`, `src/settings-persistence.ts`, `src/fleet.ts`, `src/fleet-widget.ts`, `src/fleet-view.ts`, `src/shortcuts.ts`, `src/index.ts`.
- Tests: configuration, settings, shortcut, fleet, widget and interactive real-Pi suites. Several tests assert Alt+O and Alt+I today.
- Docs: `README.md`, `docs/SETUP.md`, `docs/USAGE.md`, `docs/INSTALL.md`, `skills/om-pi-subagents/SKILL.md`, new `docs/adr/009-*.md`.
- Operators who relied on the implicit Alt+O and Alt+I defaults must add the keys to YAML. Operators who saved explicit keys see no change.
- No change to launches, limits, supervision, saved output or result delivery.
