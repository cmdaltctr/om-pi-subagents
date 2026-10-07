# Todo compatibility

## Purpose

Let OMPSS and om-pi-todo coexist in the parent and explicitly approved children without mixing tasks or disrupting settlement.

## Requirements

### Requirement: Keep parent extension behaviour independent

Loading OMPSS and `om-pi-todo` together SHALL preserve both tools, commands, shortcuts and distinct widget ownership. OMPSS fleet/modal interaction, delivery, cancellation and settings MUST NOT mutate parent tasks, global todo preferences or OpenSpec bindings. Fleet collapse/expansion SHALL be independent of todo collapse and Pi's native tool expansion.

#### Scenario: Both extensions load in either order

- **WHEN** real OMPSS and todo load in the parent in either order
- **THEN** `ompss`, `todo`, `/ompss` and `/todos` remain available
- **AND** their widgets coexist when supported
- **AND** their non-conflicting default shortcuts retain their separate actions

#### Scenario: A subagent finishes while a parent task is in progress

- **WHEN** a child finishes while a parent task is in progress
- **THEN** the parent's task stays unchanged until an explicit todo update
- **AND** result delivery leaves the todo widget intact

#### Scenario: A fleet or descendant modal is used

- **WHEN** the operator toggles the fleet, selects descendants, closes inspection or saves OMPSS settings
- **THEN** parent todo state, its visible rows and OpenSpec checkboxes stay unchanged

#### Scenario: The native expansion key is used

- **WHEN** Ctrl+O performs Pi's native expansion with both extensions loaded
- **THEN** todo keeps its native expansion behaviour
- **AND** OMPSS keeps its independent fleet state

### Requirement: Load child todo capability explicitly

A child SHALL use the real todo extension only through its explicitly mapped extension resources.
Its mapping MUST approve the exact `todo` tool for task calls to succeed.
A mapped approved tool that is unavailable MUST fail readiness before the task reaches a model.
OMPSS MUST NOT auto-install todo or load unrelated ambient extensions.

#### Scenario: Todo is mapped and approved

- **WHEN** a mapping lists the real todo extension and approves `todo`
- **THEN** the child can create, list and update its own tasks

#### Scenario: The extension is listed without tool approval

- **WHEN** a mapped extension registers `todo` but the child tool list omits it
- **THEN** a todo call is blocked by the existing permission boundary

#### Scenario: Approval is listed without a registered tool

- **WHEN** `todo` is approved but no loaded extension registers it
- **THEN** readiness names the missing tool and sends no task to the model

### Requirement: Keep child task lists local

An approved OMPSS child's todo mode SHALL start as normal mode with a local list.
Parent tasks, OpenSpec bindings and linked revisions MUST NOT be copied into that list.
Sibling and nested task lists MUST remain isolated by session, including when local task ids match.
The parent's chosen mode and global preferences MUST remain unchanged.

#### Scenario: A sync parent starts a child

- **WHEN** the parent is bound to an OpenSpec change and starts a todo-enabled child
- **THEN** the child starts with an empty local list in normal mode
- **AND** its todo updates leave the parent's `tasks.md` unchanged

#### Scenario: The global default is OpenSpec

- **WHEN** global todo preferences select OpenSpec mode and an approved OMPSS child starts
- **THEN** the child can use its normal list without an interactive change-selection dialog
- **AND** the global preference remains OpenSpec

#### Scenario: Siblings and a grandchild create the same local id

- **WHEN** two siblings and a grandchild each create local task id one
- **THEN** each session sees and updates only its own task
- **AND** parent tasks and sibling panels remain unchanged

### Requirement: Preserve todo reminders and final settlement

Todo's pre-settlement task reminder SHALL remain usable inside an approved child.
A reminder continuation MUST finish before OMPSS accepts a final settled answer.
OMPSS MUST retain the refusal of non-RPC user prompts; compatibility MUST NOT add a broad exception for extension input.

#### Scenario: A child forgets to update a task

- **WHEN** a child finishes a turn with an unexplained in-progress task
- **THEN** the real todo extension can request its normal reminder continuation
- **AND** OMPSS waits for that continuation and final settlement rather than accepting the earlier answer

#### Scenario: Todo reminders coincide with nested results

- **WHEN** a delegating child has unfinished descendants and needs a todo reminder
- **THEN** result delivery and task correction can finish without an unconditional continuation loop
- **AND** completion still requires saved output, clean exit and confirmed cleanup

#### Scenario: An extension injects an unrelated user prompt

- **WHEN** a loaded extension sends a non-RPC user prompt to the child
- **THEN** the existing guard refuses it and records the violation

### Requirement: Keep todo compatibility narrowly scoped

OMPSS SHALL use the mapped real `todo` tool and its existing child-local mode seed. It MUST NOT mirror todo's task state, parse task-result objects into fleet task counts, or read/write sibling stores. Child results SHALL remain evidence for an explicit parent verification step. Missing todo capability SHALL leave independent OMPSS operation available, subject to normal per-mapping readiness checks.

#### Scenario: Todo changes an internal representation

- **WHEN** the real extension keeps its tool and session-mode contracts while its internal task representation changes
- **THEN** OMPSS fleet and inspection need no task-store adapter change

#### Scenario: A child performs multi-step work

- **WHEN** an approved child creates and updates local tasks
- **THEN** the real todo extension owns those tasks and reminder continuations
- **AND** OMPSS waits for final settlement before accepting the child's result
- **AND** the parent decides separately whether its own task is complete

#### Scenario: Todo is not mapped

- **WHEN** a valid agent mapping omits todo
- **THEN** OMPSS starts that agent without auto-loading or installing todo
- **AND** no task data is invented for its modal

### Requirement: Keep child todo opt-in and enableable later

New child mappings SHALL have no todo capability unless explicitly configured. `/ompss-settings` SHALL enable or disable Todo per agent through confirmed edits to its existing resource and exact-tool lists. Off SHALL exclude the sibling entry and child todo bootstrap from future launches. Enabling SHALL retain empty child-local normal-mode lists. Existing complete mappings, admitted children and parent/OpenSpec task ownership MUST remain unchanged by opening settings.

#### Scenario: Default child todo is off

- **WHEN** a new agent has no todo extension or tool approval
- **THEN** its child loads no todo extension or bootstrap
- **AND** OMPSS operates without om-pi-todo installed

#### Scenario: Todo is enabled after deployment

- **WHEN** the operator later confirms valid installed todo resources for one agent
- **THEN** its next child can use the real todo tool with an empty normal-mode list
- **AND** no new OMPSS code change or task-store adapter is needed

#### Scenario: Todo is disabled while a child runs

- **WHEN** the operator confirms disabling Todo for that mapped agent
- **THEN** its admitted child keeps its existing tasks and reminder behaviour
- **AND** future children load neither that todo entry nor its bootstrap

#### Scenario: Parent OpenSpec mode is active

- **WHEN** child Todo is enabled or disabled through settings
- **THEN** the parent retains its linked tasks and revisions
- **AND** no parent checkbox or global todo preference changes

#### Scenario: An explicit todo mapping already exists

- **WHEN** an operator's existing mapping loads the real todo extension and approves todo
- **THEN** the capability remains configured without a new confirmation merely to open settings
- **AND** no migration silently removes its resources
