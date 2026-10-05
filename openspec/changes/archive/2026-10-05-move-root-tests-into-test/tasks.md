# Tasks

- [x] 1.1 Move all root `*.test.ts` files into `test/` with `git mv` and rewrite their relative imports and `import.meta.url` references; verify `bun run typecheck` passes.
- [x] 1.2 Update root-path test references in the repository AGENTS.md table, the README single-file example and any guide that names a moved test; verify `bun run test test/docs.test.ts` passes.
- [x] 1.3 Run `bun run ci` and confirm every previously running test still runs from its new location; then push so the pre-push fresh-clone gate verifies the committed state.
