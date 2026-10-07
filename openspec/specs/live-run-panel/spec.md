# Live run panel

## Purpose

Let the owning parent see an OMPSS child's run state and current tool activity without opening another terminal.

## Requirements

### Requirement: Show run progress in the owning parent

The system SHALL show one session-wide fleet strip below the editor when the owning parent supports widgets. It SHALL start collapsed to one content row regardless of direct-run count. Expansion SHALL show bounded direct-agent rows with short identity, task summary, authoritative state, elapsed time and active tool names. Every active root SHALL remain reachable through scrolling. Display bounds MUST NOT limit launches, trigger model requests or create child terminals.

#### Scenario: A background run starts

- **WHEN** the parent starts a valid run
- **THEN** its collapsed fleet reports an active direct run
- **AND** expansion shows that run's agent, short identity and `starting` state

#### Scenario: Several background runs start

- **WHEN** one parent starts five valid direct runs
- **THEN** collapsed persistent OMPSS widget content occupies exactly one row
- **AND** expansion makes every active root selectable without replacing sibling state

#### Scenario: More runs exist than the panel can show

- **WHEN** active roots exceed the visible-agent bound or terminal-height budget
- **THEN** expanded rows are windowed with an accurate additional-row indicator
- **AND** moving selection reaches roots outside the initial window
- **AND** hidden runs continue normally

#### Scenario: The parent has no UI

- **WHEN** the parent runs without UI support
- **THEN** runs proceed without attempting terminal widget calls

#### Scenario: The terminal is small

- **WHEN** an expanded fleet is rendered in a small terminal
- **THEN** its content respects the configured visible-root bound and at most one third of terminal height
- **AND** the collapsed view still has at most one content row

#### Scenario: The fleet has no retained runs

- **WHEN** the current session has no run evidence
- **THEN** no persistent fleet widget is displayed
- **AND** opening inspection reports the empty session without starting work

### Requirement: Show task tool activity accurately

The system SHALL show active child tools using matching run and tool-call identifiers.
It MUST handle concurrent and nested calls within each run without clearing unrelated active tools or other runs.
Startup replay, malformed events and unrelated events MUST NOT appear as task tool activity.

#### Scenario: A task tool starts and ends

- **WHEN** a child starts a tool for the submitted task
- **THEN** its run summary shows the tool name
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

#### Scenario: An invalid or unrelated event arrives

- **WHEN** an event lacks a valid tool name or matching identifier, or is unrelated to tool execution
- **THEN** it does not corrupt any run's tool display

### Requirement: Retain a safe final summary

A terminal transition SHALL leave active siblings visible and preserve their status count. Once no direct runs are active, the collapsed fleet SHALL retain one bounded summary of the latest terminal root until another launch or session end. Saved-output previews SHALL appear in selected details rather than the persistent strip. Failed or cancelled output MUST remain partial. Cancellation MUST NOT gain a result message. Delivery and its record SHALL remain separate from presentation.

#### Scenario: A run completes

- **WHEN** output is saved and the child exits with confirmed cleanup
- **THEN** the owning parent receives its existing result message once
- **AND** the fleet retains a compact terminal summary if no sibling remains active
- **AND** its saved output remains available in the modal

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
- **THEN** its OMPSS panel is cleared
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

Expanded fleet content SHALL contain a summary, at most the effective visible-root budget and at most one navigation/overflow row. The configured default SHALL be five visible roots. The collapsed view MUST NOT show per-agent activity rows or answer previews. Changing view state SHALL affect only this session's OMPSS presentation.

#### Scenario: Default expansion is used

- **WHEN** a terminal is large enough and at least five roots are active
- **THEN** default expanded fleet content uses no more than seven rows
- **AND** collapsing removes the per-agent rows

#### Scenario: Another extension has a widget

- **WHEN** the fleet is expanded or collapsed beside a todo widget
- **THEN** only the OMPSS widget changes
- **AND** todo's contents and expansion state remain unchanged
