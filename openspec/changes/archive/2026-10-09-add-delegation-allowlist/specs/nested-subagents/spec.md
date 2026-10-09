# Spec Delta

## ADDED Requirements

### Requirement: Limit delegation targets per agent

An agent mapping that approves `omps` SHALL declare `delegates`, a list of mapped agent names that its child may launch through `omps`.
A nested launch MUST start only a target named in both the list captured when the child started and the list in freshly read YAML.
A refused launch MUST fail before spawning a process and MUST name the delegating agent, the requested target and the allowed targets.
The root session MUST NOT be limited by any agent's `delegates` list.

#### Scenario: The target is allowed

- **WHEN** a child mapped with `delegates: [a-writer]` calls `omps` to run `a-writer` within capacity and depth
- **THEN** `a-writer` starts under that child's session ownership

#### Scenario: The target is not allowed

- **WHEN** a child mapped with `delegates: [a-writer]` calls `omps` to run `a-review`
- **THEN** no process starts
- **AND** the tool error names the child's agent, `a-review` and the allowed target `a-writer`

#### Scenario: The operator narrows the list during a run

- **WHEN** a child started with `delegates: [a-writer, a-explore]` and the YAML now lists only `a-writer`
- **THEN** a new launch of `a-explore` from that child is refused
- **AND** already running descendants continue

#### Scenario: The operator widens the list during a run

- **WHEN** a child started with `delegates: [a-writer]` and the YAML now also lists `a-review`
- **THEN** that child still cannot launch `a-review`
- **AND** a child started after the edit can launch it

#### Scenario: The root launches an agent

- **WHEN** the root session runs any mapped agent
- **THEN** no `delegates` list restricts the launch

### Requirement: Validate delegation target lists

Registry validation SHALL reject a mapping that approves `omps` without `delegates`.
Registry validation SHALL reject a `delegates` field that is not a non-empty list of agent names.
Each entry MUST name an agent mapped in the same file.
A mapping that declares `delegates` MUST also approve the exact `omps` tool.
A rejected registry MUST block launches with the YAML path of the bad field, as other registry errors do.

#### Scenario: An entry names an unmapped agent

- **WHEN** `agents.a-build.delegates` contains `a-missing`
- **THEN** validation fails at `agents.a-build.delegates` and names `a-missing`

#### Scenario: Delegation is approved without a list

- **WHEN** a mapping's tools include `omps` and it has no `delegates` field
- **THEN** validation fails at that mapping's `delegates` field and tells the operator to add the list or remove `omps`

#### Scenario: The list is empty

- **WHEN** `delegates` is `[]`
- **THEN** validation fails and tells the operator to remove `omps` to disable delegation

#### Scenario: Delegation is not approved

- **WHEN** a mapping declares `delegates` but its tools omit `omps`
- **THEN** validation fails at that mapping's `delegates` field and says that `omps` is required

### Requirement: Show delegation targets

Listings SHALL show each delegating agent's allowed targets.
Inside a child with a `delegates` list, the `omps list` result SHALL contain only the targets that child may launch.
Saved launch evidence SHALL record the delegating agent and its captured list when one exists.

#### Scenario: The operator lists agents

- **WHEN** `/omps list` runs at the root and `a-build` declares `delegates: [a-writer]`
- **THEN** the `a-build` line shows that it can delegate to `a-writer` only

#### Scenario: A restricted child lists agents

- **WHEN** a child with `delegates: [a-writer]` calls `omps list`
- **THEN** the result lists `a-writer` and no other agent
