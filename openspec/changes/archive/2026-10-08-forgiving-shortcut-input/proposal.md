# Proposal

## Why

`/omps-settings` asks the operator to type a shortcut such as `ctrl+alt+o`. The check accepts only lowercase `ctrl`, `shift`, `alt` and `super`. A natural entry such as `ctr + 1`, `Control+1` or `option+o` is rejected, and the prompt does not say that the key must be typed, not pressed. Pressing Ctrl in the text box sends a control character, not the word "ctrl".

## What Changes

- The shortcut prompt tells the operator to type the key as text, for example `ctrl+1`, and not to press the keys. It lists the common modifiers `ctrl`, `shift` and `alt`.
- The settings input converts common spellings before validation: any letter case, spaces around `+`, and the aliases `ctr`, `ctl` and `control` for `ctrl`; `opt` and `option` for `alt`; `cmd`, `command` and `win` for `super`.
- The confirmation dialog shows the converted key. When it differs from the typed text, it shows both.
- The saved value is always the canonical lowercase form. Existing unsafe-key and duplicate checks run on the converted key.
- Settings rejects effective Pi key conflicts before confirmation or saving. Settings and shortcut registration share the same conflict check and guidance.
- The permitted direction-specific overlaps for default Up/Down navigation remain available. Reassigning a Pi action can free its former key.
- The YAML loader stays strict. Only the settings input is forgiving.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `omps-command-interface`: new requirement for how `/omps-settings` takes typed shortcut input. Existing key requirements are unchanged.

## Impact

- `src/config.ts` or a small helper beside `normaliseKey`: one function that converts typed text to a key specification.
- `src/settings.ts`: `editShortcut` converts the answer, runs the shared conflict check, shows the note and shows the converted key in the confirmation.
- `src/shortcuts.ts`: extract the registration conflict check for settings to reuse, preserving its guidance and navigation overlap rules.
- `test/settings.test.ts`, `test/config.test.ts` and `test/shortcuts.test.ts`: cover aliases, spacing, case, rejected conflicts, permitted navigation overlaps and keys freed by remapping.
- `docs/USAGE.md`: describe typing keys and the accepted spellings.
- The YAML format, loader validation and shortcut registration policy stay unchanged. Settings gains pre-save Pi-conflict validation.
