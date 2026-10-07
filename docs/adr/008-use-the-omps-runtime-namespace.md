# ADR-008: Use the OMPS runtime namespace

- **Date:** 2026-10-07
- **Status:** Accepted
- **Partly superseded by:** [ADR-010](./010-keep-operator-files-in-the-omps-folder.md), for the registry filename and persona folder only.
- **Deciders:** Project maintainer

## Context

The maintainer selected OMPS as the product name. Commands, child policy and saved run paths previously used OMPSS.
A partial rename would leave parent and child processes using different readiness and ownership identifiers.
The npm package and operator-owned mapping paths already use `om-pi-subagents`.

## Decision

Use `omps` for the tool, command, status/widget ownership and transcript identifiers.
Use `/omps-settings`, OMPS product labels and `OMPS_*` environment names across both process boundaries.
Require exact `omps` approval for delegation. Register no old-acronym aliases or renderers.
Refuse an old child marker before it can expose an unguarded root launcher.

Save fresh runs under `<agent-dir>/omps/runs/`. Leave old folders and evidence content untouched.
Document backups, confirmed cleanup, collision checks and rollback for manual migration.
Moving evidence does not resume a process or restore former session ownership.

Keep the npm/repository name, registry filename, persona folder and shipped skill as `om-pi-subagents`.
Retain `/subagents-settings` and the independent legacy display fallback.

Provide a repository-only, human-run release approval helper with validated UUIDs and bounded fresh registry polling.
The workflow captures the actual stage UUID after its exact-commit gate. npm still owns authentication and two-factor approval.
Print the Pi update command after confirmed publication without running it.

## Consequences

### Positive

- Operators and child processes use one runtime namespace.
- Stage IDs can pass from npm output into release notes and the human-run helper.

### Negative

- Operators must edit exact delegation approvals and configured environment variables before restarting.
- Old session identifiers have no compatibility renderer, and old folders need manual moves if desired.

### Neutral

- Package identity, operator data paths and optional sibling ownership remain unchanged.
- Accepted ADR bodies, archived plans and the generated changelog remain historical evidence.

## Alternatives Considered

| Option                                        | Rejected because                                                                               |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Old-name aliases and environment fallbacks    | The maintainer requested a clean namespace change with explicit migration.                     |
| Automatic run-folder migration                | Existing destinations can hold separate evidence, and saved paths record historical ownership. |
| Rename the npm package and operator files     | Their existing identity remains part of the approved requirement.                              |
| Automatically approve or update after staging | Human authentication and explicit local update remain required.                                |

## References

- [Manual migration and rollback](../INSTALL.md#migrate-from-ompss-to-omps)
- [Runtime registration](../../src/index.ts)
- [Child protocol](../../src/protocol.ts)
- [Release workflow](../../.github/workflows/release.yml)
- [Staged trusted publishing decision](./003-release-through-release-please-and-staged-trusted-publishing.md)
