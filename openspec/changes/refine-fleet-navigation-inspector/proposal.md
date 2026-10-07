# Proposal

## Why

Operators want the expanded agent tree without the duplicate management list or keys that interfere with Pi settings. The inspector splits its width between a tree and details, uses arrows for selection, and blocks page scrolling until saved details load.

## What Changes

- Add **Management list: Show/Hide** to `/omps-settings`, backed by `ui.showManagementList`. Hiding it preserves the expanded above-editor tree and stops below-editor selection input.
- Add separately configurable `ui.navigationDownKey` and `ui.navigationUpKey`, including `off`. Omitted values retain Down/Up for compatibility. Hints show the effective keys.
- Support Ctrl+Shift+Down/Up after the operator frees conflicting Pi actions. Explain the exact conflict and manual remedy; never change Pi bindings automatically.
- Fix editor-focus checks so Pi settings, selectors, inputs and other overlays receive their own keys.
- Replace the inspector's side-by-side layout with a single-column agent picker and full-width detail screen at every width.
- Make details scroll with Up/Down, PageUp/PageDown and Home/End before saved files finish loading. Support fullscreen mouse-wheel scrolling and a visible position indicator.
- Give the inspector Pi theme colours, clear headings, wrapped tasks, Markdown answers, current activity and elapsed time. Preserve live-preview Markdown line breaks within the existing 4 KiB and privacy limits. Preserve scroll position during live updates unless the operator follows the bottom.
- Keep visible assistant previews provisional. Use saved output for final answers; preserve existing content limits, privacy and ownership checks.
- Update public guidance, the shipped operations skill and a new Proposed decision record.

## Capabilities

### New Capabilities

None. Existing fleet and viewer capabilities own these behaviours.

### Modified Capabilities

- `live-run-panel`: Make the management list optional independently of the expanded tree.
- `agent-tree-viewer`: Configure management-list keys, protect actual editor focus, and provide themed single-column inspection with reliable scrolling and live activity.

## Impact

- Configuration and settings: `src/config.ts`, `src/ui-settings.ts`, `src/settings.ts`, `src/settings-persistence.ts` and `src/shortcuts.ts`.
- Fleet rendering and input: `src/fleet.ts`, `src/fleet-view.ts`, `src/fleet-widget.ts` and `src/index.ts`.
- Inspector and host integration: `src/inspector.ts`, small responsibility-based presentation helpers if needed, and `src/viewer.ts`.
- Preview sanitisation: `src/plain.ts`, `src/observation-relay.ts` and `src/observation-validation.ts`, preserving Markdown line breaks without new fields or content sources.
- Tests: existing configuration/settings, fleet/shortcut, inspector, interactive harness, documentation and packaging suites.
- Documentation: `README.md`, relevant public guide sections, `skills/om-pi-subagents/SKILL.md` and `docs/adr/`.
- No new dependencies, launch controls, event-history store, tool-content relay or changes to child permissions.
- Existing version-1 YAML remains valid. No live operator files are changed during planning or implementation without permission.
