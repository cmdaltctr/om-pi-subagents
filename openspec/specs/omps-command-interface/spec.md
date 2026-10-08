# OMPS command interface

## Purpose

Provide useful bare-command status and require explicit per-agent thinking before launching an OMPS child.

## Requirements

### Requirement: Bare OMPS shows status

The `/omps` command SHALL treat absent or whitespace-only arguments as a status request for the current session.
It MUST NOT launch a child, read the registry or show a usage warning for that valid request.

#### Scenario: The user enters the bare command

- **WHEN** the user enters `/omps` without arguments
- **THEN** the command reports current-session status at information level
- **AND** it does not start a run or show a usage warning

#### Scenario: Arguments contain only whitespace

- **WHEN** the arguments contain spaces or newlines only
- **THEN** the command behaves exactly as the bare command

#### Scenario: The session has no runs

- **WHEN** the bare command is used in a fresh session
- **THEN** it reports that the current session has no runs
- **AND** it starts no process

### Requirement: Require an explicit thinking variant

Every mapped agent SHALL declare a supported `thinking` value.
Missing thinking MUST fail registry validation with the agent field identified, before any child starts.
An empty registry SHALL remain valid. The system MUST NOT inherit the parent's thinking setting for a mapped agent.

#### Scenario: An agent omits thinking

- **WHEN** a mapped agent has no `thinking` field
- **THEN** registry validation reports the missing field with actionable guidance
- **AND** no child starts for that invalid registry

#### Scenario: An agent declares a supported variant

- **WHEN** an agent declares `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`
- **THEN** that explicit value is used in its child launch
- **AND** a different parent thinking setting does not replace it

#### Scenario: An agent declares an unsupported variant

- **WHEN** the thinking value is unsupported, empty or has the wrong type
- **THEN** validation reports the allowed variants and starts no child

#### Scenario: The shipped registry contains no agents

- **WHEN** the registry contains `agents: {}`
- **THEN** it remains a valid empty registry without a thinking field

### Requirement: Keep model inheritance optional

An agent's `model` field SHALL remain optional.
An omitted model SHALL use the parent's model while retaining the agent's explicitly declared thinking value.
This change MUST NOT add automatic model fallback.

#### Scenario: Thinking is explicit and model is omitted

- **WHEN** an agent has valid thinking and omits `model`
- **THEN** its child uses the parent model and the agent's explicit thinking value

### Requirement: Preserve explicit commands and useful validation

Existing `list`, `run`, `status`, `cancel` and `inspect [run-id]` forms SHALL keep their meaning and ownership checks. The additive `fleet` form SHALL provide current-session fleet access without execution. Unknown or malformed subcommands SHALL show actionable usage guidance. Service failures SHALL remain error notifications. Bare `/omps` SHALL remain status rather than opening a view. The `list` output shown to the operator SHALL be compact: one line for each agent with its name, its approved tool count, `read-only` or `write-capable`, and its model and delegation capability when they apply. The `omps` tool SHALL keep every exact approved tool name in the text returned to the model, and SHALL show that full list to the operator only when the tool output is expanded.

#### Scenario: An explicit command is valid

- **WHEN** the operator enters a supported execution command with required arguments
- **THEN** it calls the same current-session operation as before

#### Scenario: The operator lists agents

- **WHEN** the operator enters `/omps list` and an agent has 24 approved tools without write tools
- **THEN** that agent appears on one line as `<name>: 24 tools (read-only)`
- **AND** no individual tool name is printed

#### Scenario: The model lists agents

- **WHEN** the model calls the `omps` tool with action `list`
- **THEN** the returned text names every approved tool for every agent
- **AND** the collapsed tool output shows the compact one-line form
- **AND** expanding the tool output with the host expansion action shows the full list

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

- **WHEN** the operator enters `/omps fleet`
- **THEN** the current fleet toggles between expanded and collapsed without starting a model request or process
- **AND** an empty session receives a clear empty-state message

#### Scenario: Fleet is used through RPC

- **WHEN** `/omps fleet` is requested by an RPC client
- **THEN** it receives bounded plain current-session summary text
- **AND** no custom terminal widget or modal is attempted

#### Scenario: Fleet syntax is malformed

- **WHEN** `fleet` receives extra arguments
- **THEN** usage guidance is shown before file access or execution

### Requirement: Inspect only current-session work

`/omps inspect` SHALL open the current-session tree without requiring a run id. With an id, it SHALL inspect an owned direct run or validated observed descendant. It MUST reject foreign or unknown ids, report an empty session clearly, and start no process or model request. Inspection SHALL NOT become another model-callable tool action.

#### Scenario: The session has no observed work

- **WHEN** `/omps inspect` is used in a fresh session
- **THEN** it reports that the session has no runs to inspect
- **AND** it neither reads the registry nor starts work

#### Scenario: An owned descendant is selected by id

- **WHEN** the operator supplies the id of a descendant observed beneath an owned direct run
- **THEN** its read-only details open
- **AND** existing status and cancellation ownership rules remain unchanged

#### Scenario: The id belongs to another session

- **WHEN** the supplied id is outside the current-session observation tree
- **THEN** inspection reports an actionable error
- **AND** it reads no foreign run files

#### Scenario: Bare status remains useful

- **WHEN** the operator enters `/omps` without arguments
- **THEN** it retains its existing status behaviour
- **AND** it does not open the viewer

### Requirement: Provide native operator settings dialogs

`/omps-settings` SHALL be the canonical operator settings command, with `/subagents-settings` as an alias. Native dialogs SHALL expose depth, per-parent concurrency, visible roots, fleet view, fleet/inspection shortcuts and per-agent Memory/Todo switches. The menu SHALL show effective values, sources, selected YAML destination and reload needs. Opening settings SHALL start no process or model request and change no mapping. Registration MUST perform no file access.

#### Scenario: The operator opens settings

- **WHEN** `/omps-settings` is entered with supported UI dialogs
- **THEN** the menu shows current execution and UI values with their source and save destination
- **AND** an existing agent can be selected to inspect its Memory/Todo mapping states
- **AND** an edit requires confirmation

#### Scenario: The operator changes the fleet view

- **WHEN** the operator selects the fleet view item and confirms `collapsed`, `expanded` or `off`
- **THEN** `ui.fleetView` is saved to the selected YAML
- **AND** the current fleet repaints in that view without `/reload`

#### Scenario: The legacy command is used

- **WHEN** `/subagents-settings` is entered
- **THEN** it uses the same menu, validation and save destination as `/omps-settings`

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

- **WHEN** `OMPS_REGISTRY` selects another file
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

#### Scenario: Settings open while only the old registry exists

- **WHEN** `OMPS_REGISTRY` is unset, `<agent-dir>/omps/config.yaml` is missing and `<agent-dir>/om-pi-subagents.yaml` exists
- **THEN** settings shows the migration error with the move commands
- **AND** offers no save, so no new empty registry is created beside the old one

#### Scenario: Settings create the new default registry

- **WHEN** neither registry exists and the operator confirms creation
- **THEN** `<agent-dir>/omps/` is created with mode `0700` if missing and `config.yaml` is written with mode `0600`
- **AND** no `personas/` folder or persona is created

### Requirement: Save settings without losing concurrent edits

Each confirmed setting SHALL be validated and saved using private temporary files and atomic replacement. A save MUST preserve unrelated valid content and reject conflicting changes since the displayed value was read. Concurrent Pi sessions MUST remain supported. Failed writes MUST leave the destination and live preference cache unchanged, report an actionable error and claim no success. Settings MUST NOT write todo preferences, task files or OpenSpec bindings.

#### Scenario: Another session or editor changes the file

- **WHEN** the destination changes after settings displays its value and before the save completes
- **THEN** the conflicting save is rejected with guidance to reopen settings
- **AND** the newer saved content is preserved

#### Scenario: An atomic write fails

- **WHEN** a confirmed save cannot replace its destination
- **THEN** the previous saved file and live preference cache remain unchanged
- **AND** the operator receives an error without any effect on active runs

#### Scenario: Several Pi sessions share settings

- **WHEN** concurrent sessions read or save settings
- **THEN** writes are coordinated per destination and preserve confirmed changes
- **AND** no settings lock limits the system to one Pi session

#### Scenario: Todo is also loaded

- **WHEN** an OMPS setting is saved with real `om-pi-todo` present
- **THEN** todo preferences, widget keys, tasks and OpenSpec bindings remain unchanged

### Requirement: Configure display and shortcuts in YAML

Version-one YAML SHALL accept optional `ui.maxVisibleAgents`, `ui.fleetView`, `ui.toggleKey` and `ui.inspectKey`. Defaults SHALL be five, `expanded`, `off` and `off` respectively. Visible roots MUST be safe integers from one to 256. The fleet view MUST be `expanded`, `collapsed` or `off`. Keys MUST be valid non-conflicting specifications or `off`. Unknown or invalid fields MUST identify their YAML path. YAML without `ui` SHALL remain valid. UI rendering MUST use cached values without file access.

#### Scenario: UI settings are omitted

- **WHEN** valid existing YAML has no `ui` mapping or legacy display value
- **THEN** the default settings apply and the tree shows expanded above the editor while runs are active
- **AND** no view shortcut is registered
- **AND** rendering creates no settings file

#### Scenario: Explicit keys survive the default change

- **WHEN** YAML already sets `ui.toggleKey: alt+o` and `ui.inspectKey: alt+i`
- **THEN** those keys stay in effect after the upgrade

#### Scenario: A UI value is confirmed through settings

- **WHEN** an operator confirms a valid UI edit
- **THEN** the matching YAML field is saved
- **AND** editing that same field by hand produces the same effective value

#### Scenario: Invalid UI YAML is loaded

- **WHEN** a UI mapping has unknown fields or invalid values, such as `ui.fleetView: hidden`
- **THEN** an actionable diagnostic names the field
- **AND** new launches cannot proceed on an invalid registry
- **AND** retained run evidence remains inspectable

#### Scenario: Display and shortcut edits take effect

- **WHEN** a visible-root or fleet view value is saved
- **THEN** the fleet repaints immediately
- **WHEN** a shortcut is saved
- **THEN** settings distinguishes the saved binding from the active one and requests `/reload`

### Requirement: Import legacy display preferences explicitly

The old OMPS display JSON SHALL be read-only compatibility input for `maxVisibleAgents` when YAML omits its replacement. YAML SHALL take precedence. Settings SHALL label a legacy source and offer confirmed import into YAML. Invalid legacy data SHALL produce a diagnostic and use the default. Import MUST NOT delete or rewrite the old file, copy unrelated keys or touch sibling preferences.

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

### Requirement: Keep OMPS settings separate from sibling configuration

OMPS settings SHALL edit only selected OMPS YAML. They MUST NOT write Pi keybindings, todo preferences/tasks/OpenSpec bindings, or OMMS configuration/stores. View toggles SHALL be session-local. Existing approved-tool and resource mappings SHALL not change merely because a view or settings command opens.

#### Scenario: Both siblings are loaded

- **WHEN** OMPS settings is used with real todo and memory extensions present
- **THEN** only the confirmed OMPS setting or selected agent's capability lists change
- **AND** sibling data, configuration and shortcuts stay independent

#### Scenario: View state changes

- **WHEN** an operator expands, collapses or inspects a fleet
- **THEN** no settings file, todo task or memory record is written by OMPS

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

Confirmed capability edits SHALL take effect on the selected agent's next fresh launch without requiring an OMPS reload. Admitted runs SHALL keep their captured tools and resources. Edits MUST NOT mutate parent extension settings or other agent mappings. Descendant targets SHALL use their own fresh mappings rather than inherit a parent's switch state.

#### Scenario: A capability changes while a child runs

- **WHEN** the operator enables or disables a capability for its mapped agent
- **THEN** the running child retains its captured tools and resources
- **AND** the next launch follows the saved mapping

#### Scenario: The parent already uses memory and todo

- **WHEN** both child capability controls are Off
- **THEN** OMPS does not load those sibling resources into an unmapped child
- **AND** parent memory/todo tools and preferences stay unchanged

#### Scenario: Another target is delegated

- **WHEN** an approved parent delegates to a different mapped agent
- **THEN** that target's own saved lists determine its capabilities
- **AND** the delegator's Memory/Todo state is not copied into the target

### Requirement: Accept forgiving typed shortcut input in settings

The `/omps-settings` shortcut prompts SHALL tell the operator to type the key as text, with an example such as `ctrl+1`, and not to press the keys. The prompt SHALL name the common modifiers `ctrl`, `shift` and `alt`. Before validation, settings SHALL convert the typed text to a canonical key specification: lowercase, no spaces around `+`, `ctr`, `ctl` and `control` as `ctrl`, `opt` and `option` as `alt`, and `cmd`, `command` and `win` as `super`. The converted key MUST pass the existing unsafe-key and duplicate checks. Before confirmation or saving, settings MUST check conflicts against effective Pi bindings using the same policy and guidance as shortcut registration. The existing direction-specific exceptions for default Up/Down navigation MUST remain available. The confirmation SHALL show the converted key and, when it differs, the typed text. The saved value SHALL be the converted key. The YAML loader MUST NOT accept these aliases.

#### Scenario: A modifier is spelled loosely

- **WHEN** the operator types `Control + 1` for a shortcut
- **THEN** settings proposes `ctrl+1`
- **AND** the confirmation shows both the typed text and `ctrl+1`

#### Scenario: A canonical key is typed

- **WHEN** the operator types `ctrl+shift+i`
- **THEN** settings proposes it unchanged
- **AND** the confirmation does not show a conversion

#### Scenario: The prompt explains typing

- **WHEN** a shortcut prompt opens
- **THEN** it says to type the key as text and gives `ctrl+1` as an example
- **AND** it names `ctrl`, `shift` and `alt` as common modifiers

#### Scenario: A converted key is unsafe or conflicts

- **WHEN** the converted key is `tab`, `ctrl+i`, a duplicate OMPS key or a key owned by an effective Pi action outside the permitted default navigation overlaps
- **THEN** settings rejects it with the existing guidance before showing a save confirmation
- **AND** nothing is saved

#### Scenario: Default navigation uses permitted Pi overlaps

- **WHEN** the operator types `Down` for `navigationDownKey` or `Up` for `navigationUpKey`
- **AND** effective Pi owners are limited to the existing direction-specific cursor, history and selection actions
- **THEN** settings allows confirmation and saves `down` or `up`
- **AND** shortcut registration accepts the same permitted overlaps

#### Scenario: Another Pi action owns a default navigation key

- **WHEN** an effective Pi action outside the permitted direction-specific overlaps owns `down` or `up`
- **AND** the operator assigns that key to its default navigation field
- **THEN** settings rejects the edit before confirmation and leaves the registry unchanged
- **AND** shortcut registration refuses the key with the same owner-specific guidance

#### Scenario: Remapping a Pi action frees a key

- **WHEN** a Pi action has been remapped away from the converted key
- **AND** no effective Pi action owns that key
- **AND** the key passes the unsafe-key and duplicate checks
- **THEN** settings permits confirmation and saving
- **AND** shortcut registration permits the key under those effective bindings

#### Scenario: An unknown word is typed

- **WHEN** the operator types a modifier that is not a known spelling, such as `hyper+1`
- **THEN** settings rejects it with the existing key error
- **AND** the error lists the accepted modifiers

#### Scenario: YAML uses an alias

- **WHEN** the registry YAML sets `ui.toggleKey: control+1`
- **THEN** the loader rejects it with the existing lowercase key error
- **AND** the settings input remains the only place that converts aliases
