# ADR-012: Separate management navigation and use single-column inspection

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

The maintainer wants to keep the expanded tintin-style agent tree and hide the duplicate below-editor management list.
Down currently enters selection with no configurable replacement. A non-null focus check mistakes Pi settings and selectors for the editor.

The inspector divides wide terminals into tree and detail panes. Up/Down select agents and page scrolling waits for saved evidence.
Its host callback discards the supplied theme, leaving unstyled detail text.

The preferred Ctrl+Shift+Down/Up pair already belongs to Pi 1.0.4 fullscreen message navigation.
OMPS must preserve effective Pi actions and operator-owned configuration.

## Decision

Add an independent `ui.showManagementList` boolean and configurable `ui.navigationDownKey`/`ui.navigationUpKey`.
Keep omitted values at true and Down/Up for existing operators. Expose these fields in the existing confirmed YAML settings flow.
Hiding the management list preserves the expanded tree and ends management selection.

Consume management keys only with verified editor ownership, an empty draft and a visible list.
Pass through when focus cannot be verified. Custom-key conflicts stay inactive with guidance; no silent fallback or host-file edits.
Document manual Pi remapping for the maintainer's preferred modified arrows.

Use one-column inspection at every width: a parent-first picker followed by full-width details.
Up/Down scroll details. PageUp/PageDown and Home/End also work before files load; Left/Right switch inspected agents.
Fullscreen mouse-wheel scrolling acts on the detail body. Position feedback and bottom-follow behaviour keep live content readable.

Use Pi's active theme and Markdown rendering for sanitised visible answers.
Show task, current observed tools, state, elapsed time, lineage and available saved output with distinct provisional and partial labels.
Reuse existing observation bounds and validated evidence reads. Add no full transcript, raw tool-content relay or history store.

Keep the existing process, permissions, result delivery, cleanup and sibling-capability boundaries.
The detailed contract is in the linked OpenSpec design and deltas.
This record replaces only inspector presentation inherited through ADR-007 and the coupled widget visibility and fixed management keys in ADR-009.
Their accepted text remains unchanged. Settings authority, permissions, observations and sibling ownership remain in force.

Verification passed on macOS with Pi 0.99.1 and 1.0.4 native fixtures. Linux and physical-terminal checks remain unrun.
Optional OMMS compatibility cases require the fixture's unavailable 4.8.0 entry. These checks are not reported as passed.

## Consequences

### Positive

- Passive tree monitoring can remain visible without below-editor rows or their input capture.
- Settings and selectors keep their keys even when no overlay exists.
- Full-width answers have keyboard scrolling while an agent is still running.
- Styling follows the active Pi theme and run status remains readable without colour.

### Negative

- The preferred modified arrows need operator remapping when Pi still owns them.
- A picker step replaces simultaneous tree and detail panes for general inspection.
- Unsupported custom-editor focus cannot enable management navigation safely.

### Neutral

- Existing version-1 YAML continues to work with its previous display defaults.
- Live assistant text stays bounded and provisional; saved final output remains authoritative.
- Hidden management rows do not change admission limits, run ownership or retained evidence.

## Alternatives Considered

| Option                                         | Rejected Because                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Collapse the tree to hide management rows      | Removes the expanded monitoring display the maintainer wants to keep.             |
| Add another combined `fleetView` mode          | Mixes the tree's expansion state with list visibility.                            |
| Override Pi fullscreen shortcuts automatically | Violates input ownership and changes operator settings without permission.        |
| Keep side-by-side panes and add page keys      | Preserves the cramped reading layout and does not resolve live-content scrolling. |
| Relay all tool arguments and results           | Broadens sensitive-content exposure beyond this display request.                  |

## References

- [Proposal](../../openspec/changes/archive/2026-10-08-refine-fleet-navigation-inspector/proposal.md)
- [Design](../../openspec/changes/archive/2026-10-08-refine-fleet-navigation-inspector/design.md)
- [Tasks](../../openspec/changes/archive/2026-10-08-refine-fleet-navigation-inspector/tasks.md)
- [Compact fleet and sibling boundaries](007-use-a-compact-fleet-with-independent-sibling-capabilities.md)
- [Tintin-style default tree](009-port-the-tintin-agent-tree-and-show-it-by-default.md)
- [Fleet input](../../src/fleet-view.ts)
- [Inspector](../../src/inspector.ts)
- [Pi terminal UI documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)
- [Pi keybindings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md)
