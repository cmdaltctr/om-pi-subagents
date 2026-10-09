# Proposal

## Why

Result folding replaced Pi's default coloured message panel with plain text. The expansion hint also lacks colour, making it harder to find beneath a long answer.

## What Changes

- Restore the themed custom-message panel around collapsed and expanded OMPS results.
- Use the theme's warning colour for the entire hidden-line count and expansion hint.
- Preserve result text, wrapping, expansion keys and model delivery.
- Add regression tests and describe the styles in the usage guide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `result-message-display`: Require the custom-message background and warning-coloured fold hint in interactive Pi.

## Impact

- Update `src/result-message.ts` and focused rendering tests.
- Update `docs/USAGE.md` under folded results.
- Use existing Pi theme helpers and terminal components. No dependency or configuration changes.
- Pi's dark theme supplies the requested purple panel and yellow hint. Other themes keep their own corresponding colours.
- Saved output, model-facing content, JSON, print and RPC delivery remain unchanged.
