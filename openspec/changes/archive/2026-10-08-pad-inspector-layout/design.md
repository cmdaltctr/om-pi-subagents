# Design

## Context

`renderView` in `src/inspector.ts` builds the header, body and footer. The picker body comes from `treeLines`. It makes one line per agent plus one task-summary line and one optional warning line. Each is cut with `truncateToWidth`, so long text is lost. `renderedPickerKeys` holds one agent key per rendered line. Mouse clicks use it to find the clicked agent.

The details body comes from `body` in `src/inspector-presentation.ts`. Its `heading` helper adds one blank line before a heading and none after. All lines use the full width.

## Goals / Non-Goals

**Goals:**

- Give both screens a small horizontal margin.
- Space section headings clearly.
- Wrap long task summaries and picker warnings, with a three-line cap on summaries only.

**Non-Goals:**

- No change to key bindings, run state, saved output or the 4 KiB preview bound.
- No box or border drawing around the inspector.
- No change to the fleet widget or the status line.

## Decisions

### 1. One margin applied in `renderView`

`renderView` computes a horizontal margin `x = width >= 40 ? 2 : 0` and a vertical margin `y = height >= 10 ? 1 : 0`. It passes `width - 2 * x` to `treeLines` and the scroll content, and adds `x` spaces to the left of every returned line. It takes `2 * y` rows from `bodyBudget` and adds one blank row at the top and one at the bottom. Header and footer sit inside the margin. This keeps the rule in one place. Both screens and both helpers stay unaware of it.

Alternative: pad inside each helper. Rejected because it repeats the rule and risks drift between screens.

The values are assumptions. The user asked for padding on left, right, top and bottom without numbers. The constants (2 columns, 40 columns, 1 row, 10 rows) sit at the top of the file, so a later change is one line each.

### 2. Wrap with the host's `wrapTextWithAnsi`

`inspector-presentation.ts` already imports `wrapTextWithAnsi`. The picker uses it for the task summary and the warning. The summary lines are indented to match the agent line. Displayed indentation is bounded to reserve 12 content columns for names and wide characters on deep branches. A cap of 3 lines per summary applies. If text remains, the last line ends with an ellipsis through `truncateToWidth`.

Warnings wrap fully without a separate line cap or ellipsis. The available picker body still bounds visible lines.

The picker budget already counts lines per row. Wrapped rows fit it because `treeLines` pushes the row key once per shown line.

### 3. Heading spacing

`heading` adds a blank line before a non-first heading and a blank line after it. The first heading has no leading blank line. Existing scroll maths uses line counts from `scroll.render`, so it needs no change.

### 4. Small terminals

Below 40 columns the horizontal margin is zero. Below 10 rows the vertical margin is zero. The footer hint keeps its row at heights of at least two. At height one, the selected agent remains visible and the footer is omitted. The existing rule that hides the summary below 30 columns stays. Wrapping never makes a line wider than the width.

## Risks / Trade-offs

- Wrapping and the two margin rows show fewer agents per screen. The line cap and the 10-row cutoff bound this.
- Existing tests that assert exact line output will change. Each such test needs a deliberate update, not a loosened assertion.
- The user may want a different margin or cap. The constants make it a small edit.
