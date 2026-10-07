# Tasks

Implementation requires a separate approval. Work only in the feature worktree. Ask before dependency installation, full test suites, deletion or pushing. Never run the real approval helper as an agent; all automated approval tests must use fake command-line tools.

## 1. Rename commands, settings and process identifiers

- [x] 1.1 Add tests for `omps`, `/omps`, `/omps-settings`, OMPS dialog titles and absence of old-acronym tool/command/renderers in registration and settings suites. Confirm these tests fail against the current implementation for the expected name mismatch.
- [x] 1.2 Rename namespace-bearing source identifiers, tool/command registration, UI ownership, dialog/help labels, child entry constants and environment producers/consumers together. Update dependent fixtures and tests, retaining the generic settings alias. Verify registration, settings, protocol, runner and startup gate suites pass, and typecheck catches no stale imports.
- [x] 1.3 Add negative tests for old binary/registry/policy variable names and old `ompss` approval, then confirm failure before applying the safeguards. Verify old variables cannot select new configuration or pass readiness and old delegation permission cannot authorise `omps`.
- [x] 1.4 Update `OMPS_*` test-only variables, `scripts/ci-clean.sh` and CI/release host-binary settings without changing gate order or permissions. Verify tooling/workflow assertions and targeted real child launch and nested delegation suites use the new names and pass.
- [x] 1.5 Update current command/settings/delegation examples in README, public guides and the shipped skill alongside the runtime rename. Preserve README example markers. Verify docs tests and real fake-model documentation examples exercise `/omps` and `/omps-settings`.

## 2. Rename run storage and document manual migration

- [x] 2.1 Add tests proving fresh runs use `omps/runs/`, leave a populated old root untouched and preserve private modes. Confirm they fail on the old root before changing it; verify store, launch and details suites pass after the change.
- [x] 2.2 Document unchanged registry/persona/skill paths, exact approval changes, environment and explicit Pi path edits, stopped-child prerequisites, backup, collision-safe run/direct-copy moves and rollback in the public guides. Verify a disposable migration fixture preserves evidence bytes and refuses an existing destination; do not touch real operator files.
- [x] 2.3 Update package description/keyword, SVG accessible product text, current instructions, namespace-bearing fixture/test filenames and skill evaluation descriptions. Add ADR-008 and its index entry, keeping accepted historical ADR bodies and changelog intact. Verify docs/defaults/release packaging checks and an old-name audit whose exemptions are restricted to history, migration guidance and explicit rejection tests.

## 3. Add the human-run release approval helper

- [x] 3.1 Port the OMMS fake-PATH fixture into a Vitest release-approval suite. Cover discovered/explicit UUIDs, invalid/missing UUIDs, invalid tag, failed GitHub lookup/stage display, already-published version, failed approval, fresh registry reads, polling timeout and no automatic Pi/plugin operation. Confirm tests fail when the helper is absent, using only fake npm/gh commands.
- [x] 3.2 Add `scripts/release-approve.sh` and `package.json`'s `release:approve` entry with OMPS environment names, validated input, actionable errors and bounded fresh polling. Verify the fake-PATH suite and `bash -n` pass; deliberately remove UUID validation and freshness/approval-failure checks in disposable copies and confirm the corresponding tests fail.
- [x] 3.3 Document the exact `bun run release:approve` script-table entry, human Pi form `! bun run release:approve`, prerequisites, explicit-ID fallback and post-success Pi update command in README. Verify docs checks, and confirm the tarball excludes repository scripts and adds no runtime dependencies.

## 4. Capture stage IDs in release notes

- [x] 4.1 Extend release tests to execute the workflow stage and release-note shell blocks with fake npm/gh and synthetic stage output. Cover UUID capture, missing UUID guidance, exact note handoff and a failed publish hidden behind successful `tee`. Confirm failures on the current uncaptured stage step and on a disposable pipeline without `pipefail`.
- [x] 4.2 Add the stage step ID/output and explicit strict shell pipeline, then pass the captured UUID to release-note generation. Verify executable workflow fixtures and existing release safety checks pass without changing trusted publishing, action pins, gate order or environment permissions.
- [x] 4.3 Update workflow comments and maintainer README instructions to match stage-ID discovery and manual fallback. Verify docs/release tests and the approval fixture can consume the generated synthetic release note without contacting npm.

## 5. Verify the coordinated change

- [x] 5.1 Run targeted real-Pi/fake-model launch, readiness, permission, nested cleanup, result delivery, settings RPC and sibling compatibility checks. Verify all available checks pass; report missing host or optional sibling fixtures as unverified. Reuse the current disposable harnesses and preserve parent todo and memory data.
- [x] 5.2 Rehearse delta sync and active-spec namespace normalisation in a disposable copy, including command-capability directory rename after sync. Verify all final active specs validate strictly and no archive, accepted ADR body or generated changelog is rewritten. Keep real archival for the approved workflow after verification.
- [x] 5.3 After permission, run `bun run ci`; run available first-party security scanning and `graphify update .`. Verify results, trace findings and retain local evidence under ignored `docs/local-docs/`. Report which platform ran and keep unrun Linux/macOS checks explicit.
- [x] 5.4 Run OpenSpec verification and `openspec validate rename-omps-release-approval --strict`. Confirm every requirement has test or guide evidence and every checked task has met its stated acceptance criteria. Mark ADR-008 Accepted only after these checks pass.
- [ ] 5.5 After a permitted implementation commit, run `bun run ci:clean` with permission for its temporary-clone installs/full suite and verify committed files pass. Deliver a handoff listing results and any blockers, with the remaining sequence explicit: archive after all tasks pass, normalise active spec names after sync, validate all active specs, commit the archive in the same PR, then obtain permission before pushing or opening/merging that PR. Retain the normal pre-push hook.
