# Live run panel

## Purpose

Let the owning parent see an OMPS child's run state and current tool activity without opening another terminal.

## Requirements

### Requirement: Show run progress in the owning parent

The system SHALL show run progress in two session-wide widgets when the owning parent supports widgets. A tree widget adapted from `tintinweb/pi-subagents` SHALL appear above the editor. A navigation list SHALL appear below the editor. Their starting view SHALL follow registry `ui.fleetView`: `expanded` (the default) shows the full tree and the list, `collapsed` shows only the tree heading, and `off` shows neither widget. The tree SHALL show a `● Agents` heading while runs are active and a dim `○ Agents` heading otherwise. Each running agent SHALL use two tree lines: a spinner, the agent name, the task summary, the tool-use count and the elapsed time, then an activity line. Each finished agent SHALL use one line with its outcome icon and duration. Tree lines SHALL use `├─` connectors, with `└─` on the last item. Every active root SHALL remain reachable through the list. Display bounds MUST NOT limit launches, trigger model requests or create child terminals.

#### Scenario: A background run starts

- **WHEN** the parent starts a valid run with the default fleet view
- **THEN** the tree above the editor shows a spinner line for that agent and an activity line
- **AND** no key press is needed to see the run

#### Scenario: Several background runs start

- **WHEN** one parent starts four valid direct runs with the default fleet view
- **THEN** the tree shows two lines for each run, with `├─` connectors and `└─` on the last run
- **AND** the list below the editor shows a row for each run

#### Scenario: The operator prefers the collapsed view

- **WHEN** `ui.fleetView` is `collapsed` and four direct runs are active
- **THEN** the tree shows only its heading with the active count
- **AND** no list is shown
- **AND** a bound toggle key or `/omps fleet` expands it for this session

#### Scenario: The operator turns the fleet off

- **WHEN** `ui.fleetView` is `off`
- **THEN** neither widget is displayed while runs are active
- **AND** `/omps`, `/omps status` and `/omps inspect` still report every run

#### Scenario: More runs exist than the panel can show

- **WHEN** active roots exceed the visible-agent bound
- **THEN** list rows are windowed with `↑ N more` or `↓ N more` markers
- **AND** moving selection reaches roots outside the initial window
- **AND** hidden runs continue normally

#### Scenario: The parent has no UI

- **WHEN** the parent runs without UI support
- **THEN** runs proceed without attempting terminal widget calls

#### Scenario: The terminal is small

- **WHEN** the tree and list are rendered in a terminal under 80 columns
- **THEN** every line is truncated to the terminal width
- **AND** no line wraps

#### Scenario: The fleet has no retained runs

- **WHEN** the current session has no run evidence
- **THEN** no fleet widget is displayed
- **AND** opening inspection reports the empty session without starting work

### Requirement: Show task tool activity accurately

The system SHALL show active child tools using matching run and tool-call identifiers.
It MUST handle concurrent and nested calls within each run without clearing unrelated active tools or other runs.
Startup replay, malformed events and unrelated events MUST NOT appear as task tool activity.
The tree activity line SHALL describe active tools with tintin's wording, such as `reading…` or `searching 3 patterns…`. With no active tool it SHALL show the first line of the bounded assistant preview, and otherwise `thinking…`.
The system SHALL count tool uses per run, counting each distinct task tool-call identifier once.

#### Scenario: A task tool starts and ends

- **WHEN** a child starts a tool for the submitted task
- **THEN** its run summary shows the tool name
- **AND** its tool-use count increases by one
- **WHEN** the matching tool-call identifier ends
- **THEN** that call is removed only from its run's active display

#### Scenario: Concurrent and nested calls finish out of order

- **WHEN** several calls are active with distinct identifiers
- **THEN** ending one removes only that call
- **AND** the others remain visible, subject to the compact display limit

#### Scenario: Sibling runs reuse a tool-call identifier

- **WHEN** two runs have active tools with the same tool-call identifier
- **THEN** finishing the call in one run leaves the other run's call active

#### Scenario: A short tool runs before prompt acknowledgement

- **WHEN** a submitted task emits tool events before its prompt response arrives
- **THEN** the panel still observes those task events
- **AND** it does not report the run as completed from tool completion alone

#### Scenario: Guard startup records are replayed

- **WHEN** startup records are replayed before the new task is submitted
- **THEN** their tool events do not appear in the panel
- **AND** they do not change the tool-use count

#### Scenario: An invalid or unrelated event arrives

- **WHEN** an event lacks a valid tool name or matching identifier, or is unrelated to tool execution
- **THEN** it does not corrupt any run's tool display or tool-use count

#### Scenario: Two read tools run at once

- **WHEN** one run has two active `read` calls
- **THEN** its activity line reads `reading 2 files…`

#### Scenario: No tool is active

- **WHEN** a running agent has no active tool and has produced assistant text
- **THEN** its activity line shows the first non-empty line of that text, truncated to 60 characters
- **WHEN** it has produced no assistant text
- **THEN** its activity line reads `thinking…`

### Requirement: Retain a safe final summary

A terminal transition SHALL leave active siblings visible and preserve their status count. Finished runs SHALL follow the linger rules of `tintinweb/pi-subagents`. In the tree, a completed run SHALL remain until the parent's next turn starts and at least 4 seconds have passed since it ended, and a failed or cancelled run SHALL remain for two parent turns. In the list, a finished run SHALL remain for 4 seconds. A widget with no remaining rows SHALL be removed. Retained evidence SHALL stay available through `/omps status` and `/omps inspect` after the widgets clear. Saved-output previews SHALL appear in selected details rather than the persistent widgets. Failed or cancelled output MUST remain partial. Cancellation MUST NOT gain a result message. Delivery and its record SHALL remain separate from presentation.

#### Scenario: A run completes

- **WHEN** output is saved and the child exits with confirmed cleanup
- **THEN** the owning parent receives its existing result message once
- **AND** the tree shows a `✓` line with the tool-use count and duration
- **AND** its saved output remains available in the modal

#### Scenario: A completed run ages out

- **WHEN** a completed run has been shown and the parent starts its next turn
- **THEN** the tree no longer shows that run
- **AND** `/omps inspect` still opens it

#### Scenario: Result delivery starts a turn at once

- **WHEN** a run completes and its result message starts a parent turn within 4 seconds
- **THEN** the tree still shows the `✓` line until 4 seconds have passed since the run ended
- **AND** the line leaves at the first repaint after both conditions hold

#### Scenario: A failed run lingers longer

- **WHEN** a run fails
- **THEN** the tree shows a `✗` line with the start of the error
- **AND** the line remains through the parent's next turn and leaves at the second

#### Scenario: A run restarts after lingering

- **WHEN** a run that already finished starts again
- **THEN** its linger age resets and its new outcome is shown

#### Scenario: One sibling finishes while another runs

- **WHEN** one direct run completes while another is active
- **THEN** the active sibling remains selectable
- **AND** the session's active status indicator stays set

#### Scenario: A run fails or is cancelled

- **WHEN** a run ends as `failed` or `cancelled`
- **THEN** its active tools clear and its outcome remains inspectable
- **AND** displayed saved output remains partial
- **AND** cancellation keeps its no-follow-up behaviour

#### Scenario: Saved output cannot be read

- **WHEN** final output is unavailable to the selected details
- **THEN** the correct terminal state remains visible and output is labelled unavailable

#### Scenario: An old output read finishes after newer work

- **WHEN** a delayed output read belongs to an older run
- **THEN** it cannot replace active rows, the latest terminal summary or another selected node

### Requirement: Protect display ownership and run lifetime

Only the owning live parent session SHALL receive panel updates.
The panel MUST clear when that session ends. Late events MUST NOT repopulate it.
An old run's delayed preview MUST NOT replace active work, another run's data or a newer retained terminal summary.

#### Scenario: A session ends while work or an output read is pending

- **WHEN** the owning session shuts down or is replaced
- **THEN** its OMPS panel is cleared
- **AND** later callbacks send neither panel updates nor results to the replacement session

#### Scenario: A new run starts before an old preview finishes loading

- **WHEN** an old run's preview becomes available after a new run has started
- **THEN** the new run's panel data remains unchanged

#### Scenario: An older run's output arrives after a later completion

- **WHEN** an older terminal preview read finishes after a newer run has ended
- **THEN** the newer retained terminal summary remains selected

#### Scenario: A foreign run emits progress

- **WHEN** progress belongs to a different owner
- **THEN** the current panel ignores it

#### Scenario: An expired run emits progress

- **WHEN** progress belongs to a run whose active display lifetime has ended
- **THEN** the current panel ignores it

### Requirement: Keep UI output safe and supervision independent

The panel SHALL use bounded plain text and SHALL exclude tool arguments, raw results, thinking and stderr.
Control sequences in displayed names or answer previews MUST NOT execute in the terminal.
Display failures MUST NOT affect run state, saved output, cleanup or terminal result delivery.

#### Scenario: Tool arguments contain credentials

- **WHEN** a tool event contains credentials in its arguments or result
- **THEN** those fields are absent from the panel

#### Scenario: A long preview contains terminal control sequences

- **WHEN** displayed text contains control sequences or exceeds the preview limit
- **THEN** the panel renders safe bounded text
- **AND** the saved answer remains unchanged

#### Scenario: A widget or status callback throws

- **WHEN** either UI callback fails
- **THEN** supervision and cleanup continue
- **AND** the run keeps its true outcome and normal result-delivery handling

### Requirement: Bound expanded fleet content

The tree SHALL contain at most 12 lines, including its heading. When its content does not fit, it SHALL show running agents first, then finished agents, then one `+N more (N running, N finished)` line. The list SHALL show at most the effective visible-root budget, a hint row and at most one window marker above and below. The configured default SHALL be five visible roots. The collapsed view MUST NOT show per-agent lines or answer previews. A session toggle SHALL change only this session's OMPS presentation and MUST NOT rewrite `ui.fleetView`. The spinner SHALL advance every 80 ms only while a run is active.

#### Scenario: Default expansion is used

- **WHEN** six runs are active
- **THEN** the tree uses at most 12 lines and reports the hidden runs in a `+N more` line
- **AND** collapsing removes the per-agent lines

#### Scenario: Another extension has a widget

- **WHEN** the fleet is expanded or collapsed beside a todo widget
- **THEN** only the OMPS widgets change
- **AND** todo's contents and expansion state remain unchanged

#### Scenario: The session toggle is used

- **WHEN** the operator toggles the fleet with a bound key or `/omps fleet`
- **THEN** the view changes for this session only
- **AND** the saved `ui.fleetView` value is unchanged

#### Scenario: No run is active

- **WHEN** the last active run ends
- **THEN** the spinner timer stops
- **AND** no further redraw is requested by OMPS until a run starts
