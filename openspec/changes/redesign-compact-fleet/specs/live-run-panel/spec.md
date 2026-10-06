# Live run panel delta

## MODIFIED Requirements

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

## ADDED Requirements

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
