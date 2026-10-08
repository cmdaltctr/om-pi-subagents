# Spec Delta

## MODIFIED Requirements

### Requirement: Confirm coherent capability edits

Enabling SHALL find installed Memory or Todo resources from Pi's configured package list, validate them, and propose the selected agent's exact tool, extension and optional shipped skill entries. When detection finds no usable package, enabling SHALL offer an operator-typed installed package folder or published entry path. Disabling SHALL remove its matching tool and recognised sibling resources together. Related changes MUST be confirmed and saved atomically with conflict checks. Repeated requests SHALL be idempotent. Other tools, agents and settings MUST remain unchanged. Ambiguous ownership MUST NOT cause guessed removal. Detection MUST read package metadata only and MUST NOT import, execute or load a sibling extension.

#### Scenario: A capability is enabled later

- **WHEN** the operator selects an existing agent and confirms valid installed Memory or Todo resources
- **THEN** its related YAML lists are saved together without duplicate entries
- **AND** the capability is available to future launches through normal readiness and exact-tool checks

#### Scenario: One installed package is detected

- **WHEN** the operator enables Memory or Todo and Pi's package list names exactly one installed package that passes validation
- **THEN** OMPS proposes that package without asking for a path
- **AND** the confirmation dialog still shows the exact resources and destination

#### Scenario: Several installed packages are detected

- **WHEN** more than one distinct installed package passes validation for the same capability
- **THEN** OMPS asks the operator to choose one
- **AND** it does not select a package by order or guess

#### Scenario: A local package uses a relative source

- **WHEN** Pi lists a relative local package source
- **THEN** detection resolves it against the Pi agent directory before validation

#### Scenario: Parent package resources are filtered

- **WHEN** a listed package passes validation but its object entry disables automatic loading or filters resources
- **THEN** detection still offers it for an explicitly confirmed child capability mapping

#### Scenario: No installed package is detected

- **WHEN** Pi's package list names no usable package for the capability, or the settings file is missing or unreadable
- **THEN** OMPS shows installation guidance and offers the typed path prompt
- **AND** YAML stays unchanged unless the operator supplies a valid path and confirms

#### Scenario: A listed package is not usable

- **WHEN** a listed folder is missing, has a different package name, or has an invalid extension entry
- **THEN** OMPS skips that entry for detection
- **AND** it does not report the entry as an error unless no other package is usable

#### Scenario: Memory approval is confirmed

- **WHEN** memory enablement is proposed
- **THEN** confirmation shows the exact resources and destination
- **AND** it explains whole-tool write and portability permissions

#### Scenario: A capability is disabled

- **WHEN** the operator confirms disabling a recognised capability
- **THEN** its tool approval and mapped sibling extension/skill entries are removed together
- **AND** a future child loads neither that sibling entry nor its hooks
- **AND** unrelated resources are preserved

#### Scenario: A dependency is missing

- **WHEN** an enable request lacks valid installed resources
- **THEN** settings gives installation or path guidance and leaves YAML unchanged
- **AND** it neither installs a package nor executes its factory for discovery

#### Scenario: An edit is cancelled or conflicts

- **WHEN** confirmation is declined, validation fails, or the registry changed since display
- **THEN** no partial capability list edit is saved
- **AND** the current destination and active runs remain unchanged

#### Scenario: Resource ownership is ambiguous

- **WHEN** a custom wrapper or shared resource cannot be safely attributed to the selected sibling capability
- **THEN** settings requests an explicit resource choice or YAML correction
- **AND** it leaves the uncertain entry untouched
