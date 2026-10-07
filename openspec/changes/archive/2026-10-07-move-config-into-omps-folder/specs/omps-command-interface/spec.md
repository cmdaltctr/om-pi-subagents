## MODIFIED Requirements

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
