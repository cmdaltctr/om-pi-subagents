# Design

## Context

`FleetStrip` in `src/fleet.ts` held a private `expanded = false`. Only `toggle()` changed it.
`src/shortcuts.ts` bound that toggle to `ui.toggleKey`, which defaulted to `alt+o` in `src/config.ts`.
On macOS, Terminal.app, iTerm2 and Ghostty send Option+O as "ø" unless Option is set to send Alt. Pi then never receives `alt+o`.

`occupiedByBuiltin` compared key strings exactly. Pi 1.0.4 binds `shift+ctrl+o` to `app.tree.filter.cycleBackward`. An operator who wrote `ctrl+shift+o` passed the check.

A first implementation of this change shipped an expanded flat list below the editor with a 10-second clear. In a real Orca session on Pi 1.0.4 the maintainer saw two short runs (9.1 s and 9.8 s) as flat rows that then vanished. It looked nothing like tintin's screenshot, and the maintainer asked for a close port of tintin's widget.

`tintinweb/pi-subagents` (MIT, commit `e955e29`) has two widgets:

- `src/ui/agent-widget.ts`: the `● Agents` tree, registered above the editor. It ticks an 80 ms spinner while agents run. It shows finished agents until the parent's next turn starts, and errors for `ERROR_LINGER_TURNS = 2` turns.
- `src/ui/fleet-list.ts`: a below-editor list for navigation. It shows a hint row, `○ main`, then up to `MAX_AGENT_ROWS = 5` agent rows with `●` and `○` markers. Finished agents linger for `FINISHED_LINGER_MS = 4000`.

OMPS already records agent, task summary, start and end times, state, active tool names and an assistant preview for each run. It does not count tool uses. It has no turns, tokens, cost or model figures from children, and it refuses launches above the limit rather than queuing them.

`omps list` prints every approved tool for every agent. With MCP tools this fills the screen.

The pinned test host is Pi 0.99.1. The operator runs Pi 1.0.4.

## Goals / Non-Goals

**Goals:**

- Look like tintin: the same tree glyphs, line shapes, spinner, icons, activity wording, overflow and linger.
- Show the tree by default while direct runs are active, with no key press.
- Give operators a persistent choice between `expanded`, `collapsed` and `off`.
- Navigate with plain arrow keys from an empty prompt.
- Ship no shortcut that fails silently on a common terminal.
- Keep `omps list` short for the operator without hiding tool permissions from the model.
- Credit tintin correctly under its MIT licence.

**Non-Goals:**

- No tokens, cost, turn count or model name in the tree. Children do not report them yet.
- No queued line. OMPS has no queue.
- No port of tintin's agent manager, conversation viewer, settings or workflow cards. OMPS keeps its own runtime, inspection modal and `/omps-settings`.
- No edit of Pi keybindings and no automatic terminal configuration.
- No migration that writes Alt keys into existing YAML.

## Decisions

### Decision 1: Port tintin's tree widget close to verbatim

Create `src/agent-tree-widget.ts` from tintin's `src/ui/agent-widget.ts`. Keep these parts with their logic and wording unchanged:

- `SPINNER` braille frames and the 80 ms tick, running only while a run is active.
- `formatMs`, `describeActivity` and `TOOL_DISPLAY` ("reading", "running command", "searching N patterns" and so on). The activity falls back to the first line of the assistant preview, then to `thinking…`.
- `renderFinishedLine`: `✓` completed, `✗` failed with the first 60 characters of the error, `■` cancelled, then tool uses and duration.
- `renderWidget`: the `●` accent heading when runs are active and `○` dim heading otherwise, `├─` connectors, the last-item swap to `└─` with the `│` indent cleared, two lines for each running agent, `MAX_WIDGET_LINES = 12`, and overflow priority of running then finished with a `+N more (N running, N finished)` row.

Adapt only the data source. tintin's `type` and `description` map to the OMPS agent name and task summary. Status maps from OMPS run states: `running` and `starting` are running, `completed` is completed, `failed` is error and `cancelled` is stopped. Agent names stay bold and use the theme accent. tintin's per-type colours are not ported.

The file starts with `Adapted from tintinweb/pi-subagents (MIT), commit e955e29`. Its exported helpers keep tintin's names so later upstream fixes can be compared line by line.

Alternative considered: keep improving the OMPS flat list. Rejected because the maintainer asked for tintin's look and the first attempt did not match it.

Alternative considered: fork tintin and add todo and memory support. Rejected because OMPS process isolation, readiness checks, the tool guard, nesting limits and saved run files would need rebuilding.

### Decision 2: Two widgets, tree above and list below

Register the tree with the key `omps-agents` and placement `aboveEditor`. Keep the existing below-editor fleet widget under its own key as the navigation list.
Restyle the list after tintin's `fleet-list.ts`: a dim hint row (`↓ to manage` outside selection and `↑↓ select · enter inspect · esc back` in selection), the `●` marker for the selected row and `○` for the others, windowed rows with `↑ N more` and `↓ N more`. tintin's `main` row is left out, because OMPS inspection always targets a run.
`ui.maxVisibleAgents` (default 5, the same as tintin's `MAX_AGENT_ROWS`) bounds the list window. The tree uses tintin's fixed 12-line cap.

Alternative considered: one widget that is both tree and list. Rejected because it would differ from tintin and make the 12-line tree cap fight the list window.

### Decision 3: Copy tintin's linger rules

The tree keeps tintin's turn-based rule. A finished run gets age 0. Each parent `turn_start` adds one. A completed run shows while its age is below 1. A failed or cancelled run shows while its age is below `ERROR_LINGER_TURNS = 2`. A run that starts again resets its age.
One addition to tintin: a completed run also stays for at least `MIN_SUCCESS_LINGER_MS = 4000` after it ends. OMPS delivers each result as a message that starts a parent turn at once. Without the floor, the `✓` line could vanish almost as soon as it appears. After 4000 ms the turn rule decides. Failed and cancelled runs already stay two turns, so the floor does not apply to them.
The list keeps tintin's time-based rule: a finished run stays for 4000 ms.
When no row remains in either widget, OMPS removes that widget and stops the spinner timer.
Retained evidence is unchanged. `/omps status` and `/omps inspect` still read it.

This removes the 10-second clear from the first implementation.

Alternative considered: keep the 10-second clear. Rejected because it differs from tintin.

### Decision 4: `ui.fleetView` selects what shows

Keep `fleetView: "expanded" | "collapsed" | "off"` in `UiSettings`.
`expanded` shows the full tree and the list. `collapsed` shows only the tree heading with counts, for example `● Agents · 3 running`, and no list, so Down passes to Pi. `off` shows neither widget.
A bound toggle key or `/omps fleet` switches between `expanded` and `collapsed` for the session only. A saved settings change clears that override and repaints.

### Decision 5: Explicit selection mode

`handleFleetInput` consumes Down only when not selecting, the editor owns focus, the draft is empty and the list shows rows. That Down starts selection at the first visible row.
While selecting, it consumes Up, Down, Enter and Escape. Enter opens inspection at the selected run. Escape ends selection.
While not selecting, it consumes no other key. Up and Escape reach Pi.
Selection ends when the list empties, the editor loses focus or the draft gains text.

### Decision 6: Count tool uses and pass the preview

The observation relay already sees tool start events for each run. Count each distinct tool-call identifier once, per run. Startup replay and invalid events do not count, matching the existing active-tool rules.
`FleetWidget.roots()` passes `toolUses` and the existing bounded `assistantPreview` to the tree.

### Decision 7: Shortcut defaults become `off`

`DEFAULT_TOGGLE_KEY` and `DEFAULT_INSPECT_KEY` are `"off"`. Explicit YAML values are unchanged. The guides show the lines that restore `alt+o` and `alt+i`, and the macOS terminal setting.

Alternative considered: ship `ctrl+shift+a` and `ctrl+shift+i`. Rejected because those keys need the kitty keyboard protocol.

### Decision 8: Normalise modifier order in conflict checks

`normaliseKey(key)` sorts modifiers into a fixed order and keeps the base key last. `occupiedByBuiltin` and the duplicate checks compare normalised forms. Registration passes the operator's own spelling to Pi.

### Decision 9: Compact `omps list`

`describeAgent` in `src/service.ts` returns two forms. The compact form is `<name>: <N> tools (read-only)` or `(write-capable)`, plus `model <id>` and `delegation-capable` when they apply.
The `/omps list` slash command shows the compact form.
The `omps` tool returns the full form in its text content, so the model still sees exact tool names. Its `renderResult` shows the compact form when collapsed and the full form when expanded with Ctrl+O.

### Decision 10: Credit and licence

Add `THIRD_PARTY_NOTICES.md` at the repository root with tintin's full MIT licence text, the repository URL and the commit. Add it to `package.json` `files` and to the allow-list and required list in `test/release.test.ts`.

### Decision 11: Test against both Pi versions

Run the interactive real-Pi suites with the pinned host and with `OMPS_PI_BIN=~/.pi/agent/bin/pi`.

### Decision 12: Record ADR-009

ADR-009 records the tintin port, the two-widget placement, the linger rules, the shortcut defaults and the licence credit. It supersedes the collapsed-default and Alt-key parts of ADR-007.

## Risks / Trade-offs

- [A completed run leaves the tree when the parent's next turn starts, which can be soon after delivery] → This is tintin's behaviour. The list keeps it for 4 seconds, and inspection keeps it for the session.
- [Two widgets use more vertical space] → The tree is capped at 12 lines and the list at the visible-agent bound plus two rows. `collapsed` and `off` remain.
- [The 80 ms spinner costs redraws] → It runs only while a run is active and stops when no row remains.
- [Upstream tintin changes] → Ported helpers keep tintin's names and the commit is recorded, so a later comparison is mechanical.
- [Operators who used Alt+O lose it after upgrade] → The release note and guides show the YAML lines that restore it.
- [Kitty terminals report key release] → The existing `isKeyRelease` check and dispatch guard still apply.
