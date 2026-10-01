# ADR-003: Release through Release Please and staged trusted publishing

- **Date:** 2026-10-01
- **Status:** Proposed
- **Deciders:** Maintainer

## Context

OMPSS was installed by copying the project into `~/.pi/agent/extensions/ompss/`. The copy went stale as soon as the source changed. Pi can install packages from npm with `pi install npm:<name>`.

The maintainer's other packages, `omms` and `om-pi-todo`, already release through one proven pipeline. That pipeline holds no npm token and needs a person to approve each version.

## Decision

1. Publish the package to npm as `om-pi-subagents` from the public repository `cmdaltctr/om-pi-subagents`, under the MIT licence.
2. Ship only the runtime `.ts` files, the three guides, `README.md`, `LICENSE` and `CHANGELOG.md`. Keep `yaml` as the one runtime dependency. Keep Pi's packages as wildcard peers.
3. Use Release Please for versions and the changelog, read from Conventional Commits.
4. Sign the release pull request in as a private GitHub App, so its CI checks run.
5. Publish with npm trusted publishing (OIDC) and `npm stage publish`. The version waits until the maintainer approves it with 2FA.
6. Run the full gate on the exact release commit before staging.
7. Publish 0.1.0 by hand first, because npm accepts a trusted publisher only for a package that exists.
8. Keep the workflow off until the `RELEASE_PLEASE_ENABLED` variable is set.
9. Guard the setup with `test/release.test.ts`: the packed file list, imports, workflow permissions, no npm token, and version checks.

## Consequences

### Positive

- Users install and update with one Pi command.
- No npm token exists, so none can leak.
- No version reaches users without a passing gate and a human approval.

### Negative

- The first publish, the GitHub App and the trusted publisher each need manual steps.
- Every change must use Conventional Commits, or Release Please ignores it.

### Neutral

- The status stays Proposed until 0.1.0 is published and the first automated release is approved.

## Alternatives Considered

| Option                                                | Rejected Because                                 |
| ----------------------------------------------------- | ------------------------------------------------ |
| **Keep the directory copy**                           | It goes stale and has no versions.               |
| **Install from git with `pi install git:`**           | No versions, changelog or approval step.         |
| **Publish with an npm token in CI**                   | A token can leak. Trusted publishing needs none. |
| **Use the default `GITHUB_TOKEN` for Release Please** | The release pull request would run no CI checks. |

## References

- `.github/workflows/release.yml`, `release-please-config.json`, `.release-please-manifest.json`
- `test/release.test.ts`
- README "Release (maintainers)"
