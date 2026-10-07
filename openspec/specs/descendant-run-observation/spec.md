# Descendant run observation Specification

## Purpose

Let an owning session observe the work underneath its direct runs while preserving immediate-parent control and truthful run outcomes.

## Requirements

### Requirement: Associate observations with the owned subtree

The system SHALL associate each observed descendant with its run id, immediate parent, depth and root session. It MUST accept only observations belonging to a direct run owned by the viewing session and consistent with that run's lineage. Agent names MUST NOT serve as identity.

#### Scenario: A child delegates twice

- **WHEN** an owned direct child starts two runs with the same mapped agent name
- **THEN** the viewer identifies them separately by run id
- **AND** both appear under their actual immediate parent

#### Scenario: A great-grandchild starts

- **WHEN** an approved grandchild delegates within the existing depth ceiling
- **THEN** the owning root can observe that great-grandchild under its recorded parent
- **AND** observation grants no additional launch or control permission

#### Scenario: An observation has foreign or inconsistent lineage

- **WHEN** an observation belongs to another root, another direct-run subtree, an invalid parent or inconsistent depth
- **THEN** it does not enter the current session's tree
- **AND** normal supervision continues

### Requirement: Preserve authoritative lifecycle order

Observed nodes SHALL report the state determined by their immediate parent's run manager. Replayed, duplicated or delayed observations MUST NOT regress terminal state or replace a newer snapshot. Parent completion and tool completion MUST NOT independently prove descendant completion.

#### Scenario: A terminal update precedes a delayed running update

- **WHEN** a descendant's completed state is followed by an older running snapshot
- **THEN** its displayed state remains completed

#### Scenario: Two descendants reuse a tool-call id

- **WHEN** siblings report tool activity with the same call id
- **THEN** ending one call leaves the other's activity unchanged

#### Scenario: An ancestor finishes while descendant evidence is missing

- **WHEN** the viewer receives an ancestor's terminal state without a confirmed terminal observation for a descendant
- **THEN** it labels that descendant's observation incomplete
- **AND** it does not invent a successful result

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

### Requirement: End observation with its owning session

Replacing or shutting down a session SHALL detach its display observers. Late events MUST NOT populate the successor session. Missing display observations SHALL be labelled incomplete without changing execution or cleanup rules. Actual RPC connection loss MUST retain its existing failure and teardown behaviour.

#### Scenario: A session changes during descendant activity

- **WHEN** the old session ends and another session becomes active
- **THEN** the old tree and subscriptions are removed
- **AND** delayed descendant records remain invisible to the successor

#### Scenario: A display subscriber throws

- **WHEN** rendering or observation callbacks fail
- **THEN** run supervision, cleanup and result persistence continue

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
