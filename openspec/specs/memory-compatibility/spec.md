# memory-compatibility Specification

## Purpose

Let OMPSS coexist with OMMS and let explicitly approved children use real project memory without a second store or shared internal state.

## Requirements

### Requirement: Keep parent memory independent

OMPSS SHALL coexist with the real OMMS Pi extension in either load order. Memory recall, manual operations and configured capture SHALL remain owned by OMMS. Fleet display, inspection, settings and result delivery MUST NOT create memory records, change OMMS settings or replace its status ownership. OMPSS SHALL remain usable without OMMS installed.

#### Scenario: Both extensions load in either order

- **WHEN** real OMPSS and OMMS load in the parent in either order
- **THEN** `ompss` and `memory` remain available with their own lifecycle behaviour
- **AND** fleet interaction leaves memory configuration and its status entry unchanged

#### Scenario: Memory is absent

- **WHEN** OMPSS is loaded without OMMS
- **THEN** independent valid subagent mappings remain usable
- **AND** OMPSS neither installs memory nor reports a fabricated memory connection

#### Scenario: A run completes

- **WHEN** OMPSS delivers a completed child result
- **THEN** it uses its normal delivery path without directly writing memory
- **AND** the parent can assess the result through its ordinary tools

### Requirement: Load child memory explicitly

A child SHALL use real OMMS only through explicit resource lists, edited by the operator or a confirmed per-agent settings helper. Model calls SHALL require exact `memory` approval and normal readiness checks. Its shipped memory skill SHALL be loaded only when explicitly mapped. OMPSS MUST NOT inherit ambient parent extensions, create another backend or grant tools to repair a missing capability.

#### Scenario: OMMS is mapped and memory is approved

- **WHEN** a mapping loads the installed OMMS Pi entry and approves `memory`
- **THEN** the child can use the real memory tool through the normal guard
- **AND** its configured recall and capture hooks remain available

#### Scenario: OMMS is mapped without tool approval

- **WHEN** the extension is mapped but the child tool list omits `memory`
- **THEN** a model-issued memory call is blocked by the existing exact-tool guard
- **AND** mapping an extension is not treated as tool permission

#### Scenario: Approval has no registered tool

- **WHEN** `memory` is approved but no mapped extension registers it
- **THEN** readiness identifies the missing tool before sending the task to a model

#### Scenario: A skill is mapped alone

- **WHEN** memory guidance is present without memory tool approval
- **THEN** the skill cannot grant the tool or bypass readiness and permission checks

### Requirement: Preserve OMMS project and session scope

Approved child memory operations SHALL use the real extension's cwd and session identity. Same-project sessions SHALL use OMMS's existing shared-project scope; another cwd SHALL retain OMMS's own scope rules. OMPSS MUST NOT copy memory stores, supply a parent session id, create worktree aliases or mirror profile/configuration state.

#### Scenario: Siblings share a project

- **WHEN** two approved children use memory from the same project cwd
- **THEN** their operations use that project's real shared store with distinct session identities
- **AND** normal OMMS concurrency rules apply

#### Scenario: A different project is selected

- **WHEN** a child launches in a different cwd
- **THEN** memory scope follows that cwd under OMMS rules
- **AND** OMPSS does not silently substitute the parent's project

### Requirement: Keep machine-wide maintenance out of managed memory children

Managed children SHALL use OMMS's existing process flags to disable web/login-item autostart and automatic history backfill. These child-local flags MUST NOT change parent configuration or disable ordinary recall, approved manual memory operations or configured settled capture. No OMMS implementation change SHALL be required for this integration.

#### Scenario: Several memory-enabled children start

- **WHEN** approved children initialise their real OMMS extensions
- **THEN** they do not each start web/login-item reconciliation or automatic history import
- **AND** their ordinary project memory operations remain available

#### Scenario: A parent has automatic maintenance enabled

- **WHEN** it starts a managed child
- **THEN** only the child's process has the maintenance opt-outs
- **AND** the parent's configuration and maintenance ownership stay unchanged

### Requirement: Keep memory outcomes separate from run completion

A memory backend or capture failure SHALL remain a memory outcome, without independently deciding an OMPSS lifecycle state. Registered capability MUST NOT be displayed as proof of backend health. Child settled capture SHALL remain ordinary OMMS evidence rather than verified OMPSS completion. Saving a verified project decision SHALL remain an explicit parent action through its own tools.

#### Scenario: Retrieval or capture fails

- **WHEN** a mapped memory extension cannot retrieve or capture
- **THEN** OMPSS retains its normal execution, saved-output and cleanup rules
- **AND** no UI metadata invents successful memory persistence

#### Scenario: Capture precedes cleanup

- **WHEN** OMMS captures a child's settled work before exit or cleanup is confirmed
- **THEN** that memory does not prove the child completed successfully
- **AND** OMPSS still requires its existing completion gates

#### Scenario: A verified finding is useful later

- **WHEN** the parent verifies a child result and chooses to retain a finding
- **THEN** it can use the real `memory` tool with normal project scope
- **AND** OMPSS does not perform a duplicate automatic save

### Requirement: Keep sibling compatibility bounded

OMPSS SHALL require only the published memory tool/skill and ordinary Pi lifecycle contracts for memory integration. It MUST NOT depend on OMMS internal stores, clients, UI state or schemas for fleet rendering. Compatibility checks SHALL use real published entry points and disposable data; skipped optional checks MUST be reported as unverified.

#### Scenario: OMMS changes its internals

- **WHEN** it preserves its external tool, lifecycle and process-flag contracts
- **THEN** OMPSS needs no memory-store adapter update

#### Scenario: Compatibility fixtures are unavailable

- **WHEN** a real optional sibling fixture cannot run
- **THEN** its verification is reported as skipped or blocked
- **AND** the report does not imply sibling compatibility passed

### Requirement: Keep child memory opt-in and enableable later

New child mappings SHALL use no OMMS capability unless explicitly configured. `/ompss-settings` SHALL enable or disable Memory per agent by confirming changes to its existing resource and tool lists. Off SHALL remove the OMMS entry and approved tool for future launches, including its recall/capture hooks. Existing complete mappings and admitted runs MUST remain unchanged until an explicit edit affects a later launch. Parent OMMS behaviour SHALL stay independent.

#### Scenario: Default child memory is off

- **WHEN** a new agent has no OMMS resources or memory approval
- **THEN** its child uses no OMMS recall, capture or memory tool
- **AND** OMPSS works without OMMS installed

#### Scenario: Memory is enabled after deployment

- **WHEN** an operator later confirms valid installed OMMS resources for a selected agent
- **THEN** the existing YAML lists enable memory on its next launch
- **AND** no further OMPSS code change or sibling-internal adapter is needed

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
