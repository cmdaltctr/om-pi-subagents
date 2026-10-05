# Design

## Context

Source files live at the repository root and tests were colocated there. `tsconfig.json` already includes `test/**/*.ts`. Vitest discovers tests by glob, so `test/**` is picked up without configuration changes. Most fixtures already live in `test/fixtures/`.

## Decisions

1. Use `git mv` for every root `*.test.ts` file so history follows the content.
2. Rewrite import specifiers mechanically: a `./x.ts` reference to a root module becomes `../x.ts`; `./test/fixtures/...` becomes `./fixtures/...`. Apply the same mapping to `new URL("./...", import.meta.url)` literals.
3. Leave runtime path strings that resolve from the process working directory untouched; vitest keeps the repository root as the working directory.
4. Update documentation that names root test paths: the repository AGENTS.md area table and the README single-file command example.
5. `bun run ci` is the preservation proof; the pre-push fresh-clone gate re-verifies committed code.

## Risks / Trade-offs

- A missed import fails typecheck immediately, which is the cheapest place to catch it.
- Documentation claims are guarded by `test/docs.test.ts`, so stale path claims fail CI rather than ship.

## Migration Plan

1. Move files, rewrite imports, run `bun run typecheck`.
2. Update documentation paths.
3. Run `bun run ci` and fix any residual path assumption.
4. Commit and push; the hook runs the fresh-clone gate.

Rollback is a single `git revert` of the move commit.
