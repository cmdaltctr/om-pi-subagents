# ADR-015: Convert typed shortcuts only in settings

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

Shortcut dialogs take text. Pressing a modifier key sends terminal input instead of spelling its name.
Operators can type `Control + 1`, but the strict key validator expects `ctrl+1`.
Saved YAML must contain key specifications that Pi understands.

Shortcut registration already checks effective Pi bindings, including keys freed by manual remapping.
Settings needs the same check before confirmation or saving, with the existing default navigation exceptions.

## Decision

Convert typed shortcut text in `/omps-settings` before validation. Keep alias conversion outside the YAML loader.
Accept any letter case and spaces around `+`. Save the converted specification after confirmation.
The prompt explains typing with `ctrl+1` and names the common modifiers `ctrl`, `shift` and `alt`.
Confirmation shows the converted key and includes the typed text when it differs.

| Typed modifier                   | Saved modifier |
| -------------------------------- | -------------- |
| `ctrl`, `ctr`, `ctl`, `control`  | `ctrl`         |
| `shift`                          | `shift`        |
| `alt`, `opt`, `option`           | `alt`          |
| `super`, `cmd`, `command`, `win` | `super`        |

Leave `meta` out because its meaning varies between terminals. Unknown modifiers reach the strict validator and fail.
Settings errors for an invalid specification list `ctrl`, `shift`, `alt` and `super`.
The YAML loader continues to reject modifier aliases such as `control+1`.

Run unsafe-key and duplicate checks on the converted key. Tab and Ctrl+I remain unsafe.
Use one shared Pi-conflict helper for settings and registration, comparing keys after modifier-order normalisation.
Settings refuses conflicts before confirmation or saving. Its guidance names the owning actions and directs the operator
to `keybindings.json`, `/hotkeys` and `/reload`. Registration checks effective bindings again when shortcuts load.
A remapped Pi action frees its former key only when no effective owner remains. `off` stays unbound.

Allow only these direction-specific overlaps:

- `navigationDownKey: down`: `tui.editor.cursorDown`, `tui.editor.historyNext` and `tui.select.down`.
- `navigationUpKey: up`: `tui.editor.cursorUp`, `tui.editor.historyPrevious` and `tui.select.up`.

Any other owner blocks the default key. View shortcuts and custom navigation keys receive no overlap exception.
The YAML loader remains independent of Pi's current bindings. OMPS never edits Pi keybindings or terminal settings.

## Consequences

### Positive

- Operators can use familiar modifier spellings and review the converted value before saving.
- Settings and registration apply the same Pi-conflict policy, preserving default Up/Down navigation.

### Negative

- Manual YAML edits require strict Pi modifier names. Settings aliases work only in the input dialog.
- Conversion cannot make a terminal report Alt or Super. Operators must check their terminal's support.

### Neutral

No new platform finding warrants a TDR. The macOS Option-key caveat and modifier-order finding remain in
[TDR-007](../tdr/007-macos-option-key-and-pi-modifier-order.md). No new TDR or TDR index row is added.

The change covers these paths:

| Paths                                                                                                                                                                                                          | Role                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`src/config.ts`](../../src/config.ts)                                                                                                                                                                         | Typed-input conversion beside strict key validation.          |
| [`src/settings.ts`](../../src/settings.ts)                                                                                                                                                                     | Prompt, conversion, pre-save checks and confirmation.         |
| [`src/shortcuts.ts`](../../src/shortcuts.ts)                                                                                                                                                                   | Shared effective Pi-conflict policy and registration.         |
| [`test/config.test.ts`](../../test/config.test.ts)                                                                                                                                                             | Conversion cases and strict YAML rejection.                   |
| [`test/settings.test.ts`](../../test/settings.test.ts)                                                                                                                                                         | Typed input, saved values and pre-save refusals.              |
| [`test/shortcuts.test.ts`](../../test/shortcuts.test.ts)                                                                                                                                                       | Shared policy, navigation exceptions and effective remapping. |
| [`test/settings.navigation.test.ts`](../../test/settings.navigation.test.ts)                                                                                                                                   | Navigation save and failure cases use free Pi keys.           |
| [`test/settings.rpc.test.ts`](../../test/settings.rpc.test.ts)                                                                                                                                                 | Real Pi dialogs save converted navigation input.              |
| [`docs/USAGE.md`](../USAGE.md)                                                                                                                                                                                 | Operator procedure and terminal caveat.                       |
| [`README.md`](../../README.md)                                                                                                                                                                                 | Public settings overview; example markers stay intact.        |
| [`skills/om-pi-subagents/SKILL.md`](../../skills/om-pi-subagents/SKILL.md)                                                                                                                                     | Shipped operational guidance.                                 |
| [`docs/adr/015-convert-typed-shortcuts-only-in-settings.md`](015-convert-typed-shortcuts-only-in-settings.md)                                                                                                  | This accepted decision.                                       |
| [`docs/adr/ADR_README.md`](ADR_README.md)                                                                                                                                                                      | Decision index entry.                                         |
| [`openspec/specs/omps-command-interface/spec.md`](../../openspec/specs/omps-command-interface/spec.md)                                                                                                         | Synced command behaviour contract.                            |
| [`openspec/changes/archive/2026-10-08-forgiving-shortcut-input/.openspec.yaml`](../../openspec/changes/archive/2026-10-08-forgiving-shortcut-input/.openspec.yaml)                                             | Change metadata.                                              |
| [`openspec/changes/archive/2026-10-08-forgiving-shortcut-input/proposal.md`](../../openspec/changes/archive/2026-10-08-forgiving-shortcut-input/proposal.md)                                                   | Revised approved scope.                                       |
| [`openspec/changes/archive/2026-10-08-forgiving-shortcut-input/design.md`](../../openspec/changes/archive/2026-10-08-forgiving-shortcut-input/design.md)                                                       | Conversion and shared conflict policy.                        |
| [`openspec/changes/archive/2026-10-08-forgiving-shortcut-input/tasks.md`](../../openspec/changes/archive/2026-10-08-forgiving-shortcut-input/tasks.md)                                                         | Implementation and verification checklist.                    |
| [`openspec/changes/archive/2026-10-08-forgiving-shortcut-input/specs/omps-command-interface/spec.md`](../../openspec/changes/archive/2026-10-08-forgiving-shortcut-input/specs/omps-command-interface/spec.md) | Behaviour requirements and scenarios.                         |

Verification passed before acceptance. After a rebase on `integration/settings-inspector`,
check both decision indexes for number collisions and preserve every existing row.

## Alternatives Considered

| Option                                        | Rejected Because                                                     |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Accept modifier aliases in the YAML validator | Stored values could contain spellings that Pi cannot register.       |
| Capture pressed keys in the dialog            | Requires a separate input screen beyond this change.                 |
| Keep Pi-conflict checks only at registration  | Settings could confirm and save a key that stays inactive.           |
| Check occupancy directly from settings        | Loses the default navigation exceptions and owner-specific guidance. |
| Treat `meta` as an alias                      | Its meaning varies between terminals.                                |

## References

- [Operator settings](../USAGE.md#operator-settings)
- [Management navigation decision](012-separate-management-navigation-and-use-single-column-inspection.md)
- [TDR-007: macOS Option key and Pi modifier order](../tdr/007-macos-option-key-and-pi-modifier-order.md)
