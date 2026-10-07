# Memory compatibility delta

## MODIFIED Requirements

### Requirement: Keep parent memory independent

OMPS SHALL coexist with the real OMMS Pi extension in either load order. Memory recall, manual operations and configured capture SHALL remain owned by OMMS. Fleet display, inspection, settings and result delivery MUST NOT create memory records, change OMMS settings or replace its status ownership. OMPS SHALL remain usable without OMMS installed.

#### Scenario: Both extensions load in either order

- **WHEN** real OMPS and OMMS load in the parent in either order
- **THEN** `omps` and `memory` remain available with their own lifecycle behaviour
- **AND** fleet interaction leaves memory configuration and its status entry unchanged

#### Scenario: Memory is absent

- **WHEN** OMPS is loaded without OMMS
- **THEN** independent valid subagent mappings remain usable
- **AND** OMPS neither installs memory nor reports a fabricated memory connection

#### Scenario: A run completes

- **WHEN** OMPS delivers a completed child result
- **THEN** it uses its normal delivery path without directly writing memory
- **AND** the parent can assess the result through its ordinary tools

### Requirement: Keep child memory opt-in and enableable later

New child mappings SHALL use no OMMS capability unless explicitly configured. `/omps-settings` SHALL enable or disable Memory per agent by confirming changes to its existing resource and tool lists. Off SHALL remove the OMMS entry and approved tool for future launches, including its recall/capture hooks. Existing complete mappings and admitted runs MUST remain unchanged until an explicit edit affects a later launch. Parent OMMS behaviour SHALL stay independent.

#### Scenario: Default child memory is off

- **WHEN** a new agent has no OMMS resources or memory approval
- **THEN** its child uses no OMMS recall, capture or memory tool
- **AND** OMPS works without OMMS installed

#### Scenario: Memory is enabled after deployment

- **WHEN** an operator later confirms valid installed OMMS resources for a selected agent
- **THEN** the existing YAML lists enable memory on its next launch
- **AND** no further OMPS code change or sibling-internal adapter is needed

#### Scenario: Memory is disabled after use

- **WHEN** the operator confirms removal of the recognised OMMS entry, its shipped skill if mapped, and memory approval
- **THEN** future children of that mapping use no OMMS hooks or memory tool
- **AND** any already running child retains its captured configuration

#### Scenario: An existing explicit mapping is loaded

- **WHEN** the operator already mapped OMMS and approved memory before this change
- **THEN** that explicit configuration remains effective
- **AND** default-off behaviour does not silently strip existing resources

#### Scenario: A parent uses OMMS independently

- **WHEN** a child's Memory control is Off
- **THEN** the parent's own OMMS tools, settings and lifecycle remain unchanged
