# ADR-013: Keep a margin and wrap text in the inspector

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

The inspector places content against the terminal edges. Its picker cuts long task summaries and observation warnings at the right edge.
Section headings need more space around them.

Both the picker and details use one column. Small terminals must keep the selected agent visible and preserve the footer hint when space permits.
Wrapped lines must keep their agent identity for mouse selection.

## Decision

Apply the four-side margin once in `renderView` in `src/inspector.ts`.
At widths of at least 40 columns, reserve 2 columns on each side. Below 40 columns, use no horizontal margin.
At heights of at least 10 rows, reserve 1 blank row at the top and bottom. Below 10 rows, use no vertical margin.
Render the header, body and footer inside these margins. Subtract the margin rows from the body budget.

Use Pi's existing `wrapTextWithAnsi` helper for picker task summaries and observation warnings.
Indent summary continuation lines to match their agent row. Bound displayed indentation to reserve 12 content columns for deep branches. Limit each summary to 3 lines.
When text remains beyond that cap, end the last line with an ellipsis through `truncateToWidth`.
Keep the existing rule that hides summaries when the available content width is below 30 columns.

Wrap warnings fully without a separate line cap or ellipsis. The available picker body still limits visible lines.
Keep warning wording and colour. Associate every visible continuation line with its agent for mouse selection.

Give each details section heading a blank line before and after it.
A heading at the start of the body has no leading blank line.
Keep the footer hint visible at heights of at least 2 rows. At height one, give the selected agent row priority and omit the footer.

This decision partly supersedes ADR-012's full-width inspector content. Its one-column layout and navigation decisions remain in force.
Commands, keys and settings stay unchanged. Run state, saved output and the 4 KiB preview limit keep their existing rules.

No terminal-specific behaviour requiring a workaround was found during this change. Skip the TDR and leave its index unchanged.

## Consequences

### Positive

- Margins separate inspector content from terminal edges on both screens.
- Wrapping exposes more task text and preserves warning text within the available picker body.
- Heading spacing separates sections from their content.
- Continuation-line clicks keep selecting the correct agent.

### Negative

- Margin rows and wrapped text reduce the number of agents visible at once.
- Summaries longer than 3 lines still need the details screen for reading.
- Tests that assert exact lines or mouse coordinates need deliberate updates.

### Neutral

- Fixed sizes and cutoffs add no operator settings.
- Small terminals omit each margin independently according to width and height.
- ADR-012 retains its accepted text; its index entry records the partial supersession.

Expected touched files for the complete change:

- `src/inspector.ts`
- `src/inspector-presentation.ts`
- `test/inspector.test.ts`
- `test/inspector.navigation.test.ts`
- `test/inspector.presentation.test.ts`
- `test/docs-refinement.test.ts`
- `test/inspect.command.test.ts`
- `docs/adr/013-keep-a-margin-and-wrap-text-in-the-inspector.md`
- `docs/adr/ADR_README.md`
- `docs/USAGE.md`
- `README.md`
- `skills/om-pi-subagents/SKILL.md`
- `openspec/changes/archive/2026-10-08-pad-inspector-layout/design.md`
- `openspec/changes/archive/2026-10-08-pad-inspector-layout/specs/agent-tree-viewer/spec.md`
- `openspec/changes/archive/2026-10-08-pad-inspector-layout/tasks.md`
- `openspec/specs/agent-tree-viewer/spec.md`

## Alternatives Considered

| Option                                               | Rejected Because                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Keep edge-to-edge content and truncate picker text   | Leaves long tasks and warnings difficult to read.                    |
| Apply padding separately in each presentation helper | Repeats the margin rule and risks different layouts between screens. |
| Wrap summaries without a line cap                    | Lets one long task consume the picker body.                          |
| Cap warnings like summaries                          | Hides observation warnings that explain missing evidence.            |
| Keep margins at every terminal size                  | Uses space needed for the selected agent and footer hint.            |

## References

- [Design](../../openspec/changes/archive/2026-10-08-pad-inspector-layout/design.md)
- [Inspector spec delta](../../openspec/changes/archive/2026-10-08-pad-inspector-layout/specs/agent-tree-viewer/spec.md)
- [Tasks](../../openspec/changes/archive/2026-10-08-pad-inspector-layout/tasks.md)
- [ADR-012](012-separate-management-navigation-and-use-single-column-inspection.md)
- [Inspector](../../src/inspector.ts)
- [Inspector presentation](../../src/inspector-presentation.ts)
- [Usage](../USAGE.md#agent-trees-and-inspection)
