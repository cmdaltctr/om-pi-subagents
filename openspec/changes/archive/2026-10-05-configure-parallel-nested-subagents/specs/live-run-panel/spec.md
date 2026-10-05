# Live run panel delta

## MODIFIED Requirements

### Requirement: Show run progress in the owning parent

The system SHALL display a compact panel for direct current-session runs when the owning parent supports widgets.
Each displayed active run SHALL show its run identifier, agent name and authoritative state.
The panel SHALL prioritise active runs and show the number of additional active runs when its display bound is exceeded.
The display bound MUST NOT limit admitted runs. Progress updates MUST NOT trigger model requests or create child terminals.

#### Scenario: A background run starts

- **WHEN** the parent starts a valid run
- **THEN** its panel shows the run identifier, agent and `starting`
- **AND** subsequent state changes update that run's summary

#### Scenario: Several background runs start

- **WHEN** one parent starts several valid direct runs
- **THEN** their summaries coexist without replacing each other's state
- **AND** `/ompss status` remains available for every owned run

#### Scenario: More runs exist than the panel can show

- **WHEN** active runs exceed the compact display bound
- **THEN** the panel shows bounded summaries and the number of additional active runs
- **AND** hidden runs continue normally

#### Scenario: The parent has no UI

- **WHEN** the parent runs without UI support
- **THEN** the runs proceed normally without attempting widget calls

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

While owned runs remain active, a terminal transition SHALL leave their summaries and status indicator intact.
Once no runs are active, the panel SHALL retain the most recently ended run's terminal summary until a new run starts or the session ends.
For completed and failed runs, it SHALL show a bounded preview of saved output when available.
Failed output MUST remain labelled partial. Cancelled runs MUST NOT gain an automatic result message.
The full result message and delivery record for each run SHALL remain separate from the panel.

#### Scenario: A run completes

- **WHEN** output is saved and the child exits with confirmed cleanup
- **THEN** its active tools clear and the parent receives its full result message once
- **AND** the panel retains its completed preview if it is the latest terminal run and no work remains active

#### Scenario: One sibling finishes while another runs

- **WHEN** one direct run completes while another is still active
- **THEN** the active sibling remains visible
- **AND** the session's active status indicator stays set

#### Scenario: A run fails or is cancelled

- **WHEN** the run ends as `failed` or `cancelled`
- **THEN** its outcome remains available and its active tools clear
- **AND** any displayed failed-run output is labelled partial
- **AND** cancellation keeps its existing no-follow-up behaviour

#### Scenario: Saved output cannot be read

- **WHEN** final output is unavailable to the display
- **THEN** the panel keeps the correct final state without inventing an answer

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
