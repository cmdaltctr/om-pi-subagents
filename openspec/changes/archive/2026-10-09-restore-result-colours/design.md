# Design

## Context

See `proposal.md` for the reported regression. `src/result-message.ts` returns a retained component whose `render()` reads both expansion states. Its final plain `Text` component supplies no background or hint styling.

Pi's custom-message component gives custom renderers full control of their appearance. The default purple box applies only when no custom component is returned. Pi's shipped message-renderer example uses `Box`, `options.outputPad` and `theme.bg("customMessageBg", ...)`.

The existing unit harness supplies an empty theme. The real-Pi fixture strips colour escape codes before its assertions, so neither catches missing styles.

## Goals / Non-Goals

**Goals:** Keep the existing retained-component redraw contract while restoring theme-aware styles. Cover real terminal output, including wrapping and expansion.

**Non-Goals:** Change Markdown rendering, headings, shortcuts, line limits, delivery or live operator settings. Add no palette settings or dependencies.

## Decisions

### Use the host's panel component and semantic colours

Accept the renderer's theme argument. Compose a `Box` with `options.outputPad`, one row of vertical padding and `customMessageBg` during rendering. Keep the result body in a zero-padding `Text` child.

Use `warning` for a separate hint `Text` child. Keep colouring outside the stored message string. The whole hint needs one foreground style, including key names and wrapped rows.

Hard-coded purple and yellow would ignore the operator's theme and terminal capabilities. The host defaults provide the requested colours in Pi's dark theme. This is an explicit assumption for approval.

### Preserve live expansion and theme updates

Keep reading expansion state inside `render()`. Do not cache coloured strings across redraws. Pi rebuilds custom-message components after theme invalidation; add a regression case proving the retained display adopts current colours.

Returning a prebuilt static text component would lose the existing shortcut-driven updates.

### Verify styles as well as text

Give the unit harness a realistic theme fixture. Test emitted colour sequences independently from stripped content. Preserve existing content assertions after accounting for panel padding.

Extend the real-Pi result fixture to inspect unstripped painted rows for the panel and hint. Keep existing assertions for expansion, delivery and unrelated tool output. Prove new checks fail without each style before accepting the fix.

## Risks / Trade-offs

- Theme palettes differ: describe the semantic colours and the dark-theme appearance in `docs/USAGE.md`.
- Padding changes wrapping and height: test narrow widths and the host's output padding.
- ANSI resets can remove a wrapped hint's foreground: verify every wrapped hint row with the real terminal component.
- Existing tests compare exact plain strings: strip terminal controls and panel padding for content checks, while keeping separate strict style assertions.

## Migration Plan

No data migration is needed. Ship the renderer change through the normal package release. Updating the installed package and reloading Pi activates it. Reverting the renderer change restores the earlier display without changing run files.
