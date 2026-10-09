# TDR-014: Restore result panel and hint colours

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer
- **Tags:** pi, result-rendering, theme, regression

## Context

Result folding introduced a custom renderer that returned plain `Text`. Pi applies its default purple panel only when no custom component is returned. The fold hint also had no colour.

Pi's `keyHint()` adds grey foreground codes to the host key name and description. Those codes override a warning colour applied around the complete hint.

## Decision

Keep expansion state reads inside `render()` in `src/result-message.ts`. Place the result body and a separate hint inside Pi's `Box`. Use `options.outputPad` with a narrow-width limit, one row of vertical padding and `customMessageBg`.

Remove terminal controls from the string returned by `keyHint()` before applying `theme.fg("warning", ...)` to the hint. Build coloured strings during rendering. Stored messages and saved output stay unchanged.

## Consequences

### Positive

- Collapsed and expanded results regain their themed panel.
- Key names and wrapped hint rows keep the warning colour.

### Negative

- The panel adds padding that can increase the result's displayed height.

### Neutral

- Expansion keys, delivery and the eight-line preview remain unchanged.
- Other themes supply their own panel and warning colours.

## Alternatives Considered

| Option                                             | Rejected Because                                          |
| -------------------------------------------------- | --------------------------------------------------------- |
| Hard-code purple and yellow                        | Ignores the operator's theme and terminal colour mode.    |
| Colour the hint without removing host colour codes | Pi's embedded grey codes override the warning foreground. |
| Return a static styled component                   | Stops reading the session expansion flag during redraws.  |

## How to Recognise / Handle This Again

1. Check whether the custom renderer supplies its own background.
2. Inspect the host key hint for embedded colour codes.
3. Run `bun run test test/result-message.test.ts test/result-message.e2e.test.ts`.
4. Verify narrow wrapping and a theme change on retained results.

## Revisit Triggers

Revisit when Pi changes custom-message styling, key hints or theme invalidation.

## References

- [Result renderer](../../src/result-message.ts)
- [Unit regressions](../../test/result-message.test.ts)
- [Real-Pi regressions and disposable mutations](../../test/result-message.e2e.test.ts)
- [Result redraw findings](011-redraw-result-messages-and-preserve-legacy-ctrl-e.md)
- [Pi's custom-message example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/message-renderer.ts)
