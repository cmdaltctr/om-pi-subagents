# Todo compatibility

## Purpose

Let OMPSS and om-pi-todo coexist in the parent and explicitly approved children without mixing tasks or disrupting settlement.

## Requirements

### Requirement: Keep parent extension behaviour independent

Loading OMPSS and `om-pi-todo` together SHALL preserve both tools, commands and their distinct widget ownership.
OMPSS result delivery, cancellation and display updates MUST NOT change parent todo tasks or global todo preferences.

#### Scenario: Both extensions load in either order

- **WHEN** both extensions load in the parent in either order
- **THEN** `ompss`, `todo`, `/ompss` and `/todos` remain available
- **AND** their panels coexist when the client supports both

#### Scenario: A subagent finishes while a parent task is in progress

- **WHEN** a child finishes and OMPSS delivers its result
- **THEN** the parent's todo state stays unchanged until an explicit todo update
- **AND** result delivery does not clear the todo widget

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
