# Spec Delta

## Purpose

Let the operator pick a mapped agent while typing and launch it from the editor line, without a slash command or a parent model request for launch routing.

## ADDED Requirements

### Requirement: Offer mapped agents after an at sign

When the editor input starts with `@` and the cursor is still in that first word on editor line zero, OMPS SHALL offer mapped agent names as completion labels. Agent mappings SHALL remain unchanged. Completion SHALL read fresh configuration when it is triggered, and a failed read SHALL offer no OMPS items. OMPS MUST NOT remove or reorder Pi's own `@` file completion, and MUST NOT offer agents in any other position. Registration MUST start no process and read no file.

#### Scenario: The line starts with an at sign

- **WHEN** the operator types `@` or `@a-ex` at the start of the line
- **THEN** mapped agents whose names match appear as items
- **AND** Pi's file items for the same prefix remain available

#### Scenario: An agent completion is applied

- **WHEN** the operator applies an OMPS completion item
- **THEN** the editor contains `@<agent>` followed by exactly one space
- **AND** the cursor is ready for the task

#### Scenario: An at sign appears later in the line

- **WHEN** the operator types `@` after other text
- **THEN** OMPS offers no agents
- **AND** Pi's normal file completion behaves as before

#### Scenario: Configuration cannot be read

- **WHEN** the registry is missing or invalid at completion time
- **THEN** no OMPS items appear
- **AND** no error interrupts typing

### Requirement: Launch an agent from an at-mention line

A submitted line, as received after Pi trims editor submission, that starts with `@<agent>` followed by whitespace and a non-empty task, where `<agent>` is a mapped agent, SHALL launch that agent with the rest of the line as its task and SHALL NOT be sent to the model. The launch SHALL use the same service path as `/omps run`, including validation, capacity limits, acknowledgement and the result message. An unknown agent name SHALL show the mapped agent names and send nothing. A mapped agent with no task SHALL show usage and send nothing. Any other line SHALL continue to the model unchanged. Only interactive input SHALL launch; RPC and extension input MUST continue unchanged.

#### Scenario: A mapped agent and a task

- **WHEN** the operator submits `@a-explore find the auth bug`
- **THEN** the agent `a-explore` launches with the task `find the auth bug`
- **AND** the line is not sent to the model

#### Scenario: Pi trims leading spaces

- **WHEN** the operator submits ` @a-explore find the auth bug` through the interactive editor
- **THEN** Pi trims the leading space before OMPS receives the input
- **AND** OMPS launches `a-explore` with the task `find the auth bug`
- **AND** no parent model request routes the launch

#### Scenario: An unknown agent

- **WHEN** the operator submits `@nobody do it` and `nobody` is not mapped
- **THEN** OMPS shows the mapped agent names
- **AND** nothing is launched and nothing is sent to the model

#### Scenario: No task is given

- **WHEN** the operator submits `@a-explore`
- **THEN** OMPS shows usage
- **AND** nothing is launched and nothing is sent to the model

#### Scenario: A file reference is submitted

- **WHEN** the operator submits `@README.md summarise this` and `README.md` is not a mapped agent
- **THEN** the line goes to the model unchanged as a normal file reference

#### Scenario: Admission is refused

- **WHEN** capacity or depth rules refuse the launch
- **THEN** OMPS shows the same error as `/omps run`
- **AND** the line is not sent to the model

#### Scenario: Readiness fails after admission

- **WHEN** an admitted run fails readiness
- **THEN** the operator receives the acknowledgement followed by a failed result, as with `/omps run`
- **AND** no parent model request routes the launch

#### Scenario: Registry refresh fails on submit

- **WHEN** interactive TUI input starts with `@` and the registry cannot be refreshed
- **THEN** OMPS shows the registry error and handles the input
- **AND** nothing launches or reaches the model

#### Scenario: Input is not interactive

- **WHEN** a line arrives through RPC or from another extension
- **THEN** OMPS does not treat it as a launch
- **AND** it continues to the model unchanged
