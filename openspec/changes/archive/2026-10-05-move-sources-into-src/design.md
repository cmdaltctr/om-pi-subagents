# Design

## Context

Pi resolves an extension directory by reading `pi.extensions` in `package.json` first, and only then falls back to a root `index.ts`. Package installs and local copies into `~/.pi/agent/extensions/ompss/` therefore both load `src/index.ts` once the manifest points there.

Source modules reference each other with `./x.ts` imports. `src/index.ts` and `src/runner.ts` locate `child-guard.ts`, `managed-child.ts` and `todo-bootstrap.ts` with `new URL("./...", import.meta.url)`. No source file reads `package.json`, `README.md` or `skills/` by relative path.

## Decisions

1. Move all 28 production modules together so their relative imports and `import.meta.url` anchors stay valid without edits.
2. Ship the directory with `"files": ["src", ...]`, matching `om-pi-todo`. The release test allow-list accepts only `src/[a-z-]+.ts`, so an unexpected file type in `src/` still fails CI.
3. Rewrite test references mechanically, restricted to the 28 module names, so fixture and package paths are not touched by accident.
4. Keep `vitest.config.ts` at the root because Vitest discovers it there and it resolves `.pi-host/` from its own directory.
5. The install fixture copies `src/` recursively next to `package.json` and loads `src/index.ts`, mirroring a local copy.

## Risks / Trade-offs

- A missed reference fails typecheck or a launch test, which CI runs on every push.
- Operators with a hand-written settings entry pointing at the old root `index.ts` must point at `src/index.ts`. Package installs and directory copies are unaffected.

## Migration Plan

1. Move sources, update `package.json` and `tsconfig.json`, rewrite test references, run `bun run typecheck`.
2. Update documentation paths.
3. Run `bun run ci` and confirm the test count is unchanged.
4. Commit and push; the hook runs the fresh-clone gate.

Rollback is a single `git revert` of the move commit.
