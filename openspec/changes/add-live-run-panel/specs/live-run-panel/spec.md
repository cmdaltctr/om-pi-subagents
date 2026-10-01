# Live run panel

## Purpose

Let the owning parent see an OMPSS child's run state and current tool activity without opening another terminal.

## ADDED Requirements

### Requirement: Show run progress in the owning parent

The system SHALL display a compact panel for the current run when the owning parent supports widgets.
The panel SHALL show the agent name and the authoritative run state.
Progress updates MUST NOT trigger model requests or create additional child terminals.

#### Scenario: A background run starts

- **WHEN** the parent starts a valid run
- **THEN** its panel shows the agent and `starting`
- **AND** subsequent state changes update that same panel

#### Scenario: The parent has no UI

- **WHEN** the parent runs without UI support
- **THEN** the run proceeds normally without attempting widget calls

### Requirement: Show task tool activity accurately

The system SHALL show active child tools using matching tool-call identifiers.
It MUST handle concurrent and nested calls without clearing unrelated active tools.
Startup replay, malformed events and unrelated events MUST NOT appear as task tool activity.

#### Scenario: A task tool starts and ends

- **WHEN** a child starts a tool for the submitted task
- **THEN** the panel shows its name
- **WHEN** the matching tool-call identifier ends
- **THEN** that call is removed from the active display

#### Scenario: Concurrent and nested calls finish out of order

- **WHEN** several calls are active with distinct identifiers
- **THEN** ending one removes only that call
- **AND** the others remain visible, subject to the compact display limit

#### Scenario: A short tool runs before prompt acknowledgement

- **WHEN** a submitted task emits tool events before its prompt response arrives
- **THEN** the panel still observes those task events
- **AND** it does not report the run as completed from tool completion alone

#### Scenario: Guard startup records are replayed

- **WHEN** startup records are replayed before the new task is submitted
- **THEN** their tool events do not appear in the panel

#### Scenario: An invalid or unrelated event arrives

- **WHEN** an event lacks a valid tool name or matching identifier, or is unrelated to tool execution
- **THEN** it does not corrupt the current tool display

### Requirement: Retain a safe final summary

The system SHALL retain the latest terminal state until another run starts or the session ends.
For completed and failed runs, it SHALL show a bounded preview of saved output when available.
Failed output MUST remain labelled partial. Cancelled runs MUST NOT gain an automatic result message.
The existing full result message and delivery record SHALL remain separate from the panel.

#### Scenario: A run completes

- **WHEN** output is saved and the child exits with confirmed cleanup
- **THEN** the panel shows `completed`, clears active tools and retains a bounded answer preview
- **AND** the parent receives the existing full result message once

#### Scenario: A run fails or is cancelled

- **WHEN** the run ends as `failed` or `cancelled`
- **THEN** the panel shows that outcome and clears active tools
- **AND** any displayed failed-run output is labelled partial
- **AND** cancellation keeps its existing no-follow-up behaviour

#### Scenario: Saved output cannot be read

- **WHEN** final output is unavailable to the display
- **THEN** the panel keeps the correct final state without inventing an answer

### Requirement: Protect display ownership and run lifetime

Only the owning live parent session SHALL receive panel updates.
The panel MUST clear when that session ends. Late events MUST NOT repopulate it.
An old run's delayed preview MUST NOT replace a newer run's display.

#### Scenario: A session ends while work or an output read is pending

- **WHEN** the owning session shuts down or is replaced
- **THEN** its panel is cleared
- **AND** later callbacks send neither panel updates nor results to the replacement session

#### Scenario: A new run starts before an old preview finishes loading

- **WHEN** an old run's preview becomes available after a new run has started
- **THEN** the new run's panel remains unchanged

#### Scenario: A foreign run emits progress

- **WHEN** progress belongs to a different owner or an older run
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
