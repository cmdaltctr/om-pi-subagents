# Proposal

## Why

OMPSS currently allows one background child per session and prevents children from starting subagents. The maintainer needs YAML settings for parallel children and nesting, with `om-pi-todo` working in the parent and approved child sessions.

## What Changes

- Add optional `limits.maxConcurrentRuns` and `limits.maxDepth` to the operator's `om-pi-subagents.yaml`. Both accept operator-chosen integers without a separate fixed feature ceiling.
- Apply concurrency to each parent session's direct active children. A root session can run four children while each child has its own four-child allowance.
- Count the root as depth `0`. `maxDepth: 3` permits children, grandchildren and great-grandchildren. Depth `0` disables launches.
- Keep existing YAML compatible. Omitted limits default to one direct child and maximum depth `1`.
- Enable the `ompss` tool inside a child only when its mapping approves that exact tool. Keep fresh registry validation and isolated resource loading at every level.
- Keep a delegated child alive until its own subagents finish and their results can reach it. Cancellation, timeout and shutdown stop the whole owned subtree.
- Display several direct runs without mixing their states, tool activity or saved previews. Deliver each result separately to its immediate parent.
- Support explicitly mapped `om-pi-todo` in children. Child task lists stay local and use normal mode; the interactive parent's normal or OpenSpec sync mode stays unchanged.
- Require ADR-005 and updated public guides as verified deliverables. Keep the ADR Proposed until implementation passes verification.
- Ship `skills/om-pi-subagents/SKILL.md` with the package, discoverable as `/skill:om-pi-subagents`. Cover mapped-agent selection, YAML limits, nesting, results, cancellation and `om-pi-todo` without granting tools or changing configuration.

## Capabilities

### New Capabilities

- `configurable-run-limits`: YAML validation, defaults, fresh launch settings, per-session capacity and useful limit errors.
- `nested-subagents`: depth policy, approved delegation, lineage, nested result delivery, descendant cleanup and published operational guidance, including the ADR, docs and packaged skill.
- `todo-compatibility`: coexistence with `om-pi-todo`, explicit child loading, local tasks and compatible settlement hooks.

### Modified Capabilities

- `live-run-panel`: show multiple current-session runs while keeping progress, previews and late events isolated by run id.

## Impact

- Configuration and admission: `config.ts`, `service.ts`, `runs.ts`, plus their tests. The registry will carry immutable limits alongside persona snapshots.
- Child lifecycle: `index.ts`, `runner.ts`, `startup.ts`, `protocol.ts`, `child-guard.ts`, `supervisor.ts` and `processes.ts`. Add a small managed child entry point; reuse the existing runtime rather than adding a fleet service.
- Results and evidence: `result.ts`, `store.ts`, `persistence.ts`, `notify.ts` and `panel.ts`. Record nesting metadata and preserve confirmed cleanup as a completion gate.
- Compatibility evidence comes from the sibling `om-pi-todo` repository: `src/extension.ts`, `src/todo.ts`, `src/session-mode.ts`, `src/state/store.ts` and `src/reminder.ts`. No changes to that repository are planned. Test against a pinned real package in disposable integration fixtures.
- Add `docs/adr/005-configure-per-session-concurrency-and-nesting.md` and its index entry. Implementation updates `README.md`, `docs/SETUP.md`, `docs/INSTALL.md`, `docs/USAGE.md`, `docs/UNINSTALL.md`, `AGENTS.md` and `openspec/config.yaml`.
- Add the repository-owned skill at `skills/om-pi-subagents/SKILL.md`. Declare it in `package.json` through `pi.skills` and the published file list. Extend packaging, skill-loading and documentation tests; keep skill evaluation fixtures outside the published package.
- Keep `om-pi-todo` optional. Add no runtime dependency, shipped persona, personal path or automatic install.
- Preserve the existing `ompss` action names and session ownership checks. This change replaces the documented single-run and no-nesting limits; other command behaviour stays intact.

Planning changes neither project code nor the operator's live YAML. Existing uncommitted edits to `docs/INSTALL.md` must be preserved.
