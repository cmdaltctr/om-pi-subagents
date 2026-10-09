# Tasks

## 1. Result styling

- [x] 1.1 Prepare the feature worktree's development and Pi host dependencies after install approval; verify the focused result-message tests run.
- [x] 1.2 Add regression tests for themed panel rows, warning-coloured hints, host padding, narrow wrapping and theme changes; confirm the style assertions fail on the current renderer.
- [x] 1.3 Restore the themed panel and colour the hint in `src/result-message.ts`; verify the new tests and existing expansion tests pass.
- [x] 1.4 Extend the real-Pi result fixture to inspect coloured terminal rows; verify collapsed and expanded displays and unchanged delivery, then confirm removing each style fails its check in disposable copies.
- [x] 1.5 Describe the panel and hint colours in `docs/USAGE.md`; verify the guide explains theme-dependent colours and preserves expansion instructions.

## 2. Integration checks

- [x] 2.1 Run focused result rendering and shortcut tests; verify no failures and report any skipped real-Pi scenarios.
- [x] 2.2 Run `bun run ci` after full-suite approval, update the graph with `graphify update .`, and run `openspec validate restore-result-colours --strict`; verify results and report any blockers.
- [x] 2.3 Verify the implementation against the change artifacts with the OpenSpec verify workflow; resolve findings and confirm saved and model-facing results remain unstyled.
