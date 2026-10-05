# Configurable run limits

## Purpose

Let operators choose parallel child capacity and nesting depth in their existing YAML while preserving safe launch admission.

## ADDED Requirements

### Requirement: Read operator-defined limits

The system SHALL accept optional `limits.maxConcurrentRuns` and `limits.maxDepth` in version `1` of `om-pi-subagents.yaml`.
`maxConcurrentRuns` MUST be a safe integer of at least `1`. `maxDepth` MUST be a safe integer of at least `0`.
Omitted fields SHALL default to `1`. The system MUST NOT impose a separate fixed child-count or depth ceiling.
Invalid values and unknown limit fields MUST identify the YAML field and block launches.

#### Scenario: Existing YAML omits limits

- **WHEN** a valid mapping has no `limits` section
- **THEN** each parent can start one direct child and the maximum depth is `1`

#### Scenario: Operator chooses capacity and depth

- **WHEN** the mapping sets `maxConcurrentRuns: 4` and `maxDepth: 3`
- **THEN** each parent has four direct child slots and launches can reach depth `3`

#### Scenario: Values exceed the documentation example

- **WHEN** the operator sets valid limits of seven direct children and depth five
- **THEN** those limits are accepted without being clamped to four children or depth three

#### Scenario: One field is omitted

- **WHEN** the `limits` mapping contains only `maxConcurrentRuns: 4`
- **THEN** concurrency is four and maximum depth remains `1`

#### Scenario: Limits are malformed

- **WHEN** limits contain an unknown key, invalid mapping shape, wrong type, fraction, unsafe integer or out-of-range value
- **THEN** validation names the field and explains its accepted form
- **AND** no child starts using old settings

### Requirement: Reserve capacity per immediate parent

The system SHALL count direct runs in `starting`, `running` and `stopping` against their owning session's capacity.
Simultaneous launches MUST NOT exceed the configured capacity.
Excess launches SHALL fail immediately with the limit, active run ids and instructions to wait, cancel or edit YAML.
Another parent session's children MUST NOT consume the caller's direct slots.

#### Scenario: Several launches arrive together

- **WHEN** five valid launches arrive for one session with a limit of four
- **THEN** exactly four are admitted
- **AND** the fifth starts no process and receives useful capacity guidance

#### Scenario: A run is stopping

- **WHEN** a cancelled child has not finished cleanup
- **THEN** it still occupies its parent's direct slot

#### Scenario: A child delegates while the root is full

- **WHEN** a root has four active children and one child starts its own subagent under a limit of four
- **THEN** that launch uses the child's capacity rather than a root slot

#### Scenario: Ordinary failure frees a slot

- **WHEN** a run fails with confirmed cleanup
- **THEN** its direct slot becomes available without changing unrelated runs

### Requirement: Apply coherent fresh settings at admission

Every launch SHALL use one freshly validated configuration snapshot for its persona and limits.
A failed refresh MUST block launches. Running children SHALL retain their captured persona and launch evidence.
Lowering concurrency MUST leave existing runs alive and reject new launches until capacity is available.

#### Scenario: The operator increases capacity

- **WHEN** capacity changes from one to four while one child is active
- **THEN** a subsequent launch can use an additional direct slot without a reload

#### Scenario: The operator lowers capacity

- **WHEN** capacity changes from four to one while three children are active
- **THEN** those children continue
- **AND** new launches fail until fewer than one direct child remains active

#### Scenario: Configuration refreshes overlap

- **WHEN** concurrent launch requests observe different valid file revisions
- **THEN** each request uses the persona and limits from its own complete revision

### Requirement: Preserve cleanup blocking and ownership

Unconfirmed cleanup SHALL block new launches for the affected owner regardless of remaining capacity.
Status and cancellation MUST preserve immediate-parent ownership. A foreign run id MUST behave as an unknown id.

#### Scenario: Cleanup fails below the capacity limit

- **WHEN** one run has unconfirmed cleanup and the owner has spare slots
- **THEN** another launch is refused with recovery guidance
- **AND** the owner can still inspect and cancel its other runs

#### Scenario: A caller uses a sibling's run id

- **WHEN** a session requests status or cancellation for a run owned by another session
- **THEN** the request reports an unknown run and sends no cancellation signal
