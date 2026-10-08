# Proposal

## Why

The inspector draws every line flush against the terminal edge. Section headings sit tight against the text around them. In the agent picker, a long task summary is cut off at the right edge, so the operator cannot read the task. A screenshot of the picker shows the cut-off task text and warning lines touching the left edge.

## What Changes

- The inspector keeps a small margin on all four sides (left, right, top and bottom) on both screens (picker and details). Each margin shrinks to zero when the terminal is too small to spare it.
- Section headings in the details screen get clear spacing: a blank line before and after each heading.
- In the picker, a long task summary wraps onto continuation lines under the agent line. A line cap keeps one agent from filling the screen. A truncated summary ends with an ellipsis.
- The "Tree observation incomplete" warning in the picker wraps in the same way.
- Row selection by mouse and keyboard keeps working for every wrapped line of a row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-tree-viewer`: the requirement "Present a themed readable inspector" changes. It no longer asks for full-width content. It asks for a margin on all four sides, spaced section headings and wrapped picker text.

## Impact

- `src/inspector.ts`: `treeLines` wraps task summary and warning lines. `renderView` applies the margin and takes the top and bottom rows from the body budget.
- `src/inspector-presentation.ts`: `body` and its `heading` helper add the spacing.
- `test/inspector.test.ts`, `test/inspector.presentation.test.ts`, `test/inspector.navigation.test.ts`: new cases for the four margins, wrapping, line cap and click mapping.
- No change to run state, saved output, shortcuts or configuration.
- The 4 KiB preview limit and the bounded-rendering rules stay as they are.
