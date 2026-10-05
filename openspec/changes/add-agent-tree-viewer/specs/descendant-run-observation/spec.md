# Descendant run observation

## Purpose

Let an owning session observe the work underneath its direct runs while preserving immediate-parent control and truthful run outcomes.

## ADDED Requirements

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

The observation path SHALL bound record sizes, retained nodes and tool metadata. It MUST report incomplete or omitted observations when those bounds are exceeded. Display capacity MUST NOT change launch admission, nesting permissions, cleanup or result delivery.

#### Scenario: A large tree exceeds the observation bound

- **WHEN** configured runs produce more observations than the viewer retains
- **THEN** the tree reports that observations are omitted
- **AND** all admitted runs keep their configured execution behaviour

#### Scenario: An observation is malformed or oversized

- **WHEN** the display path receives invalid or oversized observation metadata inside a valid transport record
- **THEN** it rejects that observation without changing any run outcome

### Requirement: Keep observation separate from conversation and control

Observation updates SHALL remain display-only and SHALL exclude tool arguments, raw tool results, thinking, stderr and authentication fields. They MUST NOT trigger model requests, duplicate result messages, keep execution tools open or allow an ancestor to control a descendant owned by another immediate parent.

#### Scenario: A descendant emits frequent progress

- **WHEN** its display metadata changes during a run
- **THEN** the root viewer updates without requesting another model turn
- **AND** the normal terminal result reaches the immediate parent once

#### Scenario: The root attempts direct descendant cancellation

- **WHEN** the root knows a grandchild's id through the viewer and uses the existing cancel command with that id
- **THEN** existing immediate-parent ownership checks still apply

#### Scenario: Sensitive tool fields appear in RPC records

- **WHEN** a child emits tool arguments, results or authentication fields
- **THEN** those fields do not enter the observation metadata

### Requirement: End observation with its owning session

Replacing or shutting down a session SHALL detach its display observers. Late events MUST NOT populate the successor session. Missing display observations SHALL be labelled incomplete without changing execution or cleanup rules. Actual RPC connection loss MUST retain its existing failure and teardown behaviour.

#### Scenario: A session changes during descendant activity

- **WHEN** the old session ends and another session becomes active
- **THEN** the old tree and subscriptions are removed
- **AND** delayed descendant records remain invisible to the successor

#### Scenario: A display subscriber throws

- **WHEN** rendering or observation callbacks fail
- **THEN** run supervision, cleanup and result persistence continue
