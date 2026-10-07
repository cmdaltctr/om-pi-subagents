# Proposal

## Why

The operator wants the extension named OMPS, with `omps` used consistently throughout its interface and runtime. Release approval also needs the existing OMMS convenience command, so a maintainer can approve a staged npm version without finding its stage ID manually.

## What Changes

- **BREAKING:** Rename the tool and command from `ompss` to `omps`, and the canonical settings command to `/omps-settings`. Rename the settings dialog, help, fleet labels, status/widget keys and notifications. Register no old-acronym aliases.
- **BREAKING:** Replace `OMPSS_*` process and test variables with `OMPS_*`. Rename child preflight, readiness, violation, observation, cleanup, tree and result identifiers consistently in the parent and child.
- **BREAKING:** Require exact `omps` approval for delegation. An old `ompss` entry must not approve the new tool.
- **BREAKING:** Store fresh runs in `<agent-dir>/omps/runs/`. Provide manual migration steps for operator settings, persona instructions, direct-copy installations and saved runs. Do not discover, rewrite or migrate old state automatically.
- Rename source symbols, fixture names, test names, current public instructions, package description/keyword and current OpenSpec terminology. Preserve generated changelog entries, archived plans and accepted decision records as historical evidence.
- Keep the npm package/repository, YAML filename, persona folder and shipped skill named `om-pi-subagents`. Preserve `/subagents-settings` as its existing generic alias and the independent legacy display JSON fallback; neither contains the old acronym.
- Add `bun run release:approve`, run by the human as `! bun run release:approve` in Pi. Port the OMMS script without its Claude plugin/channel operations. Print the Pi update command after approval; do not update the installation automatically.
- Capture the actual stage UUID from `npm stage publish` and add it to the GitHub release note. Keep stage-only trusted publishing and the existing release gate.
- Add deterministic tests for the rename and release helper, using disposable data and fake command-line tools. Record the breaking namespace decision in a new ADR.

## Capabilities

### New Capabilities

- `omps-identity`: Canonical runtime namespace, storage destination, clean removal of old names and safe manual migration.
- `npm-release-approval`: Human-run approval script, stage-ID discovery, failure handling and release-note handoff.

### Modified Capabilities

- `ompss-command-interface`: Rename commands/settings and registry environment selection while preserving their behaviour. This existing capability ID is used for delta matching; its directory becomes `omps-command-interface` after the delta is synced during archival.
- `nested-subagents`: Require exact `omps` approval and publish guidance with the new names.
- `agent-tree-viewer`: Rename settings and transcript entry names without an old-entry renderer alias.
- `todo-compatibility`: Expose `omps` beside todo and use the renamed settings command.
- `memory-compatibility`: Expose `omps` beside memory and use the renamed settings command.

## Impact

Affected implementation includes `src/index.ts`, `src/settings.ts`, `src/protocol.ts`, `src/runner.ts`, `src/child-guard.ts`, `src/managed-child.ts`, `src/todo-bootstrap.ts`, notifications and other namespace-bearing source files. Tests, fixtures, CI environment values, `scripts/ci-clean.sh`, package metadata, guides, the SVG's accessible text, the operational skill and active specs need coordinated updates.

The release helper belongs to repository tooling. It does not add a runtime dependency or ship maintainer scripts in the npm tarball. The draft in the original checkout is reference material only.

Existing operator YAML remains at its current location. Operators must replace tool approvals and environment names themselves. Saved runs remain evidence; moving files does not restore active work or transfer ownership. Existing sessions containing old message identifiers receive no new compatibility renderer.

Automatic Release Please PR merging, npm approval by an agent, notification automation and changes to OMMS or todo are outside this proposal. Do not edit versions or the Release Please manifest by hand. Ship the namespace change with a breaking Conventional Commit.
