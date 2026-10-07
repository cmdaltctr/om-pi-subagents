# OMPSS command interface delta

## MODIFIED Requirements

### Requirement: Preserve explicit commands and useful validation

Existing `list`, `run`, `status`, `cancel` and `inspect [run-id]` forms SHALL keep their meaning and ownership checks. The additive `fleet` form SHALL provide current-session fleet access without execution. Unknown or malformed subcommands SHALL show actionable usage guidance. Service failures SHALL remain error notifications. Bare `/ompss` SHALL remain status rather than opening a view.

#### Scenario: An explicit command is valid

- **WHEN** the operator enters a supported execution command with required arguments
- **THEN** it calls the same current-session operation as before

#### Scenario: A subcommand is incomplete or unknown

- **WHEN** a command is unknown or lacks required arguments
- **THEN** usage guidance is shown at warning level and no child starts

#### Scenario: A valid command reaches a service error

- **WHEN** a requested operation fails in the service
- **THEN** the parent receives its actionable error notification

#### Scenario: Inspection syntax is malformed

- **WHEN** inspect receives extra arguments or an invalid run id
- **THEN** usage guidance includes `inspect [run-id]` before any file read or launch

#### Scenario: Fleet is used in interactive Pi

- **WHEN** the operator enters `/ompss fleet`
- **THEN** the current fleet toggles without starting a model request or process
- **AND** an empty session receives a clear empty-state message

#### Scenario: Fleet is used through RPC

- **WHEN** `/ompss fleet` is requested by an RPC client
- **THEN** it receives bounded plain current-session summary text
- **AND** no custom terminal widget or modal is attempted

#### Scenario: Fleet syntax is malformed

- **WHEN** `fleet` receives extra arguments
- **THEN** usage guidance is shown before file access or execution

### Requirement: Provide native operator settings dialogs

`/ompss-settings` SHALL be the canonical operator settings command, with `/subagents-settings` as an alias. Native dialogs SHALL expose depth, per-parent concurrency, visible roots, fleet/inspection shortcuts and per-agent Memory/Todo switches. The menu SHALL show effective values, sources, selected YAML destination and reload needs. Opening settings SHALL start no process or model request and change no mapping. Registration MUST perform no file access.

#### Scenario: The operator opens settings

- **WHEN** `/ompss-settings` is entered with supported UI dialogs
- **THEN** the menu shows current execution and UI values with their source and save destination
- **AND** an existing agent can be selected to inspect its Memory/Todo mapping states
- **AND** an edit requires confirmation

#### Scenario: The legacy command is used

- **WHEN** `/subagents-settings` is entered
- **THEN** it uses the same menu, validation and save destination as `/ompss-settings`

#### Scenario: A dialog is cancelled

- **WHEN** an input is cancelled or save confirmation is declined
- **THEN** that setting and its file remain unchanged
- **AND** earlier confirmed edits remain in effect

#### Scenario: UI dialogs are unavailable

- **WHEN** either settings command is used without supported dialogs
- **THEN** an actionable error is shown before reading or writing settings

#### Scenario: Settings is requested through RPC

- **WHEN** an RPC client supports selection, input and confirmation
- **THEN** settings uses those native dialog requests rather than a custom terminal component

#### Scenario: Settings syntax is malformed

- **WHEN** either settings command receives extra arguments
- **THEN** usage guidance is shown before file access and no setting changes

### Requirement: Keep execution limits in the selected registry

Settings SHALL keep `limits.maxDepth` and `limits.maxConcurrentRuns` in the selected registry under existing path rules. Depth MUST be a safe integer of at least zero, counted from root zero. Concurrency MUST be a safe integer of at least one, counting direct children per immediate parent. UI edits SHALL use the same registry without changing execution limits. Settings MUST NOT create another execution-limit source or grant delegation permission.

#### Scenario: A valid limit is confirmed

- **WHEN** an operator confirms an execution-limit edit
- **THEN** that field is saved after complete registry validation
- **AND** mappings, resource paths, comments, other limits and UI fields are preserved

#### Scenario: The registry path is overridden

- **WHEN** `OMPSS_REGISTRY` selects another file
- **THEN** settings displays and saves that destination while leaving the default registry untouched

#### Scenario: A registry does not yet exist

- **WHEN** an operator confirms creating missing YAML during a settings save
- **THEN** a valid version-one registry with `agents: {}` is created
- **AND** no persona, model or delegation permission is supplied

#### Scenario: A value or registry is invalid

- **WHEN** input is invalid or registry YAML is malformed or unreadable
- **THEN** settings explains how to correct it without overwriting the file
- **AND** launches cannot reuse stale configuration

#### Scenario: Concurrency is lowered below active work

- **WHEN** saved concurrency is lower than the admitted direct-child count
- **THEN** admitted children continue
- **AND** fresh launches remain blocked until capacity exists

#### Scenario: Depth changes while a branch runs

- **WHEN** maximum depth is changed
- **THEN** future launches respect fresh YAML and the inherited branch ceiling
- **AND** admitted work is neither cancelled nor granted a higher inherited ceiling

#### Scenario: Depth zero is saved

- **WHEN** an operator confirms depth zero
- **THEN** new launches are disabled while admitted work keeps normal supervision and delivery

## ADDED Requirements

### Requirement: Configure display and shortcuts in YAML

Version-one YAML SHALL accept optional `ui.maxVisibleAgents`, `ui.toggleKey` and `ui.inspectKey`. Defaults SHALL be five, Alt+O and Alt+I respectively. Visible roots MUST be safe integers from one to 256; keys MUST be valid non-conflicting specifications or `off`. Unknown or invalid fields MUST identify their YAML path. YAML without `ui` SHALL remain valid. UI rendering MUST use cached values without file access.

#### Scenario: UI settings are omitted

- **WHEN** valid existing YAML has no `ui` mapping or legacy display value
- **THEN** the default settings apply and the fleet starts collapsed
- **AND** rendering creates no settings file

#### Scenario: A UI value is confirmed through settings

- **WHEN** an operator confirms a valid UI edit
- **THEN** the matching YAML field is saved
- **AND** editing that same field by hand produces the same effective value

#### Scenario: Invalid UI YAML is loaded

- **WHEN** a UI mapping has unknown fields or invalid values
- **THEN** an actionable diagnostic names the field
- **AND** new launches cannot proceed on an invalid registry
- **AND** retained run evidence remains inspectable

#### Scenario: Display and shortcut edits take effect

- **WHEN** a visible-root value is saved
- **THEN** the fleet repaints immediately
- **WHEN** a shortcut is saved
- **THEN** settings distinguishes the saved binding from the active one and requests `/reload`

### Requirement: Import legacy display preferences explicitly

The old OMPSS display JSON SHALL be read-only compatibility input for `maxVisibleAgents` when YAML omits its replacement. YAML SHALL take precedence. Settings SHALL label a legacy source and offer confirmed import into YAML. Invalid legacy data SHALL produce a diagnostic and use the default. Import MUST NOT delete or rewrite the old file, copy unrelated keys or touch sibling preferences.

#### Scenario: A valid legacy preference exists

- **WHEN** YAML omits `ui.maxVisibleAgents` and legacy JSON has a valid value
- **THEN** that visible-root value remains effective and settings labels its legacy source
- **AND** no migration write occurs without confirmation

#### Scenario: YAML already declares the preference

- **WHEN** both YAML and legacy JSON contain a visible-root value
- **THEN** YAML wins and the old JSON is not written

#### Scenario: Legacy import is confirmed

- **WHEN** the operator confirms importing the displayed legacy value
- **THEN** only the corresponding YAML UI field is saved with normal conflict protection
- **AND** future loads use YAML while the legacy file remains untouched

#### Scenario: Legacy import is cancelled or invalid

- **WHEN** import is declined or legacy data is malformed
- **THEN** no file is overwritten
- **AND** invalid data is diagnosed without changing execution limits

### Requirement: Keep OMPSS settings separate from sibling configuration

OMPSS settings SHALL edit only selected OMPSS YAML. They MUST NOT write Pi keybindings, todo preferences/tasks/OpenSpec bindings, or OMMS configuration/stores. View toggles SHALL be session-local. Existing approved-tool and resource mappings SHALL not change merely because a view or settings command opens.

#### Scenario: Both siblings are loaded

- **WHEN** OMPSS settings is used with real todo and memory extensions present
- **THEN** only the confirmed OMPSS setting or selected agent's capability lists change
- **AND** sibling data, configuration and shortcuts stay independent

#### Scenario: View state changes

- **WHEN** an operator expands, collapses or inspects a fleet
- **THEN** no settings file, todo task or memory record is written by OMPSS

### Requirement: Expose per-agent capability switches

Settings SHALL offer Memory and Todo controls for existing mapped agents. Their state SHALL come from that agent's explicit tools and recognised sibling resources, without new permission flags. New mappings SHALL default to Off unless explicitly configured. Complete existing mappings SHALL stay configured; incomplete or ambiguous mappings MUST be labelled Partial. Parent extension state MUST remain separate.

#### Scenario: A new mapping has no sibling capability

- **WHEN** its lists contain no recognised sibling resource or matching tool approval
- **THEN** Memory and Todo show Off
- **AND** settings performs no automatic package installation or mapping write

#### Scenario: An existing mapping is complete

- **WHEN** an agent already explicitly maps a sibling entry and its exact tool
- **THEN** the matching control shows On as a configuration state
- **AND** opening settings preserves that mapping without claiming backend health

#### Scenario: A mapping is incomplete

- **WHEN** a tool approval, recognised extension or shipped skill exists without a complete capability mapping
- **THEN** settings shows Partial with guidance
- **AND** it does not claim that extension hooks are disabled

#### Scenario: No agents are mapped

- **WHEN** the operator opens Agent capabilities with an empty registry
- **THEN** settings explains that an agent must first be mapped
- **AND** it creates no persona or agent configuration

### Requirement: Confirm coherent capability edits

Enabling SHALL validate operator-selected installed resources and propose the selected agent's exact tool, extension and optional shipped skill entries. Disabling SHALL remove its matching tool and recognised sibling resources together. Related changes MUST be confirmed and saved atomically with conflict checks. Repeated requests SHALL be idempotent. Other tools, agents and settings MUST remain unchanged. Ambiguous ownership MUST NOT cause guessed removal.

#### Scenario: A capability is enabled later

- **WHEN** the operator selects an existing agent and confirms valid installed Memory or Todo resources
- **THEN** its related YAML lists are saved together without duplicate entries
- **AND** the capability is available to future launches through normal readiness and exact-tool checks

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

### Requirement: Apply capability edits to future launches

Confirmed capability edits SHALL take effect on the selected agent's next fresh launch without requiring an OMPSS reload. Admitted runs SHALL keep their captured tools and resources. Edits MUST NOT mutate parent extension settings or other agent mappings. Descendant targets SHALL use their own fresh mappings rather than inherit a parent's switch state.

#### Scenario: A capability changes while a child runs

- **WHEN** the operator enables or disables a capability for its mapped agent
- **THEN** the running child retains its captured tools and resources
- **AND** the next launch follows the saved mapping

#### Scenario: The parent already uses memory and todo

- **WHEN** both child capability controls are Off
- **THEN** OMPSS does not load those sibling resources into an unmapped child
- **AND** parent memory/todo tools and preferences stay unchanged

#### Scenario: Another target is delegated

- **WHEN** an approved parent delegates to a different mapped agent
- **THEN** that target's own saved lists determine its capabilities
- **AND** the delegator's Memory/Todo state is not copied into the target
