# Nested subagents

## Purpose

Allow approved children to delegate within a configured depth while keeping results, process ownership and cleanup reliable.

## ADDED Requirements

### Requirement: Enforce depth from the root

The root session SHALL have depth `0`; each launch SHALL add one to its immediate parent's depth.
Launches beyond the effective `maxDepth` MUST fail before spawning, with the current depth, attempted depth and limit identified.
A marked child with missing or malformed lineage MUST fail validation rather than become a root.

#### Scenario: Maximum depth is three

- **WHEN** `maxDepth` is three and each target approves delegation
- **THEN** the root can launch a child, that child a grandchild, and that grandchild a great-grandchild
- **AND** a depth-three session cannot launch a depth-four child

#### Scenario: Depth zero disables launches

- **WHEN** `maxDepth` is zero
- **THEN** root launches fail without starting a child
- **AND** mapped-agent listing and status remain available

#### Scenario: Child lineage is invalid

- **WHEN** a marked child has missing, malformed or inconsistent depth metadata
- **THEN** readiness fails before the task reaches a model

### Requirement: Preserve the branch's depth permission

A running branch SHALL retain its captured maximum depth as a ceiling.
A nested launch SHALL also respect the freshly read YAML limit, using the smaller ceiling.
Later changes MUST NOT change the branch's existing run settings or cancel its active descendants.

#### Scenario: The operator raises maximum depth

- **WHEN** an active branch captured depth one and the operator changes YAML to depth three
- **THEN** that branch remains limited to depth one
- **AND** a new root launch captures depth three

#### Scenario: The operator lowers maximum depth

- **WHEN** an active branch captured depth three and YAML now specifies depth one
- **THEN** new launches in that branch cannot exceed depth one
- **AND** already running deeper descendants continue under their saved settings

### Requirement: Require explicit delegation approval

Only a mapping that approves the exact tool `ompss` SHALL let its child call OMPSS.
Every nested target SHALL use its freshly validated persona, own approved tools and explicit thinking setting.
Omitted models SHALL inherit from the immediate parent. Ambient resources MUST remain disabled.

#### Scenario: Delegation is approved

- **WHEN** a child whose tools include `ompss` requests a valid mapped target within both limits
- **THEN** the target starts in that child's session ownership and requested working directory
- **AND** it uses the same operator registry selected for the parent

#### Scenario: Delegation is absent

- **WHEN** a child whose tools omit `ompss` attempts to call it
- **THEN** the call cannot start a subagent

#### Scenario: The child is at the depth limit

- **WHEN** an approved `ompss` tool is called from a session at maximum depth
- **THEN** it reports the depth limit rather than failing readiness because the tool is missing

#### Scenario: The target has different approved tools

- **WHEN** a delegating persona selects an operator-mapped target with write-capable tools
- **THEN** the target uses its own approved tools
- **AND** listings and documentation identify delegation as a capability that can indirectly change files

### Requirement: Retain lineage in run evidence

Saved launch and status evidence SHALL identify the run's depth, root session, immediate parent run when present and effective limits.
Existing private storage permissions and validated identifiers MUST remain in force.

#### Scenario: A grandchild starts

- **WHEN** a depth-one child starts a grandchild
- **THEN** the grandchild's saved evidence identifies depth two and its immediate parent run
- **AND** its files remain private under the owning session's run directory

### Requirement: Let a delegated parent consume descendant results

A delegated parent MUST NOT reach successful final settlement while its direct runs or their result-delivery attempts remain pending.
Completed and failed descendant results SHALL reach their immediate parent separately and at most once.
The parent SHALL have an opportunity to use delivered results before its final answer is accepted.
Delivery failure MUST NOT change an already completed descendant's outcome. Cancelled runs SHALL keep their no-follow-up behaviour.

#### Scenario: The parent model finishes before its children

- **WHEN** a delegated parent finishes a turn while two children are running
- **THEN** the parent remains alive until they finish and delivery is attempted
- **AND** delivered results can trigger the parent's next turn before final settlement

#### Scenario: Output delivery is delayed after completion

- **WHEN** a descendant reaches its terminal state before its saved output read finishes
- **THEN** the delegated parent still waits for the result-delivery attempt

#### Scenario: A descendant fails normally

- **WHEN** a descendant fails with confirmed cleanup and saved partial output
- **THEN** its immediate parent receives the failure with labelled partial output
- **AND** the parent can explain or handle that failure in its own answer

#### Scenario: A descendant is cancelled

- **WHEN** the parent cancels a descendant
- **THEN** no automatic result message is sent for that run
- **AND** confirmed cleanup releases its slot and settlement wait

### Requirement: Stop the owned subtree

Cancelling a run, timing it out, or shutting down its owning session SHALL stop its owned descendants.
Admission MUST close before teardown. Cleanup MUST cover descendants outside the parent's process group.
Unconfirmed descendant cleanup MUST propagate as a failed ancestor outcome with new launches blocked.

#### Scenario: One root child is cancelled

- **WHEN** a root cancels a child with a grandchild and great-grandchild
- **THEN** that subtree stops and cleanup is checked
- **AND** unrelated root children remain active

#### Scenario: Cancellation occurs during settlement waiting

- **WHEN** a parent is waiting for descendants and receives cancellation or its deadline expires
- **THEN** the wait ends without requiring a model response
- **AND** its subtree is cancelled and cleaned up

#### Scenario: Shutdown races another launch

- **WHEN** shutdown begins while another direct launch is being validated
- **THEN** the late launch is refused before spawning

#### Scenario: Descendant cleanup is uncertain

- **WHEN** a descendant's cleanup cannot be confirmed
- **THEN** the ancestor cannot be reported completed
- **AND** the affected ancestor owner refuses further launches with recovery guidance

### Requirement: Record the architecture and update public guidance

The repository SHALL contain ADR-005 for configurable per-session concurrency and nesting, with an entry in the ADR index.
The ADR MUST describe the chosen limits, depth counting, ownership, result timing, cleanup and todo boundaries.
It SHALL remain Proposed until implementation is verified, then become Accepted.
README and the public setup, installation, usage and removal guides SHALL describe the implemented behaviour and packaged skill.
Their examples MUST match the supported YAML and commands. Existing operator configuration and unrelated guide edits MUST remain untouched.

#### Scenario: Planning is ready for implementation

- **WHEN** the change is presented for implementation
- **THEN** ADR-005 exists with Proposed status and an index entry
- **AND** the implementation checklist includes public docs and the packaged skill

#### Scenario: Implementation is verified

- **WHEN** the change passes its implementation checks
- **THEN** ADR-005 records the implemented decision with Accepted status
- **AND** public guides explain configurable capacity, root depth zero, inherited ceilings, nested permissions, subtree cancellation and todo ownership
- **AND** they show how to invoke the skill and load it explicitly in approved children

#### Scenario: An operator follows a documented example

- **WHEN** a setup or usage example is checked against the shipped extension
- **THEN** its YAML validates and its commands perform the documented operation
- **AND** the guides explain that per-parent capacity can multiply total descendant load

### Requirement: Publish an OMPSS operational skill

The package SHALL ship `skills/om-pi-subagents/SKILL.md`, with skill name `om-pi-subagents` and valid routing frontmatter.
A normal package install SHALL make it discoverable through `/skill:om-pi-subagents` when skill commands are enabled.
The skill MUST cover mapped-agent discovery, YAML limits, approved nesting, results, cancellation, cleanup failures and `om-pi-todo` ownership.
It MUST use portable references and supported examples without assuming personal paths, agent names or models.
Skill loading MUST NOT grant tools, alter live configuration or load ambient child resources.

#### Scenario: The package is installed

- **WHEN** an operator loads the package with its skill resources enabled
- **THEN** the OMPSS skill is available under its declared name
- **AND** its references resolve within the published package

#### Scenario: No agents are mapped

- **WHEN** the skill guides a delegation request and the mapping is empty
- **THEN** it identifies the missing mapping and points to setup guidance
- **AND** it does not invent or launch an agent

#### Scenario: A child explicitly maps the skill

- **WHEN** an approved delegating child's mapping lists the packaged skill in `skills`
- **THEN** the child can discover that skill while other ambient skills remain disabled

#### Scenario: Skill instructions lack tool approval

- **WHEN** a child loads the skill but its tool mapping omits `ompss`
- **THEN** skill instructions cannot enable delegation or bypass the guard

#### Scenario: The skill covers todo tracking

- **WHEN** the skill guides work with parent OpenSpec tracking and child-local todos
- **THEN** it keeps their task ownership separate
- **AND** it requires an explicit parent todo update rather than treating subagent completion as a checked task
