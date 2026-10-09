# Maintaining OMPS

This page is for maintainers. Read [AGENTS.md](../AGENTS.md) before you change the project.

## Develop

Use Bun 1.4.2 and Node.js 22.12 or newer. Run these from the repository root:

```sh
bun install
bun run setup:host
bun run ci
```

`setup:host` fetches Pi 0.99.1 and typebox 1.3.27 into `.pi-host/`, outside `node_modules`. `bunfig.toml` sets `peer = false` to keep them there.

| Purpose                               | Command                   |
| ------------------------------------- | ------------------------- |
| Fetch pinned host packages and Pi CLI | `bun run setup:host`      |
| Human approval of a staged release    | `bun run release:approve` |
| Format files                          | `bun run format`          |
| Check formatting                      | `bun run format:check`    |
| Lint with warnings denied             | `bun run lint`            |
| Apply lint fixes for review           | `bun run lint:fix`        |
| Check types                           | `bun run typecheck`       |
| Run tests                             | `bun run test`            |
| Check dependency vulnerabilities      | `bun run audit`           |
| Format check, lint, types, then tests | `bun run ci`              |
| Check a fresh clone of committed HEAD | `bun run ci:clean`        |
| Install the Husky hooks               | `bun run prepare`         |

- `bun run ci:clean` needs a commit. It installs from the lockfile in a temporary clone and runs `bun run ci`.
- The `.husky/pre-push` hook runs host setup, then `bun run ci:clean`.
- GitHub Actions runs the same checks plus an audit job. Its actions use full commit SHA pins.
- Tests start real Pi children with a local fake model and a local MCP server. No live model or credential is used.
- Tests use `OMPS_PI_BIN` first, then `.pi-host/node_modules/.bin/pi`, then `pi` on PATH. CLI suites skip when Pi is missing.
- `OMPS_REGISTRY` selects another mapping file for tests or a second setup.

> [!CAUTION]
> **Known high-severity vulnerability in a development dependency**
> OpenSpec 1.14.0 brings in `braces@3.0.3` through `fast-glob` and `micromatch`.
> [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) allows deeply nested brace patterns to crash the OpenSpec CLI.
> No patched release exists as of 5 October 2026. Use only trusted schema patterns and repositories.
> The maintainer accepts this risk for personal development and compatibility tests.
> `bun run audit` checks production dependencies without exceptions, then checks all dependencies with this advisory excluded.
> Other advisories still fail the audit. Run `bun audit` to see the accepted finding.
> Remove the exception when a patched dependency becomes available.

## Release

Releases go to npm as `om-pi-subagents`. [Release Please](https://github.com/googleapis/release-please) prepares each one. Never edit the version or the changelog by hand.

1. Write commits and pull request titles in [Conventional Commits](https://www.conventionalcommits.org) style. Add `!` for a breaking change, for example `feat!:`.
2. Merge to `main`. Release Please opens a pull request called "chore(main): release X.Y.Z".
3. Check the version and changelog in that pull request. Wait for its CI checks.
4. `release-auto-merge.yml` squash-merges the tested commit with the release GitHub App. Release Please then tags it and creates a GitHub release.
5. The publish job runs the full gate on that commit and **stages** the version on npm. The release note gets the approval command. The version is not installable yet.
6. Run `bun run release:approve` from the repository with two-factor authentication. In Pi, use `! bun run release:approve`.

Agents and CI must never run real approval.

If the helper cannot find the stage UUID in the release note:

```sh
npm stage list om-pi-subagents
bun run release:approve <stage-uuid>
```

You can also run the note's exact `npm stage approve` command, or use the Staged tab at https://www.npmjs.com/package/om-pi-subagents. To reject, run `npm stage reject <stage-id>`.

Before you start, check `gh auth status` and `npm whoami`. You need Bun, the GitHub CLI, npm 11.15 or newer, and an npm account with approval rights.
The helper shows the stage, approves it, then polls npm up to 30 times. `OMPS_REPO` overrides the repository. `OMPS_RELEASE_POLL_SECONDS` changes the five-second interval.
When the version is visible, run `pi update npm:om-pi-subagents`, then `/reload` in Pi.

| Commit                                      | Version change before 1.0.0       |
| ------------------------------------------- | --------------------------------- |
| `fix:`, `perf:`                             | Patch, for example 0.1.0 to 0.1.1 |
| `feat:`                                     | Minor, for example 0.1.0 to 0.2.0 |
| `feat!:` or a `BREAKING CHANGE:` footer     | Minor. After 1.0.0 it is major.   |
| `docs:`, `style:`, `test:`, `chore:`, `ci:` | No release                        |

### Guarded merge

The workflow loads `scripts/release-pr-guard.mjs` from `main` and never runs pull request code. The guard requires:

- the release bot's pull request into `main`, with GitHub-signed bot commits and an unchanged tested head;
- changes only to `package.json`, `.release-please-manifest.json` and `CHANGELOG.md`;
- version-only changes in both JSON files, and no deleted changelog lines.

A guard failure stops the merge. After this workflow first reaches `main`, rerun the open release pull request's CI to trigger it.
After staging, the workflow comments on the merged pull request and mentions the owner. Turn on GitHub email notifications for `@mentions` to get it.
If the release fails before staging, fix the step and rerun the Release workflow.

### One-time setup

No npm token is used. npm trusts the release workflow through OIDC.

1. Publish the first version by hand, tag it and create its GitHub release.
2. Create the release GitHub App with the manifest helper. It saves `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` as repository secrets.
3. Create the `npm-publish` environment, limited to `main`.
4. Add the trusted publisher:

   ```sh
   npm trust github om-pi-subagents --file release.yml --repo cmdaltctr/om-pi-subagents --env npm-publish --allow-stage-publish
   ```

5. Switch the workflow on: `gh variable set RELEASE_PLEASE_ENABLED --body true`.
