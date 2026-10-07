## Why

OMPS keeps operator files in three places in the Pi agent directory: `om-pi-subagents.yaml`, a persona folder such as `om-pi-subagents/personas/`, and `omps/runs/`.
The maintainer wants all OMPS files in one `omps/` folder, so they are easy to find, back up and remove.
ADR-008 already moved run files to `omps/runs/` and kept the registry filename only to limit that change.

## What Changes

- **BREAKING**: The default registry moves from `<agent-dir>/om-pi-subagents.yaml` to `<agent-dir>/omps/config.yaml`.
- The documented persona folder becomes `<agent-dir>/omps/personas/`. Persona paths still resolve from the YAML file's folder, so mappings write `./personas/<name>.md`.
- `OMPS_REGISTRY` still overrides the registry path. Run files stay in `<agent-dir>/omps/runs/`.
- **BREAKING**: OMPS never reads the old registry file. When the old file exists and the new one does not, OMPS blocks launches and `/omps list` with an error that names the exact migration commands. It never moves or copies operator files.
- A persona path that resolves inside the run root is refused, because run files hold model output and saved personas.
- `/omps-settings` reads and writes the new path, and creates `omps/` with mode `0700` when it confirms a new registry.
- Error messages, the shipped skill, `AGENTS.md`, `README.md` and the guides use the new paths. `docs/INSTALL.md` gains a migration and rollback section.
- ADR-010 records the decision and partly supersedes ADR-001 and ADR-008 on file locations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `configurable-run-limits`: limits live in the registry at its new default path.
- `omps-identity`: the registry filename and documented persona folder move under `omps/`; the package name and skill name stay `om-pi-subagents`; migration guidance covers the move.
- `omps-command-interface`: settings read and write the new default registry path and name it in the menu.

## Impact

- Code: `src/index.ts` (`resolveRegistryPath`), `src/supervisor.ts` (lineage default), `src/config.ts` (error field names, persona containment), `src/settings.ts` and `src/settings-persistence.ts` (create folder).
- Tests: about 40 test files and fixtures name `om-pi-subagents.yaml`. Fixtures switch to `omps/config.yaml`.
- Docs: `README.md`, `docs/INSTALL.md`, `docs/SETUP.md`, `docs/USAGE.md`, `docs/UNINSTALL.md`, `AGENTS.md`, `skills/om-pi-subagents/SKILL.md`, README example markers used by `test/docs.e2e.test.ts`.
- Operators: one manual move of the YAML file and persona folder, and an edit of each `persona:` line. Release Please treats this as a breaking change.
- No dependency change. No change to child processes, permissions or run file format.
