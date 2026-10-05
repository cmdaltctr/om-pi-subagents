# Proposal: Move extension sources into src/

## Why

After `move-root-tests-into-test`, 28 production modules still sat at the repository root beside configuration and documentation. The root was hard to scan. The sibling `om-pi-todo` package keeps its sources in `src/`, and the owner wants the same layout here.

## What Changes

- Move every production `*.ts` module into `src/` with `git mv`, preserving history. `vitest.config.ts` stays at the root.
- Point `package.json` at the new layout: `files` lists `src` in place of 28 file names, and `pi.extensions` becomes `./src/index.ts`.
- Add `src/**/*.ts` to the `tsconfig.json` include list.
- Rewrite test and fixture references to root modules: `../x.ts` becomes `../src/x.ts`, `../../x.ts` becomes `../../src/x.ts`.
- Update tests that name source locations: packaging assertions, the shipped-defaults scan, the skill launch guard path and the install fixture.
- Update `AGENTS.md`, `docs/INSTALL.md` and ADR/TDR source links.
- No behaviour change, no new dependency. Imports between source modules stay unchanged because they all move together.

## Non-Goals

- Renaming, splitting or merging modules.
- Changing the published package name, version or entry behaviour.
- Moving `skills/`, `docs/` or tooling configuration.

Success is measured by `bun run ci` passing with the same 842 tests, the packaging test confirming every imported file is packed, and the pre-push fresh-clone gate.
