# Design

## Context

`createNotifier` in `src/notify.ts` sends one message with `customType: "omps-result"` and `display: true`. Its content is built by `compose` and holds a heading line, a files line, an optional `Error:` line, a `Result:` label and up to 4000 characters of output. No renderer is registered for that type, so Pi shows the full text.

Pi provides `pi.registerMessageRenderer(customType, renderer)`. The renderer receives the message, `{ expanded, outputPad }` and the theme, and returns a component. Pi toggles `expanded` with its tool-output expansion action (`app.tools.expand`, Ctrl+O by default). The OMPS spec "Honour the host expansion action" already says OMPS must not replace that action. `src/index.ts` already registers an entry renderer that uses the same `expanded` flag.

`Ctrl+E` is bound to "move to line end" in Pi's editor. The operator chose `ctrl+shift+e`, which Pi does not bind by default. A terminal needs extended-key reporting to tell it from `ctrl+e`. Pi accepts kitty CSI-u and xterm `modifyOtherKeys` sequences. Without extended reporting, raw Ctrl+E retains its editor action.

## Goals / Non-Goals

**Goals:**

- Fold long result messages by default.
- Expand them with `ctrl+shift+e`, and with the host key the operator already uses for tool output.

**Non-Goals:**

- No keybinding edits in Pi.
- No change to message content, delivery, the 4000-character limit or `output.md`.
- No per-message expand state that outlives Pi's own.

## Decisions

### 1. Both the host action and a new `ui.resultKey`

The host action keeps working with no code, because the renderer reads `expanded`. The operator also asked for `ctrl+shift+e`, so add `ui.resultKey` as a fifth key field beside `toggleKey`, `inspectKey` and the two navigation keys. It reuses `checkUiKey`, `checkDistinctUiKeys` and the Pi-conflict diagnostics. The default is `ctrl+shift+e`. This differs from the other OMPS shortcut defaults, which are `off`. The reason is that the operator asked for this key by name and Pi does not bind it. The hint shows the OMPS key when active and always names the host expansion key as a fallback. Effective Pi conflicts disable the OMPS key. Without confirmed kitty support, OMPS still accepts extended sequences and explains that terminal support is unverified; it cannot reliably detect `modifyOtherKeys` support.

### 1a. A session flag, not per-message state

OMPS keeps one session flag, `resultsExpanded`. The renderer shows the full text when `expanded || resultsExpanded`. Each key toggles its own state. A result collapses only when both states are false; an already enabled host expansion state also expands newly drawn results. The result key never changes unrelated tool output.

The spike confirmed a supported redraw route through an empty `ctx.ui.setWidget` factory. Its public TUI provides `invalidate()` and `requestRender()`. OMPS retains that hook outside the lazy run runtime, including sessions with historical results, and clears it at shutdown. The returned result component reads the session flag on each render. Shortcut redraws invalidate the transcript before requesting a render; ordinary fleet updates remain unchanged. The host retains custom components between paints, so a static `Text` needs invalidation to reflect changed state.

Evidence: pinned Pi `dist/modes/interactive/components/custom-message.js` retains renderer components and rebuilds on invalidation. Pi TUI `dist/tui.js` exposes recursive invalidation and scheduled painting. Pi's theme controller uses the same invalidate-then-render pair. The parent verified that `.pi-host/node_modules` contains Pi 0.99.1. The current user-installed Pi is separate. Project scripts determine the host used for clean checks.

### 2. A pure render helper

Add `src/result-render.ts` with `collapseResult(content: string, limit: number): { head: string[]; hidden: number }`. It keeps every line up to and including the `Result:` label, any `Error:` line and the `PARTIAL OUTPUT` note, then the first `limit` result lines. `hidden` counts the rest. The renderer joins lines with `Text` and appends the hint when `hidden > 0`.

The limit is 8 result lines. It is a constant at the top of the file. The value is an assumption, since the operator gave no number.

### 3. Hint text from the host

Use Pi's exported `keyHint("app.tools.expand", "to expand")` for the key name. If it throws or returns nothing, fall back to `expand with the host expansion key`.

### 4. Defensive rendering

A renderer that throws would break the transcript. Wrap the work in a guard. Non-string content, or content without the expected `Result:` label, renders as plain `Text` with no fold.

## Risks / Trade-offs

- The collapsed view hides result text by default. A short hint keeps the fold visible. The operator can expand every time.
- The key needs extended-key reporting. Legacy raw Ctrl+E remains the editor's line-end action. OMPS cannot prove every terminal's support, so it gives a warning and keeps the host key in the hint.
- In regular mode, changing messages above the viewport can repaint Pi's scrollback. Verify this with the real host.
- If Pi changes the renderer API, a unit test on the pure helper still holds, and the registration test fails loudly.
- Lines are counted before wrapping. A single very long line shows in full. The 4000-character limit bounds it.
