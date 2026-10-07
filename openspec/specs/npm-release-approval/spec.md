# npm-release-approval Specification

## Purpose

Let the maintainer approve a staged om-pi-subagents release through a repository command while retaining human authentication and the existing release gate.

## Requirements

### Requirement: Expose a human-run approval command

The repository SHALL provide `bun run release:approve` and document its human-run Pi form, `! bun run release:approve`. It SHALL use GitHub CLI and npm without storing tokens or approving in CI. The helper SHALL accept an optional stage UUID. It SHALL NOT run OMMS plugin/channel operations or automatically update the local extension.

#### Scenario: The maintainer invokes approval

- **WHEN** the human runs the helper
- **THEN** it operates on `cmdaltctr/om-pi-subagents` and `om-pi-subagents`
- **AND** npm owns the authentication and two-factor approval interaction

#### Scenario: The package is packed

- **WHEN** the npm tarball is checked
- **THEN** runtime dependency and packaging boundaries remain unchanged
- **AND** repository approval scripts are excluded from the tarball

### Requirement: Find and validate the pending release

The helper SHALL resolve the newest GitHub release and validate its stable semantic version tag. It SHALL stop before approval if npm already serves that version. It SHALL take a supplied UUID or extract one from the exact `npm stage approve <uuid>` command in that release's body. Missing or invalid values and failed discovery SHALL stop before approval with corrective instructions.

#### Scenario: Release notes contain the stage UUID

- **WHEN** a not-yet-published release note contains a valid approval command
- **THEN** the helper uses its UUID and displays the stage before requesting approval

#### Scenario: The maintainer supplies a UUID

- **WHEN** a valid explicit UUID is provided and release/version checks pass
- **THEN** that UUID is used instead of discovery from the body

#### Scenario: The release is already published

- **WHEN** a fresh npm query matches the GitHub release version
- **THEN** the helper reports that no approval is waiting
- **AND** it does not run stage approval

#### Scenario: The UUID is missing or invalid

- **WHEN** discovery fails or an argument is not a UUID
- **THEN** the helper gives `npm stage list om-pi-subagents` and explicit-ID retry guidance
- **AND** no stage approval is executed

#### Scenario: Release discovery or stage display fails

- **WHEN** GitHub discovery fails, the tag is invalid or stage display fails
- **THEN** the helper exits unsuccessfully with an actionable error
- **AND** no approval or success claim follows

### Requirement: Confirm registry visibility after approval

After successful approval, the helper SHALL poll npm using `--prefer-online` for a bounded interval and confirm the release version is served. Approval failure SHALL stop before polling and explain how to retry authentication. Timeout SHALL report unconfirmed visibility without claiming approval failed. Confirmed success SHALL print `pi update npm:om-pi-subagents` for the operator.

#### Scenario: Approval and visibility succeed

- **WHEN** approval succeeds and npm serves the release version within the polling interval
- **THEN** the helper reports that version and prints the Pi update command
- **AND** it runs no automatic installation or plugin workflow

#### Scenario: Approval fails

- **WHEN** npm rejects approval
- **THEN** the helper exits unsuccessfully with login/retry guidance
- **AND** it does not report success or poll for publication

#### Scenario: Registry visibility is delayed

- **WHEN** approval succeeds but the version remains unavailable throughout the polling interval
- **THEN** the helper stops with instructions to check npm status before retrying
- **AND** its message distinguishes approval from registry visibility

### Requirement: Hand off the actual UUID from the stage workflow

The stage workflow SHALL capture npm's stage UUID and publish the exact approval command in the GitHub release note, alongside the repository helper. A failed stage command MUST fail the job despite output capture. UUID extraction failure SHALL retain explicit manual-list guidance. The full exact-commit gate, protected environment, trusted publishing permissions and human approval boundary SHALL remain unchanged.

#### Scenario: npm stages a version successfully

- **WHEN** npm reports `staged with id` followed by a UUID
- **THEN** the release body contains `npm stage approve` with that UUID
- **AND** the helper can discover it without a manual list command

#### Scenario: npm staging fails while output is captured

- **WHEN** the stage command exits unsuccessfully but its output capture succeeds
- **THEN** the step and job fail
- **AND** the workflow does not claim that a staged version awaits approval

#### Scenario: npm output has no recognised UUID

- **WHEN** staging succeeds but no UUID can be extracted
- **THEN** the note instructs the maintainer to list stages and pass an explicit UUID
- **AND** a placeholder is not treated as a discoverable ID

#### Scenario: The tagged-commit gate fails

- **WHEN** any required release gate check fails
- **THEN** npm staging is not executed
- **AND** no approval note claims a successful stage
