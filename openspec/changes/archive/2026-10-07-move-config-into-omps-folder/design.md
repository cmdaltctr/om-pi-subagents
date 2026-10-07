## Context

`resolveRegistryPath` in `src/index.ts` returns `OMPS_REGISTRY` or `<agent-dir>/om-pi-subagents.yaml`.
`src/supervisor.ts` repeats the old filename as the default lineage registry path.
`readPersona` in `src/config.ts` resolves each `persona:` path from the YAML file's folder with `realpath`, then refuses a path outside that folder.
Run files live in `<agent-dir>/omps/runs/` (ADR-008). Each run folder holds `persona.md`, `task`, `output.md`, `stderr.log` and `events.jsonl`.
`/omps-settings` already creates the registry's parent folder with mode `0700` before an atomic write (`src/settings-persistence.ts:121`).
The legacy display preference lives in `~/.config/pi-subagents/config.json` and is not affected.

ADR-001 keeps the mapping outside the package. ADR-008 renamed the runtime with no aliases and a documented manual migration, and kept the registry filename and persona folder unchanged.

## Goals / Non-Goals

**Goals:**

- One OMPS folder in the agent directory: `omps/config.yaml`, `omps/personas/` and `omps/runs/`.
- No silent fallback to the old file, so the operator always knows which settings are active.
- A clear, actionable error when only the old file exists.
- Persona containment that cannot point into run evidence.

**Non-Goals:**

- No automatic move, copy or rewrite of operator files.
- No change to the YAML schema, run file format, child processes or permissions.
- No rename of the npm package, repository or shipped skill.
- No change to the legacy display preference path.

## Decisions

### Decision 1: New default path `<agent-dir>/omps/config.yaml`

`resolveRegistryPath` returns `OMPS_REGISTRY` when set, otherwise `<agent-dir>/omps/config.yaml`. The supervisor lineage default uses the same function, so parent and child agree.
The file name is `config.yaml` because the folder already names the product. Error field names change from `om-pi-subagents.yaml` to `config.yaml`, and messages name the full path where they already did.

Alternative considered: `<agent-dir>/omps/om-pi-subagents.yaml`. Rejected because it repeats the product in a folder that already names it.

### Decision 2: Personas conventionally in `omps/personas/`

Persona resolution is unchanged: relative to the YAML file's folder, then `realpath`, then the containment check. Mappings write `./personas/<name>.md`.
The folder name stays a convention. OMPS still never scans it.

### Decision 3: Refuse personas inside the run root

The run root now sits inside the YAML folder. A persona path such as `./runs/<session>/<run>/output.md` would pass the existing containment check and turn model output into a system prompt.
`readPersona` refuses a canonical path inside the canonical run root with `<persona> resolves inside the OMPS run folder`. The check runs only when the run root is inside the YAML folder, so an `OMPS_REGISTRY` file elsewhere behaves as before.

Alternative considered: rely on operator care. Rejected because the AGENTS.md security rules require persona containment, and run files can hold untrusted model text.

### Decision 4: Clean break with a blocking migration error

OMPS never reads `<agent-dir>/om-pi-subagents.yaml`. This follows ADR-008: no aliases, explicit manual migration.
When `OMPS_REGISTRY` is unset, the new file is missing and the old file exists, registry refresh fails with:

```text
config.yaml: OMPS now reads ~/.pi/agent/omps/config.yaml. Move your settings:
  mkdir -p ~/.pi/agent/omps/personas
  mv ~/.pi/agent/om-pi-subagents.yaml ~/.pi/agent/omps/config.yaml
Then move your persona files into ~/.pi/agent/omps/personas/ and change each persona: line to ./personas/<name>.md.
See docs/INSTALL.md#move-settings-into-the-omps-folder.
```

The message uses the real agent directory, not a fixed `~/.pi/agent`. Like any failed refresh, it blocks launches and `/omps list`. `/omps-settings` shows the same message and offers no save until the operator moves the file, so it cannot create an empty new registry beside the old one.
The check is one `stat` of a constant path during refresh. Registration still reads no file.

Alternative considered: read the old file as a fallback. Rejected because two possible sources make the active settings unclear and break ADR-008's precedent.
Alternative considered: move files automatically. Rejected because persona paths need editing and OMPS must not modify operator data.

### Decision 5: Settings and folder creation

`/omps-settings` writes to the resolved new path. When it creates a new registry after confirmation, it creates `omps/` with mode `0700` through the existing persistence path. It does not create `personas/`.

### Decision 6: Record ADR-010

ADR-010 records the new layout, the run-root containment rule and the blocking migration error. It partly supersedes ADR-001 (registry location only) and ADR-008 (unchanged registry filename and persona folder).

## Risks / Trade-offs

- [Every operator must move files after the upgrade] → The blocking error names the commands. `docs/INSTALL.md` gives backup, move, edit, check and rollback steps.
- [An operator sets `OMPS_REGISTRY` to the old file] → This works. The override is explicit, and the docs mention it as a temporary rollback.
- [Large test churn] → Fixtures use a shared helper for the registry path where one exists. Tests are updated in one commit after the failing-first tests.
- [A child launched by an old parent version] → Parent and child come from the same installed package, so they agree on the path.

## Migration Plan

1. Stop Pi sessions and confirm no OMPS run is active.
2. Back up `<agent-dir>/om-pi-subagents.yaml` and the persona folder.
3. `mkdir -p <agent-dir>/omps/personas`.
4. Move persona files into `omps/personas/`.
5. Move the YAML file to `omps/config.yaml`.
6. Change each `persona:` line to `./personas/<name>.md`.
7. Start Pi and run `/omps list`.

Rollback: install the previous version, move the files back, and restore the backed-up YAML.

## Open Questions

None.
