# Nested delegation delta

## RENAMED Requirements

- FROM: `### Requirement: Publish an OMPSS operational skill`
- TO: `### Requirement: Publish an OMPS operational skill`

## MODIFIED Requirements

### Requirement: Require explicit delegation approval

Only a mapping that approves the exact tool `omps` SHALL let its child call OMPS.
Every nested target SHALL use its freshly validated persona, own approved tools and explicit thinking setting.
Omitted models SHALL inherit from the immediate parent. Ambient resources MUST remain disabled. The old `ompss` tool entry MUST NOT approve the new tool.

#### Scenario: Delegation is approved

- **WHEN** a child whose tools include `omps` requests a valid mapped target within both limits
- **THEN** the target starts in that child's session ownership and requested working directory
- **AND** it uses the same operator registry selected for the parent

#### Scenario: Delegation is absent

- **WHEN** a child whose tools omit `omps` attempts to call it
- **THEN** the call cannot start a subagent

#### Scenario: The child is at the depth limit

- **WHEN** an approved `omps` tool is called from a session at maximum depth
- **THEN** it reports the depth limit rather than failing readiness because the tool is missing

#### Scenario: The target has different approved tools

- **WHEN** a delegating persona selects an operator-mapped target with write-capable tools
- **THEN** the target uses its own approved tools
- **AND** listings and documentation identify delegation as a capability that can indirectly change files

#### Scenario: Only old delegation approval is present

- **WHEN** the mapping lists `ompss` without exact `omps` approval
- **THEN** it does not gain new delegation permission
- **AND** unavailable approved tools still fail readiness before task submission

### Requirement: Publish an OMPS operational skill

The package SHALL ship `skills/om-pi-subagents/SKILL.md`, with skill name `om-pi-subagents` and valid routing frontmatter.
A normal package install SHALL make it discoverable through `/skill:om-pi-subagents` when skill commands are enabled.
The skill MUST cover mapped-agent discovery, YAML limits, approved nesting, results, cancellation, cleanup failures and `om-pi-todo` ownership.
It MUST use portable references and supported examples without assuming personal paths, agent names or models.
Skill loading MUST NOT grant tools, alter live configuration or load ambient child resources.

#### Scenario: The package is installed

- **WHEN** an operator loads the package with its skill resources enabled
- **THEN** the OMPS skill is available under its declared name
- **AND** its references resolve within the published package

#### Scenario: No agents are mapped

- **WHEN** the skill guides a delegation request and the mapping is empty
- **THEN** it identifies the missing mapping and points to setup guidance
- **AND** it does not invent or launch an agent

#### Scenario: A child explicitly maps the skill

- **WHEN** an approved delegating child's mapping lists the packaged skill in `skills`
- **THEN** the child can discover that skill while other ambient skills remain disabled

#### Scenario: Skill instructions lack tool approval

- **WHEN** a child loads the skill but its tool mapping omits `omps`
- **THEN** skill instructions cannot enable delegation or bypass the guard

#### Scenario: The skill covers todo tracking

- **WHEN** the skill guides work with parent OpenSpec tracking and child-local todos
- **THEN** it keeps their task ownership separate
- **AND** it requires an explicit parent todo update rather than treating subagent completion as a checked task
