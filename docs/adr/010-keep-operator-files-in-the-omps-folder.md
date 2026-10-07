# ADR-010: Keep operator files in the OMPS folder

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Project maintainer
- **Partly supersedes:** ADR-001 for the default registry location; ADR-008 for the registry filename and persona folder.

## Context

Operator files previously occupied three locations in the Pi agent directory: `om-pi-subagents.yaml`,
`om-pi-subagents/personas/` and `omps/runs/`. The maintainer requested one folder for backup and removal.
Package updates must continue to leave operator files untouched. `OMPS_REGISTRY` must still select another file.

Moving the registry beside the run folder changes persona containment. Saved model output and run personas
would become valid paths inside the registry folder unless validation excludes that evidence.

## Decision

Use `<agent-dir>/omps/config.yaml` as the default registry and document personas in `omps/personas/`.
Persona paths resolve from the YAML folder, so conventional mappings use `./personas/<name>.md`.
Run evidence remains in `omps/runs/`. Package, repository and shipped skill names remain `om-pi-subagents`.

Share the path resolver through `src/registry-path.ts`, re-exported from `src/index.ts`.
The runtime and supervisor lineage use the same rule, including `OMPS_REGISTRY` and the selected agent directory.
Resolution reads no file during registration.

When the default registry is missing and only the old file exists, fail fresh registry loading.
The error names the selected directory and shell-safe `mkdir` and `mv` commands.
Loading never reads or modifies the old file unless an explicit `OMPS_REGISTRY` override selects it.
Both existing files select the new default. A failed refresh drops launch snapshots.
Settings uses the same loader, so the migration error closes the menu before any save can be offered.

Compare canonical persona and run-root paths after resolving symbolic links.
Refuse personas inside the run root when that root is inside the registry folder.
Registry files elsewhere keep their existing containment rules.

Confirmed settings creation uses the existing private write path: new folders use `0700` and files use `0600`.
It creates no persona folder. Document a manual, backed-up migration with collision checks and rollback.

## Consequences

### Positive

- Operator settings, personas and evidence share one conventional folder.
- One resolver keeps default parent and child paths consistent.
- Run evidence cannot become mapped persona instructions.
- Migration errors explain the required actions without changing operator data.

### Negative

- Existing operators must move their registry and personas before using the new default.
- Relative skill and extension paths need review after changing the YAML folder.

### Neutral

- `OMPS_REGISTRY` can explicitly select the old filename or another registry.
- YAML fields, run formats and sibling preferences remain unchanged.
- Historical ADR bodies and saved evidence retain their original paths.

## Alternatives Considered

| Option                                    | Rejected Because                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| Read the old registry as a fallback       | Two possible sources obscure which settings are active.                               |
| Move files automatically                  | Persona and resource paths need operator review; destinations may already exist.      |
| Name the file `omps/om-pi-subagents.yaml` | The folder already identifies OMPS.                                                   |
| Rely on operator care for run evidence    | Model output could otherwise pass persona containment and become system instructions. |

## References

- [Original operator mapping decision](./001-keep-the-agent-mapping-outside-the-package.md)
- [Runtime namespace decision](./008-use-the-omps-runtime-namespace.md)
- [Shared registry paths](../../src/registry-path.ts)
- [Registry and persona validation](../../src/config.ts)
- [Settings persistence](../../src/settings-persistence.ts)
- [Manual migration and rollback](../INSTALL.md#move-settings-into-the-omps-folder)
