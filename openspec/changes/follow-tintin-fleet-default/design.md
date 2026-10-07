# Design

## Context

`FleetStrip` in `src/fleet.ts` holds a private `expanded = false`. Only `toggle()` changes it.
`src/shortcuts.ts` binds that toggle to `ui.toggleKey`, which defaults to `alt+o` in `src/config.ts`.
On macOS, Terminal.app, iTerm2 and Ghostty send Option+O as "ø" unless Option is set to send Alt. Pi then never receives `alt+o`.

`handleFleetInput` in `src/fleet-view.ts` already consumes Up, Down, Escape and Enter. It does so only when the strip is expanded, the editor owns focus and the draft is empty.
Today an expanded strip therefore takes Up from Pi's prompt history and Escape from Pi's interrupt.
This was harmless while expansion was rare. With an expanded default, it would take those keys during every run.

`occupiedByBuiltin` compares key strings exactly. Pi 1.0.4 binds `shift+ctrl+o` to `app.tree.filter.cycleBackward`. An operator who writes `ctrl+shift+o` passes the check, and the two bindings then collide.

The live-run-panel spec keeps one terminal summary row until the next launch. `tintinweb/pi-subagents` instead clears its widget a short time after the last agent finishes.

The pinned test host is Pi 0.99.1. The operator runs Pi 1.0.4.

## Goals / Non-Goals

**Goals:**

- Show the agent tree by default while direct runs are active, with no key press.
- Give operators a persistent choice between `expanded`, `collapsed` and `off`.
- Navigate the fleet with plain arrow keys from an empty prompt.
- Ship no shortcut that fails silently on a common terminal.
- Catch built-in conflicts written in another modifier order.

**Non-Goals:**

- No change to the inspection modal layout or its detail pane.
- No queued-agent row. OMPS refuses launches above `limits.maxConcurrentRuns`, so it has no queue to show.
- No per-agent "thinking" activity line. OMPS shows the tool names the child reports and nothing else.
- No edit of Pi keybindings and no automatic terminal configuration.
- No migration that writes Alt keys into existing YAML.

## Decisions

### Decision 1: `ui.fleetView` sets the starting view

Add `fleetView: "expanded" | "collapsed" | "off"` to `UiSettings`. Validate it in `src/config.ts` next to `maxVisibleAgents`. Add it to `UiField` in `src/settings-persistence.ts`.
`FleetStrip` takes a view provider in place of a fixed `false`. A session toggle stores an override for that session only.
A saved settings change clears the session override and repaints, matching how `maxVisibleAgents` repaints today.
`off` makes `FleetWidget.renderLines` return no lines. The status line and commands are unchanged.

Alternative considered: a boolean `ui.fleetExpanded`. Rejected because the operator also asked for a way to hide the widget completely.

### Decision 2: Clear the widget 10 seconds after the last active run

When the active direct-run count reaches zero, `FleetWidget` starts one timer per owner. When it fires, rendering returns no lines until the next launch. A launch cancels the timer. Session shutdown cancels it too, so no callback reaches a replaced session.
Ten seconds gives the operator time to read the final state. It also matches the short linger of `tintinweb/pi-subagents`.
Retained run evidence is untouched. `/omps status` and `/omps inspect` still read it.

Alternative considered: keep the current "retain until next launch" row. Rejected because the operator asked to follow tintin's default.

Alternative considered: clear at once. Rejected because a fast run would flash and disappear before the operator sees its outcome.

### Decision 3: Explicit fleet selection mode

Add `selecting: boolean` to `FleetStrip`.
`handleFleetInput` consumes Down only when `selecting` is false, the editor owns focus, the draft is empty and the strip renders run rows. That Down sets `selecting` and selects the first visible root.
While `selecting` is true, it consumes Up, Down, Enter and Escape. Escape clears `selecting` and does not change the view.
While `selecting` is false, it consumes no other key. Up and Escape reach Pi.
Selection ends when the last active run ends, when the editor loses focus, or when the draft gains text.
The selected row gets the existing selection marker. A hint row says `↓ select · enter inspect · esc back` only while rows are visible.

Alternative considered: keep the current rule that an expanded strip takes all four keys. Rejected because it would block Pi's prompt history and interrupt during every run.

### Decision 4: Shortcut defaults become `off`

Set `DEFAULT_TOGGLE_KEY` and `DEFAULT_INSPECT_KEY` to `"off"`.
Arrow navigation and `/omps fleet` and `/omps inspect` give full access without a modifier key.
Explicit YAML values are unchanged. The guides show the two lines that restore `alt+o` and `alt+i`, and the terminal setting macOS needs for them.

Alternative considered: ship `ctrl+shift+a` and `ctrl+shift+i`. Rejected because those keys need the kitty keyboard protocol, which many terminals lack.

### Decision 5: Normalise modifier order in conflict checks

Add `normaliseKey(key)` in `src/shortcuts.ts`. It splits on `+`, sorts the modifiers into a fixed order and keeps the base key last.
`occupiedByBuiltin` and the duplicate-key check compare normalised forms.
Registration still passes the operator's own spelling to Pi, because Pi parses either order.

### Decision 6: Test against both Pi versions

Run the interactive real-Pi suites twice: once with the pinned host and once with `OMPS_PI_BIN=~/.pi/agent/bin/pi`.
This catches Pi 1.0 changes such as the new built-in key and the MCP name rules.

### Decision 7: Record ADR-009

ADR-009 supersedes the collapsed-default and Alt-key parts of ADR-007. ADR-007 gets a "partly superseded by ADR-009" status.

## Risks / Trade-offs

- [Operators who used Alt+O lose it after upgrade] → The release note and guides show the YAML lines that restore it. Settings shows `off` with its source.
- [The expanded tree uses more vertical space] → It stays inside the visible-root budget and one third of terminal height. `collapsed` and `off` remain available.
- [Down in an empty prompt now enters the fleet] → It acts only while run rows are visible. Pi has no default Down action in an empty single-line prompt beyond history, which starts with Up.
- [The 10-second timer can fire after session replacement] → The timer is cleared on shutdown and checks the owner before repainting.
- [Kitty terminals report key release] → The existing `isKeyRelease` check and dispatch guard still apply.
