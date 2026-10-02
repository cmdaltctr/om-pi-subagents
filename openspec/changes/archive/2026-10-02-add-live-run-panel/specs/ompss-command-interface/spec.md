# OMPSS command interface

## Purpose

Provide useful bare-command status and require explicit per-agent thinking before launching an OMPSS child.

## ADDED Requirements

### Requirement: Bare OMPSS shows status

The `/ompss` command SHALL treat absent or whitespace-only arguments as a status request for the current session.
It MUST NOT launch a child, read the registry or show a usage warning for that valid request.

#### Scenario: The user enters the bare command

- **WHEN** the user enters `/ompss` without arguments
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

The existing `list`, `run`, `status` and `cancel` forms SHALL keep their meaning and ownership checks.
Malformed or unknown subcommands SHALL continue to show actionable usage guidance.
Service errors SHALL remain error notifications rather than becoming usage warnings.

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
