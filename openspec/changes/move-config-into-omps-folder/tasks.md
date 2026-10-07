## 1. Failing tests first

- [ ] 1.1 In `test/index.test.ts`, assert `resolveRegistryPath(agentDir, {})` returns `<agentDir>/omps/config.yaml` and still returns `OMPS_REGISTRY` when set. Run it and confirm it fails on the old path.
- [ ] 1.2 In `test/supervisor.test.ts` (or the lineage test that covers it), assert the default lineage registry path matches `resolveRegistryPath`. Confirm it fails.
- [ ] 1.3 In `test/registry-store.test.ts`, add: only the old file exists → refresh fails, launches blocked, error names both paths and the `mkdir` and `mv` commands with the real agent directory; the old file is byte-for-byte unchanged. Confirm it fails.
- [ ] 1.4 Add: both files exist → only `omps/config.yaml` loads; `OMPS_REGISTRY` naming the old file → it loads. Confirm the first fails.
- [ ] 1.5 In `test/config.invalid.test.ts`, add: a persona path that resolves inside the run root (direct and through a symbolic link) is refused with the field named. Confirm it fails.
- [ ] 1.6 In `test/settings.test.ts`, add: only the old file exists → settings shows the migration error and offers no save; neither file exists → confirmed creation writes `omps/config.yaml` with modes `0700` and `0600` and creates no `personas/`. Confirm both fail.
- [ ] 1.7 Add a real-Pi e2e case in a disposable agent directory: `omps/config.yaml` with `./personas/reader.md` loads and runs one agent.

## 2. Implementation

- [ ] 2.1 Change `resolveRegistryPath` in `src/index.ts` to `<agentDir>/omps/config.yaml`. Use it for the supervisor lineage default in `src/supervisor.ts`.
- [ ] 2.2 Add the old-file check to registry refresh: only when `OMPS_REGISTRY` is unset, the new file is missing and `<agentDir>/om-pi-subagents.yaml` exists. Build the message from the real agent directory. Keep registration free of file access.
- [ ] 2.3 Refuse persona paths inside the canonical run root in `readPersona` (`src/config.ts`). Apply the check only when the run root is inside the registry folder.
- [ ] 2.4 Rename error field labels from `om-pi-subagents.yaml` to `config.yaml`, including the persona frontmatter message.
- [ ] 2.5 Make `/omps-settings` show the migration error and offer no save when only the old file exists. Keep folder creation through the existing `0700` persistence path.
- [ ] 2.6 Update test fixtures and helpers that write `om-pi-subagents.yaml` to write `omps/config.yaml`, and persona folders to `omps/personas/`. Prefer one shared helper where fixtures repeat the path.
- [ ] 2.7 Break each new safeguard in a disposable copy (path default, old-file check, run-root refusal, settings no-save) and confirm a test fails. Record evidence in ignored `docs/local-docs/`.

## 3. Documentation and skill

- [ ] 3.1 Update `README.md`: file layout, first-agent example, example markers used by `test/docs.e2e.test.ts`.
- [ ] 3.2 Update `docs/SETUP.md`: layout tree, `mkdir` and `cat` steps, YAML examples with `./personas/`, error table.
- [ ] 3.3 Add `docs/INSTALL.md` section "Move settings into the OMPS folder" with stop, backup, move, edit, check and rollback steps. Add an upgrade note marked breaking.
- [ ] 3.4 Update `docs/USAGE.md` troubleshooting with the migration error and the run-root refusal.
- [ ] 3.5 Update `docs/UNINSTALL.md` "What remains" to list the one `omps/` folder.
- [ ] 3.6 Update `skills/om-pi-subagents/SKILL.md` and `AGENTS.md` (the operator mapping path).
- [ ] 3.7 Write ADR-010 with the `s-adr` skill. Mark ADR-001 and ADR-008 as partly superseded for file locations. Update `docs/adr/ADR_README.md`.

## 4. Check

- [ ] 4.1 Run `bun run test` with the pinned host and with `OMPS_PI_BIN=~/.pi/agent/bin/pi`.
- [ ] 4.2 Run `bun run ci`. Commit with a `feat!:` subject and a `BREAKING CHANGE:` footer.
- [ ] 4.3 Ask the operator before running `bun run ci:clean`.

## 5. Operator migration (real machine, ask first)

- [ ] 5.1 Ask the operator for approval before touching any file in `~/.pi/agent`. Do nothing in this section without it.
- [ ] 5.2 Back up: `cp -p ~/.pi/agent/om-pi-subagents.yaml ~/.pi/agent/om-pi-subagents.yaml.bak-<date>` and `cp -Rp ~/.pi/agent/om-pi-subagents ~/.pi/agent/om-pi-subagents.bak-<date>`.
- [ ] 5.3 `mkdir -p ~/.pi/agent/omps/personas`.
- [ ] 5.4 Move `~/.pi/agent/om-pi-subagents/personas/*.md` into `~/.pi/agent/omps/personas/`. Stop if any name already exists there.
- [ ] 5.5 Move `~/.pi/agent/om-pi-subagents.yaml` to `~/.pi/agent/omps/config.yaml`. Stop if the destination exists.
- [ ] 5.6 Rewrite `persona:` lines from `./om-pi-subagents/personas/` to `./personas/`. Show the diff to the operator.
- [ ] 5.7 Validate with the OMPS loader, then ask the operator to run `/omps list` in Pi and confirm every agent appears.
- [ ] 5.8 Ask before removing the empty old persona folder and the backups.

## 6. Close the change

- [ ] 6.1 Run `openspec validate move-config-into-omps-folder --strict`.
- [ ] 6.2 Run the `openspec-verify-change` skill and resolve its findings.
- [ ] 6.3 Archive the change with the `openspec-archive-change` skill before opening the pull request.
