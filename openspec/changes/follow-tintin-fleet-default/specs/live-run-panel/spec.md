## MODIFIED Requirements

### Requirement: Show run progress in the owning parent

The system SHALL show one session-wide fleet strip below the editor when the owning parent supports widgets. Its starting view SHALL follow registry `ui.fleetView`: `expanded` (the default) shows the agent tree, `collapsed` shows one content row regardless of direct-run count, and `off` shows no fleet widget. Expansion SHALL show bounded direct-agent rows with short identity, task summary, authoritative state, elapsed time and active tool names. Every active root SHALL remain reachable through scrolling. Display bounds MUST NOT limit launches, trigger model requests or create child terminals.

#### Scenario: A background run starts

- **WHEN** the parent starts a valid run with the default fleet view
- **THEN** the expanded fleet shows that run's agent, short identity and `starting` state
- **AND** no key press is needed to see the run row

#### Scenario: Several background runs start

- **WHEN** one parent starts five valid direct runs with the default fleet view
- **THEN** the expanded fleet shows a row for each run within the visible-root budget
- **AND** every active root is selectable without replacing sibling state

#### Scenario: The operator prefers the collapsed view

- **WHEN** `ui.fleetView` is `collapsed` and five direct runs are active
- **THEN** persistent OMPS widget content occupies exactly one row
- **AND** a bound toggle key or `/omps fleet` expands it for this session

#### Scenario: The operator turns the fleet off

- **WHEN** `ui.fleetView` is `off`
- **THEN** no persistent fleet widget is displayed while runs are active
- **AND** `/omps`, `/omps status` and `/omps inspect` still report every run

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

### Requirement: Retain a safe final summary

A terminal transition SHALL leave active siblings visible and preserve their status count. Once no direct runs are active, the fleet SHALL show the bounded terminal summary of the latest root for 10 seconds and then clear its widget content. A new launch during that period SHALL cancel the clearing. Retained evidence SHALL stay available through `/omps status` and `/omps inspect` after the widget clears. Saved-output previews SHALL appear in selected details rather than the persistent strip. Failed or cancelled output MUST remain partial. Cancellation MUST NOT gain a result message. Delivery and its record SHALL remain separate from presentation.

#### Scenario: A run completes

- **WHEN** output is saved and the child exits with confirmed cleanup
- **THEN** the owning parent receives its existing result message once
- **AND** the fleet shows a compact terminal summary if no sibling remains active
- **AND** its saved output remains available in the modal

#### Scenario: The last active run ends

- **WHEN** no direct run has been active for 10 seconds
- **THEN** the fleet widget content clears
- **AND** `/omps inspect` still opens the retained runs of this session

#### Scenario: A launch follows soon after completion

- **WHEN** a new direct run starts within 10 seconds of the last completion
- **THEN** the fleet does not clear
- **AND** it shows the new run in the configured view

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

### Requirement: Bound expanded fleet content

Expanded fleet content SHALL contain a summary, at most the effective visible-root budget and at most one navigation/overflow row. The configured default SHALL be five visible roots. The collapsed view MUST NOT show per-agent activity rows or answer previews. A session toggle SHALL change only this session's OMPS presentation and MUST NOT rewrite `ui.fleetView`.

#### Scenario: Default expansion is used

- **WHEN** a terminal is large enough and at least five roots are active
- **THEN** default expanded fleet content uses no more than seven rows
- **AND** collapsing removes the per-agent rows

#### Scenario: Another extension has a widget

- **WHEN** the fleet is expanded or collapsed beside a todo widget
- **THEN** only the OMPS widget changes
- **AND** todo's contents and expansion state remain unchanged

#### Scenario: The session toggle is used

- **WHEN** the operator toggles the fleet with a bound key or `/omps fleet`
- **THEN** the view changes for this session only
- **AND** the saved `ui.fleetView` value is unchanged
