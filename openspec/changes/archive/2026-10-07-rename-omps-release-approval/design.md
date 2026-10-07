# Design

## Context

See `proposal.md` for the requested scope. The user selected a clean rename with manual migration and no old-acronym aliases.

`src/index.ts` registers the tool, command, status/widget ownership and transcript renderers. It resolves `OMPSS_REGISTRY`, selects `OMPSS_PI_BIN` and constructs `<agent-dir>/ompss/runs/`. `src/settings.ts` registers `/ompss-settings` and the generic `/subagents-settings` alias; its dialog currently says Subagent settings. `src/ui-settings.ts` reads YAML and an independent legacy display JSON at `<config-dir>/pi-subagents/config.json`.

`src/protocol.ts` defines child entry names and reads process policy. `src/runner.ts` writes matching environment variables and loads managed delegation only for exact `ompss` approval. Child guard, managed-child and todo-bootstrap consume those values. The namespace must change in both directions together.

`RunStore` saves private evidence beneath a supplied root. Saved status includes the original absolute directory. Inspection depends on current-session observations and validated lineage; it does not recover arbitrary old sessions from folders.

The release workflow stages on npm after the exact-commit gate, then appends generic instructions without a UUID. The reference OMMS helper reads a release tag and UUID, displays the stage, requests human approval and polls npm with `--prefer-online`. Its later Claude plugin dispatch is unrelated to this extension.

## Goals / Non-Goals

**Goals:** Preserve existing execution and safety rules while changing the namespace consistently. Make release approval convenient for the maintainer. Provide explicit migration and rollback instructions that leave historical evidence intact.

**Non-Goals:** Automatic migration, old-acronym command or environment fallback, historical session rewrites, resuming old processes, changing npm identity, adding dependencies, automatic release PR merges, automatic npm approval, channel promotion or automatic local Pi updates.

## Decisions

### 1. Replace the namespace at its existing boundaries

Use `omps` for the tool, slash command, status/widget keys and namespaced entry strings. Use `/omps-settings` and OMPS settings dialog labels. Replace `OMPSS_*` with `OMPS_*`, and source identifiers such as `OmpssRuntime` and `registerOmpss` with their corresponding `Omps` forms. Update fixtures, test filenames, CI and local CI scripts together.

Keep module responsibilities unchanged. Do not add a namespace abstraction or new configuration option for this mechanical rename. A compatibility table or aliases were rejected by the user.

Registration tests must assert absence of the old commands/tool/renderers, rather than only assert presence of the new names. Environment tests must prove old variables do not select the registry, binary or child policy. Do not let a process marked only with the old child variable launch a task as an unguarded child.

### 2. Preserve package-named and independent settings paths

Keep `om-pi-subagents` as the repository/npm package, shipped skill name and resource path. Keep `om-pi-subagents.yaml` and the documented persona folder. These names match the retained package identity.

The generic `/subagents-settings` alias and legacy display JSON fallback remain unchanged. They contain no old acronym and removing them would add unrelated behaviour changes. Make all their current product labels and guidance say OMPS. The migration guide must say which files stay in place and how to transfer the legacy visible-agent value into YAML if desired.

### 3. Change fresh run storage without rewriting evidence

Construct `<agent-dir>/omps/runs/` for new runs. Ignore `<agent-dir>/ompss/runs/`; do not create an automatic reader, migration or directory symlink.

Document a manual same-filesystem directory move only after old sessions and their descendants have stopped, and only when the destination does not exist. If both destinations exist, stop and compare them before transferring any session directory. Do not recommend a force move or merging overlapping run IDs.

Leave run file content byte-for-byte unchanged. Original status paths, configuration snapshots and log names are historical evidence and can still mention the old namespace. A directory move preserves files; it does not restore ownership, revive tasks or guarantee the new inspection UI can reconstruct a former session.

### 4. Port the repository-only approval helper

Add `scripts/release-approve.sh` and the matching package script. The maintainer runs `! bun run release:approve` in Pi or `bun run release:approve` in a terminal. The exclamation mark is Pi's shell prefix, not part of the package script.

Follow the OMMS flow: resolve the newest GitHub release in `cmdaltctr/om-pi-subagents`; validate its stable semantic tag; stop if npm already serves that version; read a supplied UUID or the exact approval command in the release body; validate the UUID before use; display the stage; request approval; poll for the release version with fresh npm reads. Reuse the reference's bounded 30 attempts and five-second interval, with `OMPS_REPO` and `OMPS_RELEASE_POLL_SECONDS` replacing its environment prefixes.

Report tag/discovery/approval failures with concrete commands. A missing UUID must instruct the maintainer to run `npm stage list om-pi-subagents`, then pass the selected UUID. Failed approval must stop before polling. A visibility timeout must advise checking npm status before any retry, since approval can have succeeded already.

After success print `pi update npm:om-pi-subagents`. Do not run it. Never dispatch the OMMS Claude workflow or inspect a stable plugin branch. No npm tokens or authentication material are stored. Agents must not execute the real approval helper.

### 5. Record the UUID after staging without hiding a failed publish

Assign the stage step an ID. Capture combined output through `tee` under `set -euo pipefail`, then extract the UUID from npm's `staged with id` message and expose it as a step output. Pass that value to the release-note step.

Include `bun run release:approve` and `npm stage approve <actual-uuid>` in the note. If extraction finds no UUID, retain explicit manual-list guidance and avoid claiming the helper can discover an ID. No stage command or approval note runs after the full gate fails; a failed stage process must fail the step even when `tee` succeeds.

Tests should execute the extracted shell step with fake npm output, not rely solely on matching workflow strings. Preserve the existing protected environment, permissions, action pins and exact-tagged-commit checkout.

### 6. Separate current names from historical evidence

Update executable code, tests/fixtures, current guides, SVG accessible text, operational skill/evaluation descriptions, `AGENTS.md` and OpenSpec context. Audit names without altering personal text or unrelated settings. Keep `CHANGELOG.md`, archived changes and accepted ADR bodies intact. Add ADR-008 and its index entry to explain the breaking namespace and unchanged package identity.

Use existing capability paths for deltas, as required by OpenSpec. Apply command-interface deltas before changing that capability directory's name during archival. Rehearse syncing and directory normalisation in a disposable copy, then validate all active specs. Rename old-acronym requirement headings and current spec prose as part of that final normalisation; never rewrite archived deltas to disguise the original contract.

## Risks / Trade-offs

- A missed parent/child name breaks readiness or nesting. Use real fake-model child launch and nested-delegation tests.
- Old approved tool lists fail readiness. Give a migration example replacing only the exact delegation tool entry.
- A mixed-version live session loses protocol agreement. Stop all old children and restart affected Pi sessions before use.
- Old transcript renderers are absent after the rename. Explain that saved sessions remain historical files with no compatibility promise.
- Moving a run directory can collide with new evidence. Require a missing destination and preserve IDs and original file contents.
- npm output changes can prevent UUID discovery. Retain the explicit UUID argument and manual list instructions.
- Approval succeeds before npm visibility catches up. Bound polling and avoid reporting a timeout as proof of failed approval.
- Archive sync targets the old capability ID. Rehearse the delta sync before renaming its directory and validate the final active specs.

## Migration Plan

1. Save backups of the operator registry, personas, affected Pi configuration and saved run folders.
2. Stop all old parent sessions after cancelling and confirming cleanup of their owned children.
3. Keep `om-pi-subagents.yaml` in place.
4. Replace exact `ompss` delegation approvals with `omps` in the relevant agent mappings.
5. Update persona instructions and any command references to `/omps` and `/omps-settings`.
6. Rename configured `OMPSS_*` shell, launcher and CI variables to their `OMPS_*` equivalents.
7. Keep package install entries as `npm:om-pi-subagents`.
8. Move any direct-copy installation folder from `extensions/ompss/` to `extensions/omps/` only when the destination is absent.
9. Update explicit extension paths in operator Pi settings and mapped resources if that folder moved.
10. Move `ompss/runs/` into `omps/runs/` only when the documented collision checks pass.
11. Preserve the saved evidence files and their original path strings.
12. Install the renamed release and start a fresh Pi session.
13. Check `/omps list`, `/omps`, `/omps-settings` and one disposable nested run.

The public guide must adapt these paths for `PI_CODING_AGENT_DIR` overrides. It must include backups, collision-safe commands and confirmation steps, not perform these actions on the operator's files.

For rollback, stop new sessions and their children first. Restore the backed-up operator configuration and previous package version. Move directories back only when their prior destinations are absent; preserve both histories when a destination already exists. Keep newly created OMPS evidence separate, and do not rewrite historical records or reapprove an already published npm version.
