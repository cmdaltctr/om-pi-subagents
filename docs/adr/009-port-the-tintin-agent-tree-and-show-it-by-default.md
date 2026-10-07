# ADR-009: Port the tintin agent tree and show it by default

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

ADR-007 chose one below-editor fleet strip, collapsed to one row, opened with Alt+O.
On macOS, Terminal.app, iTerm2 and Ghostty type "ø" for Option+O unless Option is set to send Alt.
Pi then never receives the key, so the maintainer never saw the expanded fleet.

A first fix expanded the strip by default and cleared it 10 seconds after the last run.
In a real Orca session on Pi 1.0.4, two short runs showed as flat rows and vanished.
The maintainer asked for the look of `tintinweb/pi-subagents` instead.

tintin (MIT, commit `e955e29`) has two widgets.
`src/ui/agent-widget.ts` draws a `● Agents` tree above the editor, with spinners, elapsed time and an activity line.
`src/ui/fleet-list.ts` draws a list below the editor that arrow keys select from an empty prompt.

OMPS runs each agent as a separate Pi process with readiness checks, a tool guard, nesting limits and saved run files.
Optional `om-pi-todo` and OMMS support depends on that runtime.

`omps list` printed every approved tool for every agent. With MCP tools it filled the screen.

## Decision

Port tintin's `agent-widget.ts` close to verbatim as `src/agent-tree-widget.ts`.
Keep its spinner, glyphs, line shapes, icons, activity wording, 12-line cap and overflow order.
Change only the data source: OMPS agent name, task summary, run state, tool-use count and assistant preview.
Leave out tokens, cost, turns, model and the queued line. OMPS children do not report those figures, and OMPS refuses launches instead of queuing them.

Show the tree above the editor. Keep the arrow list below the editor, restyled after tintin's `fleet-list.ts`.
Down on an empty prompt enters selection. Up, Down, Enter and Escape act only during selection.
Outside selection, Up and Escape reach Pi, so prompt history and interrupt keep working.

Add `ui.fleetView` with `expanded` (default), `collapsed` and `off`.
`expanded` shows both widgets. `collapsed` shows only the tree heading. `off` shows neither.

Keep tintin's linger rule for the tree. A completed run leaves at the parent's next turn.
A failed or cancelled run leaves after `ERROR_LINGER_TURNS = 2` turns.
Add one rule that tintin does not have: a completed run stays at least 4000 ms.
OMPS delivers each result as a message that starts a turn at once, so without the floor the `✓` line could vanish immediately.
The list keeps tintin's 4000 ms linger.

Ship both view shortcuts as `off`. Operators opt in through YAML or `/omps-settings`.
Normalise modifier order before conflict and duplicate checks, so `ctrl+shift+o` matches Pi's `shift+ctrl+o`.

Make `/omps list` one line per agent: tool count, `read-only` or `write-capable`, and model or delegation when set.
The `omps` tool still returns exact tool names to the model. Ctrl+O shows them to the operator.

Credit tintin in each ported file header and in `THIRD_PARTY_NOTICES.md` with the full MIT licence text.
Ship that notice in the npm package.

## Consequences

### Positive

- Operators see running agents without a key press, in a layout that matches tintin.
- Arrow navigation works in every terminal with no modifier keys.
- New installs have no shortcut that fails silently on macOS.
- Ported helpers keep tintin's names, so later upstream fixes can be compared line by line.
- OMPS keeps process isolation, exact permissions and optional sibling support.

### Negative

- Operators who used Alt+O or Alt+I must add those keys back to YAML after the upgrade.
- Two widgets use more vertical space than one collapsed row.
- The 80 ms spinner adds redraws while runs are active.
- OMPS now carries third-party code and a licence notice to keep current.

### Neutral

- Run state, result delivery, cleanup and saved evidence are unchanged.
- `/omps status`, `/omps inspect` and the inspection modal still read retained runs after the widgets clear.

## Alternatives Considered

| Option                                      | Rejected because                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Keep improving the OMPS flat list           | The first attempt did not match tintin, and the maintainer asked for its look.                   |
| Fork tintin and add todo and memory support | Process isolation, readiness checks, the tool guard, limits and run files would need rebuilding. |
| One widget that is both tree and list       | It differs from tintin, and the tree cap would fight the list window.                            |
| Keep the 10-second clear                    | It differs from tintin.                                                                          |
| Copy tintin's turn rule with no time floor  | Result delivery starts a turn at once, so completed lines could vanish before anyone sees them.  |
| Ship `ctrl+shift+a` and `ctrl+shift+i`      | Those keys need the kitty keyboard protocol.                                                     |
| Keep Alt+O and Alt+I and document the fix   | New macOS users would still meet a key that types "ø".                                           |

## References

- [Change design](../../openspec/changes/follow-tintin-fleet-default/design.md)
- [Agent tree widget](../../src/agent-tree-widget.ts)
- [Third-party notices](../../THIRD_PARTY_NOTICES.md)
- [tintinweb/pi-subagents at e955e29](https://github.com/tintinweb/pi-subagents/tree/e955e29)
- [macOS Option key and Pi 1.0 key order](../tdr/007-macos-option-key-and-pi-modifier-order.md)
- [Compact fleet decision](./007-use-a-compact-fleet-with-independent-sibling-capabilities.md)
