# TDR-003: Leave the generated changelog out of format checks

- **Date:** 2026-10-02
- **Status:** Accepted
- **Deciders:** Maintainer
- **Tags:** ci, release, formatting

## Context

The first automated release pull request (0.2.0) failed its CI check in the `Check formatting` step.
Version 0.1.0 was published by hand, so the generated changelog had never reached the gate before.

### Root Cause Analysis

| Step | What happens                                                                                 |
| ---- | -------------------------------------------------------------------------------------------- |
| 1    | Release Please writes `CHANGELOG.md` with double blank lines and `*` list markers.           |
| 2    | `oxfmt --check` rejects that layout.                                                         |
| 3    | The release pull request fails CI. The publish job runs the same gate, so nothing is staged. |

The project rules forbid editing `CHANGELOG.md` by hand, so a manual reformat is not allowed.

## Decision

1. Add `CHANGELOG.md` to `ignorePatterns` in `.oxfmtrc.json`.
2. Guard the pattern with an assertion in `test/docs.test.ts`.

## Consequences

### Positive

- Release pull requests and the publish job pass the format gate without hand edits.

### Negative

- Oxfmt no longer checks `CHANGELOG.md`. Release Please is the only writer of that file.

### Neutral

- Other Markdown files are still checked.

## References

- `.oxfmtrc.json`, `test/docs.test.ts`, `.github/workflows/release.yml`
- [ADR-003](../adr/003-release-through-release-please-and-staged-trusted-publishing.md)
