# Tasks

## 1. Failing tests first

Write each test, run it, and confirm it fails for the intended reason before section 2.

- [x] 1.1 `test/config.test.ts`: YAML without `ui` gives `fleetView: "expanded"`, `toggleKey: "off"` and `inspectKey: "off"`. Explicit `alt+o` and `alt+i` stay in effect.
- [x] 1.2 `test/config.invalid.test.ts`: `ui.fleetView: hidden` and a non-string value fail with a diagnostic that names `ui.fleetView`.
- [x] 1.3 `test/settings-persistence.test.ts` and `test/settings.test.ts`: the settings menu shows "Fleet view"; confirming `collapsed` saves `ui.fleetView`; cancelling saves nothing; the fleet repaints without `/reload`.
- [x] 1.4 `test/shortcuts.test.ts`: `ctrl+shift+o` is refused when the resolved built-ins contain `shift+ctrl+o`. Duplicate detection ignores modifier order. Default settings register no shortcut.
- [x] 1.5 `test/fleet.test.ts`: the default view renders expanded rows for active roots; `collapsed` renders one row; `off` renders nothing; a session toggle does not change the saved view.
- [x] 1.6 `test/fleet-widget.test.ts`: widget content clears 10 seconds after the last active run ends (fake timers); a launch inside that time cancels the clear; shutdown cancels the timer; `/omps inspect` still lists retained runs.
- [x] 1.7 `test/fleet-view.test.ts`: Down from an empty focused editor enters selection; Up, Down and Enter act only in selection; Escape leaves selection without collapsing; Up and Escape pass through outside selection; a non-empty draft, an overlay, an empty fleet and `off` all pass Down through; a key release does nothing.
- [x] 1.8 Update tests that assert the old Alt+O and Alt+I defaults: `test/ui-settings.test.ts`, `test/registry-store.test.ts`, `test/viewer-registration.test.ts`, `test/parent.e2e.test.ts`, `test/skill.test.ts` and the interactive fixtures. Confirm each new assertion fails on current code.

## 2. Implementation

- [x] 2.1 `src/config.ts`: add `fleetView` to `UiSettings` and `UI_FIELDS`, validate the three values, and set `DEFAULT_TOGGLE_KEY` and `DEFAULT_INSPECT_KEY` to `"off"`.
- [x] 2.2 `src/ui-settings.ts` and `src/settings-persistence.ts`: add `fleetView` to the cached values and to `UiField`.
- [x] 2.3 `src/settings.ts`: add the "Fleet view" menu item with a select dialog and confirmation. Repaint on save.
- [x] 2.4 `src/shortcuts.ts`: add `normaliseKey` and use it in `occupiedByBuiltin` and the duplicate check.
- [x] 2.5 `src/fleet.ts`: read the starting view from settings, keep a session override for the toggle, and add the `selecting` state.
- [x] 2.6 `src/fleet-widget.ts`: return no lines for `off`; add the 10-second clear timer per owner and cancel it on launch and shutdown.
- [x] 2.7 `src/fleet-view.ts` and `src/index.ts`: implement selection mode as in design decision 3, and render the hint row.
- [x] 2.8 Run each test from section 1 and confirm it passes. Break each safeguard in a disposable copy and confirm the matching test fails.

## 3. Documentation and skill

- [ ] 3.1 `README.md`: describe the expanded default, `ui.fleetView`, arrow navigation and opt-in shortcuts. Keep the `docs-test` markers intact.
- [ ] 3.2 `docs/SETUP.md`: document `ui.fleetView` and the new defaults. Add the YAML that restores `alt+o` and `alt+i`. Explain the macOS Option-as-Alt setting for Terminal.app, iTerm2 and Ghostty. Note that `shift+ctrl+o` is a Pi 1.0 built-in.
- [ ] 3.3 `docs/USAGE.md`: replace Alt-key instructions with arrow navigation and commands. Update the troubleshooting row "No fleet strip shows" to mention `ui.fleetView: off`.
- [ ] 3.4 `docs/INSTALL.md`: check for shortcut text and update it if present.
- [ ] 3.5 `skills/om-pi-subagents/SKILL.md` line 84 and `test/fixtures/skill-evals/evals.json`: describe the expanded default and arrow navigation.
- [ ] 3.6 Write `docs/adr/009-follow-the-tintin-fleet-default.md`. Add it to `docs/adr/ADR_README.md`. Mark ADR-007 as partly superseded by ADR-009.
- [ ] 3.7 Run `bun run test test/docs.test.ts test/skill.test.ts` and fix any failure.

## 4. Visual test before any push or pull request

- [ ] 4.1 Extend `test/fixtures/interactive-fleet.mjs` and `test/interactive-fleet.test.ts` to capture snapshots through `capture-snapshot.mjs` with `OMPS_CAPTURE_DIR` set. Capture these stages: `expanded-default`, `collapsed`, `fleet-off`, `empty-prompt-navigation`, `after-linger`, `narrow` (under 80 columns) and `beside-todo` (with the real todo extension).
- [ ] 4.2 Run the interactive suites with the pinned host: `bun run test test/interactive-fleet.test.ts test/interactive-shortcuts.test.ts`. Review every captured snapshot by eye.
- [ ] 4.3 Run the same suites with the operator's Pi: `OMPS_PI_BIN=~/.pi/agent/bin/pi bun run test test/interactive-fleet.test.ts test/interactive-shortcuts.test.ts`. Record any difference between Pi 0.99.1 and Pi 1.0.4.
- [ ] 4.4 Manual check in the operator's terminal (Orca, `xterm-256color`, Pi 1.0.4). Load the worktree build, start a run with four agents, and check: the tree shows without a key press; Down, Enter and Escape work from an empty prompt; Up still recalls history outside selection; the widget clears 10 seconds after the last run.
- [ ] 4.5 Save screenshots of 4.4 in ignored `docs/local-docs/`. Commit none of them.
- [ ] 4.6 Run `bun run ci`. Fix every failure.
- [ ] 4.7 Commit. Ask the operator before running `bun run ci:clean`, because it installs dependencies in a temporary clone.

## 5. Close the change

- [ ] 5.1 Run `openspec validate follow-tintin-fleet-default --strict`.
- [ ] 5.2 Run the `openspec-verify-change` skill and resolve its findings.
- [ ] 5.3 Archive the change with the `openspec-archive-change` skill before opening the pull request.
