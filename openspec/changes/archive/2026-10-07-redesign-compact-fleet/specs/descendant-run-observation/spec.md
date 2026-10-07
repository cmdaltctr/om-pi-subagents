# Descendant run observation delta

## MODIFIED Requirements

### Requirement: Bound observation without limiting execution

The observation path SHALL bound record sizes, retained nodes, tool metadata and optional task/assistant display text. Task summaries SHALL be at most 160 characters; assistant previews SHALL be at most 4 KiB of UTF-8. Preview publication SHALL be coalesced to at most five updates per second per run. Existing record and node safety bounds SHALL remain. Incomplete or omitted evidence MUST be labelled. These display bounds MUST NOT change launch admission, permissions, cleanup or delivery.

#### Scenario: A large tree exceeds the observation bound

- **WHEN** configured runs produce more observations than the viewer retains
- **THEN** the tree reports omitted observations
- **AND** admitted runs keep their configured execution behaviour

#### Scenario: An observation is malformed or oversized

- **WHEN** a valid transport contains invalid or oversized display metadata
- **THEN** that observation is rejected without changing a run outcome

#### Scenario: A child streams a large answer

- **WHEN** visible assistant text exceeds the preview bound or arrives rapidly
- **THEN** retained display text and preview publication stay within their limits
- **AND** normal model output, lifecycle processing and saved-result collection continue

### Requirement: Keep observation separate from conversation and control

Observations SHALL remain display-only, with optional sanitised task labels and visible assistant previews. Tool arguments, raw results, thinking, stderr, system history and authentication fields SHALL remain excluded. Updates MUST NOT trigger model requests, duplicate results, hold execution tools open, prove completion or grant ancestor control over another immediate parent's child.

#### Scenario: A descendant emits frequent progress

- **WHEN** display metadata changes during a run
- **THEN** the viewer updates without requesting another model turn
- **AND** the terminal result reaches the immediate parent once

#### Scenario: The root attempts direct descendant cancellation

- **WHEN** the root uses an observed grandchild id with the existing cancel command
- **THEN** immediate-parent ownership checks still apply

#### Scenario: Sensitive tool fields appear in RPC records

- **WHEN** records contain tool arguments, results, thinking, authentication fields or system history
- **THEN** those fields do not enter retained presentation metadata

#### Scenario: A live preview arrives before clean exit

- **WHEN** a child has visible assistant text but exit or cleanup is unconfirmed
- **THEN** that preview is labelled provisional
- **AND** the run cannot become completed from the preview

## ADDED Requirements

### Requirement: Correlate display text with the submitted run

Task labels and assistant previews SHALL belong to the validated run identity and submitted task. Replayed startup content, foreign records and stale revisions MUST NOT populate another run's text. Sanitisation SHALL remove terminal controls and direction overrides without rewriting saved output. Older records without these optional fields SHALL remain valid.

#### Scenario: A grandchild produces answer text

- **WHEN** a validated grandchild emits visible assistant text for its submitted task
- **THEN** the root can inspect its provisional preview beneath the correct parent
- **AND** no sibling preview changes

#### Scenario: Startup or delayed evidence arrives

- **WHEN** assistant content belongs to startup replay or an older revision
- **THEN** it does not replace current task display text

#### Scenario: A record uses the earlier metadata shape

- **WHEN** a valid observation omits task and preview fields
- **THEN** its lifecycle and tool information remain observable
- **AND** unavailable text stays labelled rather than invented

#### Scenario: Display text contains terminal instructions

- **WHEN** task labels or assistant previews contain terminal controls or direction overrides
- **THEN** the UI shows safe text
- **AND** saved task and answer files are unchanged
