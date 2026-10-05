# Tasks

- [x] 1.1 Move all production root `*.ts` modules except `vitest.config.ts` into `src/` with `git mv`; point `package.json` `files` and `pi.extensions` at `src/` and add `src/**/*.ts` to `tsconfig.json`; verify `bun run typecheck` passes.
- [x] 1.2 Rewrite test and fixture references to moved modules, and update the packaging, shipped-defaults, skill and install-fixture path assumptions; verify `bun run test test/release.test.ts test/defaults.test.ts test/skill.test.ts` passes.
- [x] 1.3 Update source paths in `AGENTS.md`, `docs/INSTALL.md` and ADR/TDR links; verify `bun run test test/docs.test.ts` passes.
- [x] 1.4 Run `bun run ci` and confirm the same 842 tests run; then push so the pre-push fresh-clone gate verifies the committed state.
