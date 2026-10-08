# Design

## Context

`editShortcut` in `src/settings.ts` reads text with `ctx.ui.input`, trims it, and passes it to `checkUiKey` and `checkDistinctUiKeys` in `src/config.ts`. `checkUiKey` accepts a lowercase specification built from `ctrl`, `shift`, `alt` and `super`. `normaliseKey` sorts modifiers into a fixed order for comparisons.

`ctx.ui.input` takes a title and a placeholder. It cannot read a held modifier, so the operator must type the key.

Pi conflicts currently receive checks only in `registerViewShortcuts` in `src/shortcuts.ts`. Settings can save a conflicting key. The approved update adds this check before settings confirms or saves a shortcut.

## Goals / Non-Goals

**Goals:**

- Accept natural spellings of the common modifiers in the settings input.
- Tell the operator to type, not press.
- Keep every existing safety check.
- Share Pi-conflict validation between settings and registration, including permitted default navigation overlaps.

**Non-Goals:**

- No press-to-capture screen. That is a possible later change.
- No loosening of the YAML loader.
- No change to which keys are unsafe or reserved.

## Decisions

### 1. One conversion function, used only by the settings input

Add `typedKeyToSpec(text: string): string` next to `normaliseKey`. It lowercases, removes spaces around `+`, splits on `+`, maps each modifier word through the alias table and rejoins. The last part is the key and is left alone, apart from lowercasing. A modifier word that is not in the table is left as typed, so `checkUiKey` rejects the result with its own error. `"off"` passes through.

Alternative: accept aliases in `checkUiKey`. Rejected. The YAML loader would then accept values that Pi's key parser does not know, and a stored `control+1` would break at registration time.

### 2. Alias table

| Typed (any case)                 | Converted |
| -------------------------------- | --------- |
| `ctrl`, `ctr`, `ctl`, `control`  | `ctrl`    |
| `alt`, `opt`, `option`           | `alt`     |
| `shift`                          | `shift`   |
| `super`, `cmd`, `command`, `win` | `super`   |

`meta` is not in the table. Its meaning differs between terminals, so it stays an error.

### 3. Prompt wording

The title reads: `<label>. Type the key, for example ctrl+1. Do not press the keys. Common modifiers: ctrl, shift, alt.` The placeholder stays as the current value. The text is a constant in `src/settings.ts`.

### 4. Confirmation shows the conversion

After conversion, `checkUiKey` and `checkDistinctUiKeys` run on the converted key. The shared Pi-conflict check then runs for the edited field. A conflict ends the edit before confirmation or saving. The confirmation shows `label → ctrl+1` and, when the typed text differs, a line `Typed: Control + 1`.

### 5. Error text lists accepted modifiers

When the converted key still fails the specification check, the settings message adds `Accepted modifiers: ctrl, shift, alt, super.` The loader's own message stays unchanged.

### 6. Share the existing registration conflict policy

Extract an exported helper in `src/shortcuts.ts` that accepts a `UiKeyField`, a key and optional resolved Pi bindings. It returns the existing conflict guidance or no conflict. Its default bindings come from `getKeybindings().getResolvedBindings()`. Tests can provide bindings explicitly.

Both `editShortcut` and `registerViewShortcuts` use this helper. Keep `builtinOwners`, modifier-order comparison and the direction-specific overlap sets in `src/shortcuts.ts`. A key set to `off` has no conflict and remains unbound. Registration still checks current bindings after `/reload` because Pi bindings can change after a save.

Only `navigationDownKey: down` can overlap `tui.editor.cursorDown`, `tui.editor.historyNext` and `tui.select.down`. Only `navigationUpKey: up` can overlap `tui.editor.cursorUp`, `tui.editor.historyPrevious` and `tui.select.up`. Other owners still block these keys. View shortcuts and custom navigation keys receive no overlap exception.

Settings shows the existing guidance naming the owning actions, `keybindings.json`, `/hotkeys` and `/reload`. Remapping an action frees its former key when no effective owner remains. The loader stays independent of Pi's current bindings.

Alternative: call `occupiedByBuiltin` directly from settings. Rejected because it omits the permitted navigation overlaps and owner-specific guidance.

## Risks / Trade-offs

- `cmd` converts to `super`, which only works on terminals that report it (kitty keyboard protocol). The confirmation does not claim it will work. Existing guidance on terminal support stays in the docs.
- On macOS, `alt+<letter>` can type a character such as `ø`. This change does not fix that. It is a terminal setting and is covered in the docs.
