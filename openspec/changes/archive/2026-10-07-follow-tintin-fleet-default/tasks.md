# Tasks

## 1. Failing tests first (first pass, still valid)

Write each test, run it, and confirm it fails for the intended reason before implementation.

- [x] 1.1 `test/config.test.ts`: YAML without `ui` gives `fleetView: "expanded"`, `toggleKey: "off"` and `inspectKey: "off"`. Explicit `alt+o` and `alt+i` stay in effect.
- [x] 1.2 `test/config.invalid.test.ts`: `ui.fleetView: hidden` and a non-string value fail with a diagnostic that names `ui.fleetView`.
- [x] 1.3 `test/settings-persistence.test.ts` and `test/settings.test.ts`: the settings menu shows "Fleet view"; confirming `collapsed` saves `ui.fleetView`; cancelling saves nothing; the fleet repaints without `/reload`.
- [x] 1.4 `test/shortcuts.test.ts`: `ctrl+shift+o` is refused when the resolved built-ins contain `shift+ctrl+o`. Duplicate detection ignores modifier order. Default settings register no shortcut.
- [x] 1.5 `test/fleet-view.test.ts`: Down from an empty focused editor enters selection; Up, Down and Enter act only in selection; Escape leaves selection; Up and Escape pass through outside selection; a non-empty draft, an overlay, an empty list and `off` all pass Down through; a key release does nothing.
- [x] 1.6 Update tests that assert the old Alt+O and Alt+I defaults: `test/ui-settings.test.ts`, `test/registry-store.test.ts`, `test/viewer-registration.test.ts`, `test/parent.e2e.test.ts`, `test/skill.test.ts` and the interactive fixtures.

## 2. Implementation (first pass, still valid)

- [x] 2.1 `src/config.ts`: add `fleetView` to `UiSettings` and `UI_FIELDS`, validate the three values, and set `DEFAULT_TOGGLE_KEY` and `DEFAULT_INSPECT_KEY` to `"off"`.
- [x] 2.2 `src/ui-settings.ts` and `src/settings-persistence.ts`: add `fleetView` to the cached values and to `UiField`.
- [x] 2.3 `src/settings.ts`: add the "Fleet view" menu item with a select dialog and confirmation. Repaint on save.
- [x] 2.4 `src/shortcuts.ts` and `src/config.ts`: add `normaliseKey` and use it in `occupiedByBuiltin` and the duplicate checks.
- [x] 2.5 `src/fleet.ts`: read the starting view from settings, keep a session override for the toggle, and add the `selecting` state.
- [x] 2.6 `src/fleet-view.ts` and `src/index.ts`: implement explicit selection mode.

## 3. Failing tests first (tintin port)

Write each test, run it, and confirm it fails for the intended reason before section 4.

- [x] 3.1 New `test/agent-tree-widget.test.ts`, with a plain test theme: four running roots render `● Agents`, then two lines each with `├─`, spinner, name, task, `N tool uses`, elapsed time and `│    ⎿  activity`; the last root uses `└─` and a blank indent.
- [x] 3.2 Same file: `describeActivity` gives `reading…`, `reading 2 files…`, `searching 3 patterns…`, the first preview line truncated to 60 characters, and `thinking…`. Compare its output with tintin's for the same inputs.
- [x] 3.3 Same file: finished lines show `✓` for completed, `✗` and the first 60 error characters for failed, `■` for cancelled, each with tool uses and duration. No active run gives the dim `○ Agents` heading.
- [x] 3.4 Same file: content over 12 lines keeps running agents first, then finished, then `+N more (N running, N finished)`; every line fits the given width.
- [x] 3.5 Same file: linger. A completed run leaves after one parent `turn_start`; a failed or cancelled run leaves after two; a restart resets the age. A completed run whose next `turn_start` arrives within 4000 ms stays until 4000 ms have passed since it ended (fake clock); a failed run gets no time floor. The spinner timer runs at 80 ms only while a run is active and stops when no row remains.
- [x] 3.6 `test/fleet-widget.test.ts`: the tree registers with key `omps-agents` and placement `aboveEditor`; the list keeps its own key below the editor; `collapsed` shows only the heading with counts and no list; `off` registers neither. Remove the 10-second clear tests.
- [x] 3.7 `test/fleet.test.ts`: the list renders the hint row, `●` on the selected row, `○` on the others, and `↑ N more` and `↓ N more` markers; a finished row leaves the list after 4000 ms (fake timers). Remove the flat-row assertions.
- [x] 3.8 `test/observation-relay.test.ts` (or the nearest existing relay test): tool uses count each distinct task tool-call identifier once per run; startup replay, invalid events and sibling runs do not change the count.
- [x] 3.9 `test/service.test.ts` and `test/viewer-registration.test.ts`: `/omps list` prints `<name>: N tools (read-only)` or `(write-capable)` with no tool names; the `omps` tool `list` text still contains every tool name; its collapsed render shows the compact form and its expanded render the full form.
- [x] 3.10 `test/release.test.ts`: the packed files include `THIRD_PARTY_NOTICES.md`.

## 4. Implementation (tintin port)

- [x] 4.1 Create `src/agent-tree-widget.ts` from tintin `src/ui/agent-widget.ts` at commit `e955e29`, close to verbatim, as in design decision 1. Start the file with `Adapted from tintinweb/pi-subagents (MIT), commit e955e29`.
- [x] 4.2 Register the tree above the editor with key `omps-agents` in `src/fleet-widget.ts` and `src/index.ts`. Feed parent `turn_start` events to its linger ages.
- [x] 4.3 Remove the 10-second clear timer and its code from `src/fleet-widget.ts`.
- [x] 4.4 Restyle the below-editor list after tintin `fleet-list.ts`: hint row, `●` and `○` markers, window markers and a 4000 ms finished linger. Credit tintin in the file header.
- [x] 4.5 Apply `ui.fleetView` to both widgets as in design decision 4.
- [x] 4.6 Count tool uses in the observation relay and pass `toolUses` and the assistant preview through `FleetWidget.roots()`.
- [x] 4.7 Split `describeAgent` in `src/service.ts` into compact and full forms. Use the compact form in `/omps list` and in the collapsed `renderResult`; keep the full form in the tool text and the expanded render.
- [x] 4.8 Add `THIRD_PARTY_NOTICES.md` with tintin's MIT licence text, the repository URL and the commit. Add it to `package.json` `files` and to the allow-list and required list in `test/release.test.ts`.
- [x] 4.9 Run each test from section 3 and confirm it passes. Break each safeguard in a disposable copy and confirm the matching test fails. Record the evidence in ignored `docs/local-docs/`.

## 5. Documentation and skill

- [x] 5.1 First pass: README, `docs/SETUP.md`, `docs/USAGE.md`, `docs/INSTALL.md` and the shipped skill describe `ui.fleetView`, arrow navigation, opt-in shortcuts and the macOS Option-as-Alt setting.
- [x] 5.2 `README.md`: replace the flat-strip description with the tree above the editor and the list below it. Add the tintin credit. Keep the `docs-test` markers intact.
- [x] 5.3 `docs/USAGE.md`: describe the tree lines, activity wording, linger rules, the `●` and `○` list, and the compact `omps list`. Remove the 10-second clear.
- [x] 5.4 `docs/SETUP.md`: describe what `expanded`, `collapsed` and `off` show in each widget.
- [x] 5.5 `skills/om-pi-subagents/SKILL.md` and `test/fixtures/skill-evals/evals.json`: describe the tree, the list and the compact `list` output.
- [x] 5.6 Run `bun run test test/docs.test.ts test/skill.test.ts test/release.test.ts` and fix any failure.
- [x] 5.7 `README.md`: add a Features section near the top with the real screenshot, and a "Works with om-pi-todo and OMMS" section. Check every claim against the code, specs and existing README text. Keep the example markers intact.

## 6. Visual test before any push or pull request

- [x] 6.1 Extend `test/fixtures/interactive-fleet.mjs` and `test/interactive-fleet.test.ts` to capture snapshots through `capture-snapshot.mjs` with `OMPS_CAPTURE_DIR`. Capture: `tree-four-running`, `finished-linger`, `error-linger`, `tree-overflow` (more than 12 lines), `narrow` (under 80 columns), `beside-todo` (with the real todo extension), `arrow-list` and `collapsed`. Remove the `after-linger` stage of the 10-second clear.
- [x] 6.2 Run the interactive suites with the pinned host: `bun run test test/interactive-fleet.test.ts test/interactive-shortcuts.test.ts`. Review every snapshot by eye against tintin's screenshot.
- [x] 6.3 Run the same suites with the operator's Pi: `OMPS_PI_BIN=~/.pi/agent/bin/pi bun run test test/interactive-fleet.test.ts test/interactive-shortcuts.test.ts`. Record any difference between Pi 0.99.1 and Pi 1.0.4.
- [x] 6.4 Save the reviewed snapshots in ignored `docs/local-docs/visual/`.
- [x] 6.4a Record a real Pi 1.0.4 session with `scripts/readme-demo.tape` (vhs) in a disposable agent directory with the fake model. Save `docs/assets/omps-agent-tree.png`, `docs/assets/omps-agent-list.png` and `docs/assets/omps-demo.gif` (under about 2 MB). Read each image and confirm the tree shows, with no personal paths or errors.
- [x] 6.5 Run `bun run ci`. Fix every failure.
- [x] 6.6 Manual check in the operator's terminal (Orca, `xterm-256color`, Pi 1.0.4). Load the worktree build, set the parallel limit to 4, and start four runs that each take at least 30 seconds. Check: the tree shows above the editor with spinners, tool uses, elapsed time and activity lines; Down, Enter and Escape work from an empty prompt; Up still recalls history outside selection; finished lines linger as specified; `omps list` is compact.
  - Operator accepted the real Pi 1.0.4 vhs session (four real child processes, fake model, vhs terminal instead of Orca) as this check. Evidence: `docs/assets/omps-agent-tree.png`, `omps-agent-list.png`, `omps-agent-finished.png` and `omps-demo.gif`.
- [x] 6.7 Save screenshots of 6.6 in ignored `docs/local-docs/`. Commit none of them.
- [x] 6.8 Commit. Ask the operator before running `bun run ci:clean`, because it installs dependencies in a temporary clone.
  - Committed. `bun run ci:clean` is not approved yet; run it before any push.

## 7. Close the change

- [x] 7.1 Write `docs/adr/009-port-the-tintin-agent-tree-and-show-it-by-default.md` with the `s-adr` skill. Add it to `docs/adr/ADR_README.md`. Mark ADR-007 as partly superseded by ADR-009.
- [x] 7.2 Run `openspec validate follow-tintin-fleet-default --strict`.
- [x] 7.3 Run the `openspec-verify-change` skill and resolve its findings.
- [x] 7.4 Archive the change with the `openspec-archive-change` skill before opening the pull request.
