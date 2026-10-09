# ADR-011: Adopt guarded App merges for release pull requests

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

Release Please opens release pull requests through the private release GitHub App.
The maintainer previously merged each release pull request after CI passed.
The maintainer requested the guarded merge pattern used by OMMS, while retaining human npm approval with 2FA.

A release branch name alone cannot establish that its contents came from Release Please.
The merge must apply to the commit that passed CI. A privileged workflow must use trusted code from `main`.

## Decision

Use `.github/workflows/release-auto-merge.yml` after a successful `CI` workflow run.
Require a same-repository `pull_request` run on a `release-please--` branch and `RELEASE_PLEASE_ENABLED=true`.
Load `scripts/release-pr-guard.mjs` from `main` with checkout credentials disabled.
Fetch pull request metadata and version files through the GitHub API without executing pull request code.

The guard requires the release bot's pull request targeting `main`, bot-authored commits signed by GitHub,
and a head SHA that still matches the successful CI run.
Allow modifications only to `package.json`, `.release-please-manifest.json` and `CHANGELOG.md`.
Require both JSON files to change only their versions and agree. Refuse changelog deletions.

Use the existing release App credentials to squash-merge with `--match-head-commit` set to the tested SHA.
The App token allows the merge to start the Release workflow.
This workflow requires no native `allow_auto_merge` repository setting.

Keep the full gate before npm staging. After staging, mention the repository owner in a release pull request comment.
Email delivery depends on the owner's GitHub email notifications for `@mentions`.
If the release fails before staging, add a release notice and comment with the failed run link.
Keep publication approval human-run: `bun run release:approve`, or `! bun run release:approve` in Pi, with 2FA.

Once the workflow reaches `main`, rerun an existing release pull request's `pull_request` CI run to trigger it.
Leave that pull request's source unchanged.

## Consequences

### Positive

- Passing release pull requests can merge without a separate maintainer action.
- The guard checks commit provenance and file contents before using the App's merge permission.
- The SHA constraint refuses a head that changes after CI.
- Human approval controls when the staged package becomes installable.

### Negative

- Changes to the release bot or generated file layout require guard maintenance.
- GitHub notification settings determine whether owner comments arrive by email.
- Failed gates or guard refusals require maintainer follow-up.

### Neutral

- The existing App secrets and npm trusted publisher remain in use.
- Existing release pull requests need a CI rerun after the workflow reaches `main`.

## Alternatives Considered

| Option                                      | Rejected Because                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Continue manual release pull request merges | Keeps a separate maintainer action before staging.                           |
| Use native GitHub auto-merge alone          | Does not provide these checks for bot provenance and version-only changes.   |
| Trust the release branch name               | A matching name does not establish who authored its commits or what changed. |
| Execute the guard from the pull request     | Gives pull request code access to a privileged workflow.                     |

## References

- [Existing release pipeline decision](./003-release-through-release-please-and-staged-trusted-publishing.md)
- [Release auto-merge workflow](../../.github/workflows/release-auto-merge.yml)
- [Release pull request guard](../../scripts/release-pr-guard.mjs)
- [Release and staging workflow](../../.github/workflows/release.yml)
- [Maintainer release instructions](../MAINTAINING.md#release)
- [OMMS source workflow](https://github.com/cmdaltctr/omms/blob/main/.github/workflows/release-auto-merge.yml)
- [OMMS source guard](https://github.com/cmdaltctr/omms/blob/main/scripts/release-pr-guard.mjs)
