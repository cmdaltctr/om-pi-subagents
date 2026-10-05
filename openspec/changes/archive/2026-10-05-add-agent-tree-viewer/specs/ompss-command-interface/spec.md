# OMPSS command interface delta

## MODIFIED Requirements

### Requirement: Preserve explicit commands and useful validation

The existing `list`, `run`, `status` and `cancel` forms SHALL keep their meaning and ownership checks. The additive `inspect [run-id]` form SHALL provide read-only current-session inspection. Malformed or unknown subcommands SHALL continue to show actionable usage guidance. Service errors SHALL remain error notifications rather than becoming usage warnings.

#### Scenario: An explicit command is valid

- **WHEN** the user enters a supported command with its required arguments
- **THEN** it calls the same current-session operation as before

#### Scenario: A subcommand is incomplete or unknown

- **WHEN** the user enters an unknown command or omits required run or cancellation arguments
- **THEN** the command shows usage guidance at warning level
- **AND** it starts no child

#### Scenario: A valid command reaches a service error

- **WHEN** the requested operation fails in the service
- **THEN** the parent receives the existing actionable error notification

#### Scenario: Inspection syntax is malformed

- **WHEN** inspect receives extra arguments or an invalid run id
- **THEN** the command shows usage guidance including `inspect [run-id]`
- **AND** it performs no file read or launch

## ADDED Requirements

### Requirement: Inspect only current-session work

`/ompss inspect` SHALL open the current-session tree without requiring a run id. With an id, it SHALL inspect an owned direct run or validated observed descendant. It MUST reject foreign or unknown ids, report an empty session clearly, and start no process or model request. Inspection SHALL NOT become another model-callable tool action.

#### Scenario: The session has no observed work

- **WHEN** `/ompss inspect` is used in a fresh session
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

- **WHEN** the operator enters `/ompss` without arguments
- **THEN** it retains its existing status behaviour
- **AND** it does not open the viewer

### Requirement: Provide native operator settings dialogs

`/subagents-settings` SHALL show maximum nesting depth, parallel direct children per parent and the visible-agent limit using Pi's native selection, input and confirmation dialogs, following `/todo-settings`. The command SHALL show current values and save destinations. It SHALL remain operator-only, start no process or model request and leave existing `/ompss` forms unchanged. Registration MUST perform no file access.

#### Scenario: The operator opens settings

- **WHEN** `/subagents-settings` is entered with supported UI dialogs
- **THEN** the menu shows the current depth, per-parent concurrency and visible-agent values
- **AND** each edit identifies its save destination before confirmation

#### Scenario: A dialog is cancelled

- **WHEN** the operator cancels an input or declines its save confirmation
- **THEN** that setting and its saved file remain unchanged
- **AND** any earlier confirmed saves remain in effect

#### Scenario: UI dialogs are unavailable

- **WHEN** settings is requested without UI support
- **THEN** the command reports an actionable error
- **AND** it reads and writes no settings files

#### Scenario: Settings is requested through RPC

- **WHEN** an RPC client provides supported selection, input and confirmation dialogs
- **THEN** the command uses those dialogs
- **AND** it does not attempt a custom terminal component

#### Scenario: Settings syntax is malformed

- **WHEN** `/subagents-settings` receives extra arguments
- **THEN** it shows usage guidance before any file access
- **AND** it changes no setting

### Requirement: Keep execution limits in the selected registry

Settings SHALL edit only the selected existing `limits.maxDepth` or `limits.maxConcurrentRuns` field in the registry resolved by the current path rules. Depth MUST be a safe integer of at least zero, with the root at depth zero. Concurrency MUST be a safe integer of at least one and SHALL count direct children per immediate parent. Parallel agents and direct children SHALL use this same limit. Settings MUST NOT add a second execution-limit source or grant an agent delegation permission.

#### Scenario: A valid limit is confirmed

- **WHEN** the operator confirms a valid execution-limit edit
- **THEN** the selected registry field is saved after full configuration validation
- **AND** agent mappings, resource paths, comments and the other limit are preserved

#### Scenario: The registry path is overridden

- **WHEN** `OMPSS_REGISTRY` selects another registry file
- **THEN** settings shows and saves to that selected destination
- **AND** the default registry remains untouched

#### Scenario: A registry does not yet exist

- **WHEN** the operator confirms creating the missing registry while saving an execution limit
- **THEN** settings creates a valid version-one registry with an empty agents mapping
- **AND** it supplies no persona, model or delegation permission

#### Scenario: A value or registry is invalid

- **WHEN** the input is invalid or the selected registry is malformed or unreadable
- **THEN** settings reports how to correct the problem
- **AND** it neither overwrites the registry nor permits launches using stale configuration

#### Scenario: Concurrency is lowered below active work

- **WHEN** the saved per-parent concurrency limit is lower than the number of admitted direct children
- **THEN** those children continue running
- **AND** later launches remain blocked until capacity exists under the fresh limit

#### Scenario: Depth changes while a branch runs

- **WHEN** the operator changes maximum depth
- **THEN** later launches honour both the fresh YAML and inherited branch ceiling
- **AND** existing runs continue without cancellation or an increased inherited ceiling

#### Scenario: Depth zero is saved

- **WHEN** the operator confirms a maximum depth of zero
- **THEN** new launches are disabled
- **AND** admitted work keeps its existing supervision and result delivery

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

- **WHEN** an OMPSS setting is saved with real `om-pi-todo` present
- **THEN** todo preferences, widget keys, tasks and OpenSpec bindings remain unchanged
