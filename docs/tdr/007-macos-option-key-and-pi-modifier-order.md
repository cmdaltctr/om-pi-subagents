# TDR-007: Handle the macOS Option key and Pi modifier order

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Maintainer
- **Tags:** pi, keybindings, macos, terminal

## Context

The default fleet toggle was `alt+o`. On macOS the maintainer pressed Option+O and the editor received "ø". The fleet never expanded.

While choosing a replacement key, `ctrl+shift+o` passed the OMPS conflict check, but Pi 1.0.4 already uses it.

### Root Cause Analysis

macOS terminals use Option to type special characters by default. Terminal.app, iTerm2 and Ghostty send "ø" for Option+O, and a dead key for Option+I, unless Option is set to send Alt or Meta. Pi then receives a character, not `alt+o`.

Pi 1.0.4 binds `app.tree.filter.cycleBackward` to `shift+ctrl+o`. `occupiedByBuiltin` in `src/shortcuts.ts` compared key strings exactly. `ctrl+shift+o` and `shift+ctrl+o` are the same key in different modifier order, so the check missed the conflict.

## Decision

Ship both view shortcuts as `off`. Empty-prompt arrow navigation needs no modifier, so it works in every terminal.
Document how to restore `alt+o` and `alt+i` in YAML, and the terminal setting that makes Option send Alt.

Normalise modifier order with `normaliseKey` before built-in conflict and duplicate checks. Register the operator's own spelling with Pi.

## Consequences

### Positive

- New macOS installs have no shortcut that types a character instead of acting.
- Conflict checks catch a built-in key written in any modifier order.

### Negative

- Operators who relied on the old Alt defaults must add them to YAML.

### Neutral

- Pi's own keybindings stay untouched.

## Alternatives Considered

| Option                                     | Rejected Because                                                  |
| ------------------------------------------ | ----------------------------------------------------------------- |
| Keep Alt defaults and document the setting | New macOS users would still meet a silent failure.                |
| Ship `ctrl+shift+a` and `ctrl+shift+i`     | They need the kitty keyboard protocol, which many terminals lack. |
| Edit Pi keybindings or terminal settings   | OMPS must not change host or terminal configuration.              |

## How to Recognise / Handle This Again

1. If a shortcut types a character such as "ø", the terminal sends Option as a character.
2. Set Option to send Alt: Ghostty `macos-option-as-alt = true`, iTerm2 Left Option key `Esc+`, Terminal.app "Use Option as Meta key".
3. Or choose another key in `/omps-settings`.
4. If a key does nothing, check Pi's built-in bindings in both modifier orders.

## Revisit Triggers

Revisit when Pi adds bindings in new modifier forms, or when Pi exposes its own key normalisation to extensions.

## References

- [Shortcut registration](../../src/shortcuts.ts)
- [Key validation](../../src/config.ts)
- [Agent tree decision](../adr/009-port-the-tintin-agent-tree-and-show-it-by-default.md)
