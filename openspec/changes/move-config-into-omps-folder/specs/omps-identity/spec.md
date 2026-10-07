## MODIFIED Requirements

### Requirement: Keep the package identity stable

The npm package, repository and shipped skill SHALL remain named `om-pi-subagents`.
The default registry SHALL be `<agent-dir>/omps/config.yaml`, beside the `omps/runs/` run root. `OMPS_REGISTRY` SHALL still select another registry file.
The documented persona folder SHALL be `<agent-dir>/omps/personas/`. Persona paths SHALL still resolve from the registry file's folder, and personas MUST stay inside that folder after symbolic links are resolved.
A persona path that resolves inside the run root MUST be refused, because run files hold saved personas and model output.
Existing YAML fields, explicit thinking, optional model inheritance and independent legacy display preference behaviour SHALL remain unchanged.
The extension SHALL NOT read `<agent-dir>/om-pi-subagents.yaml` and SHALL NOT move, copy or rewrite operator files.

#### Scenario: Existing package-named YAML is loaded

- **WHEN** the operator has moved the package-named registry to `<agent-dir>/omps/config.yaml`, it maps an agent to `./personas/reader.md` and that file exists
- **THEN** `/omps list` shows the agent
- **AND** personas, sibling resources and unrelated tools keep their existing meaning

#### Scenario: Only the old registry exists

- **WHEN** `OMPS_REGISTRY` is unset, `<agent-dir>/omps/config.yaml` is missing and `<agent-dir>/om-pi-subagents.yaml` exists
- **THEN** registry refresh fails with an error that names both paths and the exact move commands
- **AND** no child launches and the old file is not read, moved or changed

#### Scenario: Both registries exist

- **WHEN** both the old file and `<agent-dir>/omps/config.yaml` exist
- **THEN** only `omps/config.yaml` is loaded
- **AND** the old file is not changed

#### Scenario: Override selects the old file

- **WHEN** `OMPS_REGISTRY` names `<agent-dir>/om-pi-subagents.yaml`
- **THEN** that file is loaded as the selected registry

#### Scenario: A persona points into run evidence

- **WHEN** a `persona:` path resolves inside `<agent-dir>/omps/runs/`
- **THEN** validation names the field and refuses the path
- **AND** launches stay blocked until the mapping is fixed

### Requirement: Publish safe manual migration guidance

Public guides SHALL explain namespace replacements, direct-copy path edits, backups and collision-safe run-directory moves.
They SHALL also explain moving the registry to `<agent-dir>/omps/config.yaml` and personas to `<agent-dir>/omps/personas/`, editing each `persona:` line, checking with `/omps list`, and rolling back.
Operators MUST stop old sessions and confirm descendant cleanup before moving state. Migration SHALL preserve saved evidence content and identify historical paths.
Moving files MUST NOT be described as restoring tasks, ownership or inspection of arbitrary former sessions.

#### Scenario: The operator migrates an old installation

- **WHEN** the operator follows the guide with disposable old settings and run files
- **THEN** the new commands and exact delegation approval work after restart
- **AND** saved evidence remains byte-for-byte intact

#### Scenario: A destination already exists

- **WHEN** the proposed destination contains a directory or file
- **THEN** the guide instructs the operator to stop and compare destinations
- **AND** it supplies no forced overwrite or merge of colliding run IDs

#### Scenario: Historical documentation remains

- **WHEN** the current-name audit is run
- **THEN** current executable interfaces and public examples use the new names
- **AND** generated changelog, archived plans, accepted ADR bodies and historical saved data are identified exemptions

#### Scenario: Operator moves settings into the OMPS folder

- **WHEN** the operator follows the guide on a disposable agent directory with an old registry and persona folder
- **THEN** `/omps list` shows the same agents from `omps/config.yaml`
- **AND** the backup restores the previous layout byte for byte
