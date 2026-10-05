# Proposal: Move root tests into test/

## Why

The repository keeps 64 test files at the root alongside production modules. The agent-tree-viewer change followed that convention and explicitly deferred this cleanup. The owner now requires all tests under `test/`.

## What Changes

- Move every root `*.test.ts` file into `test/` with `git mv`, preserving history.
- Rewrite each moved file's relative imports and `import.meta.url` references: root modules gain `../`, `./test/fixtures/` becomes `./fixtures/`.
- Update path references in the repository AGENTS.md test table, the README one-file example and any guide that names a root test path.
- No production file moves, no behaviour change, no new dependency.

## Non-Goals

- Moving, renaming or splitting production modules.
- Changing test behaviour, coverage or fixtures beyond the import paths they reference.
- Renaming test files.

Success is measured by `bun run ci` passing with the same tests, plus the fresh-clone gate on push.
