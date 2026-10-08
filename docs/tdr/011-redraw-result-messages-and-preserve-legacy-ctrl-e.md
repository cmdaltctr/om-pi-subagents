# TDR-011: Redraw result messages and preserve legacy Ctrl+E

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer
- **Tags:** pi, terminal, rendering, keybindings

## Context

The result shortcut changes a session flag. Pi retains custom message components between paints.
A static `Text` component keeps its original content until rebuilt.
Ctrl+Shift+E also needs terminal input that preserves the Shift modifier.

The parent checked this worktree's host package manifest: Pi **0.99.1**.
`scripts/setup-host.sh` defaults to **0.99.1**, with typebox **1.3.27**.
Local compatibility checks also use an isolated Pi **1.0.4** installation.
The user-installed Pi is separate from these test hosts.
`PI_HOST_VERSION` and `PI_HOST_MODULES` can override setup.
`scripts/ci-clean.sh` reuses local host modules when present and selects their CLI through `OMPS_PI_BIN`.
Record the actual manifest version for each check; the script default alone cannot establish what ran.

### Root Cause Analysis

`CustomMessageComponent` keeps the component returned by a message renderer.
Its `invalidate()` rebuilds that component. Pi TUI invalidation reaches mounted roots, and `requestRender()` schedules painting.
Pi's theme controller uses the same invalidate-then-render sequence.
The pinned 0.99.1 custom-message and TUI implementations also expose this route.

Pi's key parser accepts Ctrl+Shift+E through kitty CSI-u and xterm `modifyOtherKeys`.
The raw byte `0x05` matches Ctrl+E, which Pi binds to editor line end.
A terminal that drops Shift sends that byte for either physical combination.
`modifyOtherKeysActive` records Pi's enable request; it does not confirm that the terminal honours it.

## Decision

Capture the public TUI from an empty widget factory, outside the lazy run runtime:

```ts
ctx.ui.setWidget("omps-result-render", (tui) => {
	requestRender = () => {
		tui.invalidate();
		tui.requestRender();
	};
	return { render: () => [], invalidate() {} };
});
```

The production hook in `src/result-message.ts` also clears its callback on disposal.
Retained result components read the session flag each time they render.
Session shutdown resets the flag and removes the widget. Ordinary fleet refreshes keep their current render path.

Keep a conflict-free `ui.resultKey` active when kitty support is unconfirmed.
Warn that extended-key support is unverified. Accept Pi's supported extended sequences without treating raw Ctrl+E as the result key.
Always include the host expansion key in the fold hint; also name the result key when active.
This preserves a working fallback when a terminal cannot distinguish Ctrl+Shift+E.

## Consequences

### Positive

- Historical results can repaint without starting a run or creating the runtime.
- Public APIs supply the redraw hook. Host keybindings stay operator-owned.

### Negative

- Transcript invalidation can repaint regular-mode scrollback. Native-host tests check the painted frames with a disposable terminal device.
- An active shortcut can still receive no distinct key sequence from a terminal.

### Neutral

- `bun run test test/result-message.e2e.test.ts` passed 12 tests on macOS with Pi 0.99.1.
- The same suite passed 12 tests with both the host modules and child CLI set to Pi 1.0.4.
- Native parent and child sessions used a local fake provider and a disposable terminal device. Checks covered painted frames, extended keys, raw Ctrl+E, remapped hints, independent expansion states, saved output and shutdown.
- Four disposable mutants failed at the intended assertions: disabled folding, disabled toggling, omitted shortcut registration and omitted shutdown cleanup.
- A redraw-request-only mutant survived because native editor input also schedules painting. The unit tests separately check invalidation before the explicit render request.
- Linux and physical terminal input were not tested in this local session.

## Alternatives Considered

| Option                                                 | Rejected Because                                           |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| Request a paint without invalidation                   | Retained static content can still show its previous state. |
| Access private host transcript objects                 | Ties OMPS to internal host fields despite a public route.  |
| Capture the TUI only through the fleet                 | Historical-only sessions can have no run runtime or fleet. |
| Disable the result key without confirmed kitty support | Discards supported `modifyOtherKeys` sequences.            |
| Use raw Ctrl+E as a fallback                           | Removes the editor's line-end action.                      |

## How to Recognise / Handle This Again

1. If a result stays folded, check the active Result shortcut in `/omps-settings`.
2. Run `/reload` after a saved key change.
3. Check `/hotkeys` for a conflicting Pi action.
4. Use the host expansion key shown in the hint if terminal support is unverified.
5. If repainting fails, confirm the empty-widget hook calls `invalidate()` before `requestRender()`.
6. Run `bun run test test/result-message.e2e.test.ts` for native dispatch and painting.
7. Exercise kitty, `modifyOtherKeys` and raw Ctrl+E input in an isolated fixture.
8. For terminal-specific failures, test physical input and scrollback separately. Record the host manifest version.

## Revisit Triggers

Revisit after changes to Pi's message cache, public TUI API, keyboard negotiation or default bindings.
A reliable terminal capability check or a real-host scrollback failure also requires review.

## References

- [ADR-016](../adr/016-fold-result-messages-and-bind-ctrl-shift-e.md)
- [Approved spike design](../../openspec/changes/archive/2026-10-08-collapse-result-message/design.md)
- [Result hook](../../src/result-message.ts)
- [Shortcut registration](../../src/shortcuts.ts)
- [Host setup](../../scripts/setup-host.sh) and [clean checks](../../scripts/ci-clean.sh)
- [Real-Pi result test](../../test/result-message.e2e.test.ts)
- [Disposable result host](../../test/fixtures/result-message-host.mjs)
- Inspected Pi package files: `dist/modes/interactive/components/custom-message.js`, `dist/modes/interactive/theme/theme-controller.js`.
- Inspected Pi TUI package files: `dist/tui.js`, `dist/keys.js`, `dist/terminal.js`.
- [Pi terminal UI guide](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)
- [Pi keybindings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md)
