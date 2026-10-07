# Command interface delta

## RENAMED Requirements

- FROM: `### Requirement: Bare OMPSS shows status`
- TO: `### Requirement: Bare OMPS shows status`

## MODIFIED Requirements

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

### Requirement: Preserve explicit commands and useful validation

Existing `list`, `run`, `status`, `cancel` and `inspect [run-id]` forms SHALL keep their meaning and ownership checks. The additive `fleet` form SHALL provide current-session fleet access without execution. Unknown or malformed subcommands SHALL show actionable usage guidance. Service failures SHALL remain error notifications. Bare `/omps` SHALL remain status rather than opening a view.

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

- **WHEN** the operator enters `/omps fleet`
- **THEN** the current fleet toggles without starting a model request or process
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

`/omps-settings` SHALL be the canonical operator settings command, with `/subagents-settings` as an alias. Native dialogs SHALL expose depth, per-parent concurrency, visible roots, fleet/inspection shortcuts and per-agent Memory/Todo switches. The menu SHALL show effective values, sources, selected YAML destination and reload needs. Opening settings SHALL start no process or model request and change no mapping. Registration MUST perform no file access.

#### Scenario: The operator opens settings

- **WHEN** `/omps-settings` is entered with supported UI dialogs
- **THEN** the menu shows current execution and UI values with their source and save destination
- **AND** an existing agent can be selected to inspect its Memory/Todo mapping states
- **AND** an edit requires confirmation

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
