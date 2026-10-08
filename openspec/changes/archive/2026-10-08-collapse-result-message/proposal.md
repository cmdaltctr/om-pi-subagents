# Proposal

## Why

When a run ends, OMPS puts a result message into the conversation. It holds up to 4000 characters of the agent's answer. Pi shows the whole text, so a long answer fills the screen. The operator has no way to fold it away.

## What Changes

- The `omps-result` message gets its own renderer. Collapsed, it shows the heading line, the files line and the first lines of the result, then a hint such as `… 42 more lines (Ctrl+O to expand)`.
- Expanded, it shows the full message text as today.
- A new OMPS shortcut, `ui.resultKey`, toggles an independent expansion state for every result message in the session. Results collapse when both the OMPS and host expansion states are false. Its default is `ctrl+shift+e`. The operator can change it in `/omps-settings` or set it to `off`.
- The host's tool-output expansion action (Ctrl+O by default) also expands a message. The hint names `ctrl+shift+e` when active and always names the host key as a fallback.
- A short result that fits the collapsed limit shows no hint and has nothing to expand.
- The message text sent to the model does not change. Only the display changes.
- A failed run keeps its `Error:` and `PARTIAL OUTPUT` lines visible when collapsed.

## Capabilities

### New Capabilities

- `result-message-display`: how the OMPS result message appears in the transcript, collapsed and expanded, and the shortcut that toggles it.

### Modified Capabilities

None.

## Impact

- `src/index.ts`: register the renderer with `pi.registerMessageRenderer` for `RESULT_MESSAGE`, and bind the shortcut.
- `src/config.ts`, `src/shortcuts.ts`, `src/settings.ts`: add `resultKey` beside the existing shortcut fields, with the same validation, duplicate and Pi-conflict checks.
- `src/notify.ts` or a new `src/result-render.ts`: a pure function that splits a result message into collapsed and full lines.
- `test/notify.test.ts` and a new render test.
- `docs/USAGE.md`: describe the folded result and how to expand it.
- Needs extended-key reporting for Ctrl+Shift combinations, through kitty or `modifyOtherKeys`. Unverified support receives guidance. Legacy Ctrl+E remains unchanged, and the host key still works.
- No change to delivery, saved output, `output.md`, the 4000-character limit or the delivery record.
