# AGENTS.md

OMPSS runs YAML-mapped personas as native Pi child processes. Read this file before changing the extension.

## Architecture

Source files live in `src/`. Tests live in `test/`. Pi loads the default export of `src/index.ts`.

| Path                                                     | Responsibility                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/index.ts`                                           | Register the tool, command and session lifecycle. Create the runtime lazily.    |
| `src/config.ts`                                          | Validate YAML and persona paths. Produce immutable launch snapshots.            |
| `src/service.ts`, `src/runs.ts`                          | Handle user actions, session ownership and configured direct-child capacity.    |
| `src/runner.ts`, `src/startup.ts`, `src/protocol.ts`     | Build isolated child arguments and verify readiness before sending a task.      |
| `src/child-guard.ts`                                     | Enforce exact tool names inside the child. Report violations.                   |
| `src/rpc.ts`                                             | Read bounded JSON lines and manage child requests, subscriptions and pipe loss. |
| `src/supervisor.ts`, `src/processes.ts`, `src/result.ts` | Follow the run, stop descendants and decide its final result.                   |
| `src/store.ts`, `src/persistence.ts`, `src/notify.ts`    | Save private run files, flush writes and deliver the result separately.         |
| `src/managed-child.ts`, `src/todo-bootstrap.ts`          | Wait for owned results in approved delegators and seed child-local todo mode.   |
| `test/fixtures/`                                         | Fake model, local MCP server and disposable Pi harnesses.                       |

Keep these boundaries:

- Registration must start no process and read no file. Runtime creation belongs to first use.
- Validate each launch against fresh configuration. A failed refresh must block launches.
- Readiness must confirm the guard, tools, model and working directory before the task reaches the child.
- The child guard enforces trusted tool calls. It provides no operating-system sandbox.
- Keep completion separate from result delivery. A failed notification must not change a completed run.
- Only report completion after saved output, a clean child exit and confirmed cleanup.
- Preserve callback snapshots during RPC delivery. Subscribers can change the subscriber list while it runs.

Pi supplies `@earendil-works/pi-coding-agent` and `typebox` as peers. Keep host packages out of `dependencies`.
The host setup also pins `@earendil-works/pi-ai` and `@earendil-works/pi-tui` in `.pi-host/`.

## OpenSpec workflow

Plan behaviour changes with OpenSpec (spec-driven schema, CLI `openspec`) before you write code.

Use a change for a new feature, a change to user-visible behaviour, or a breaking change. Skip it for typo fixes, docs-only edits, dependency bumps, and bug fixes that restore specified behaviour.

1. If the scope is unclear, investigate first with the `openspec-explore` skill. Do not edit code in this step.
2. Create the change with the `openspec-propose` skill. It writes `proposal.md`, `design.md`, `tasks.md`, and `specs/<capability>/spec.md` under `openspec/changes/<name>/`.
3. Run `openspec validate <name> --strict` and fix every finding.
4. Stop and ask the user to approve the proposal. Do not implement in the same turn as the proposal.
5. Implement with the `openspec-apply-change` skill. Mark each task `- [x]` in `tasks.md` when it is done and tested.
6. If the plan changes during work, update the change artifacts with the `openspec-update-change` skill.
7. Before you report completion, run the `openspec-verify-change` skill.
8. Before you create the pull request, archive the completed change with the `openspec-archive-change` skill. Archiving moves it to `openspec/changes/archive/` and syncs its spec deltas into `openspec/specs/`. Archive only when every task is done and step 7 passes.

Use `openspec list` for active changes and `openspec status --change <name>` for artifact status.

Commit OpenSpec artifacts with the code change they describe. Commit the archive move in the same pull request as the change. A change that is only a proposal stays active until it is implemented.

## Commands and prerequisites

Run commands from the repository root. Use Bun 1.4.2 and Node.js 22.12 or newer. Network access is required for installs.

1. Ask before installing dependencies.
2. Run `bun install`.
3. Run `bun run setup:host`.

`bunfig.toml` disables automatic peer installation. `.pi-host/` holds Pi 0.99.1 and typebox 1.3.27 outside project dependencies.

| Purpose               | Command                         | Prerequisites                                   |
| --------------------- | ------------------------------- | ----------------------------------------------- |
| Fetch host packages   | `bun run setup:host`            | Bun, network on first use                       |
| Format files          | `bun run format`                | Development dependencies                        |
| Check formatting      | `bun run format:check`          | Development dependencies                        |
| Lint                  | `bun run lint`                  | Development dependencies; warnings fail         |
| Apply lint fixes      | `bun run lint:fix`              | Review the resulting diff                       |
| Check types           | `bun run typecheck`             | Development dependencies and `.pi-host/`        |
| Run all tests         | `bun run test`                  | Development dependencies; Pi for CLI suites     |
| Run one file          | `bun run test test/rpc.test.ts` | Development dependencies                        |
| Check working files   | `bun run ci`                    | Host setup; format, lint, types, then tests     |
| Check committed files | `bun run ci:clean`              | Git and a commit; installs in a temporary clone |
| Audit dependencies    | `bun run audit`                 | Bun and network                                 |
| Install hooks         | `bun run prepare`               | Git and Husky                                   |

## Testing and validation

Tests live in `test/` as `<topic>.test.ts`.
Tooling tests live in `test/docs.test.ts`, `test/pi-bin.test.ts` and `test/setup-host.test.ts`.

| Area                              | Test files                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| Configuration                     | `config.test.ts`, `config.invalid.test.ts`, `registry-store.test.ts`                       |
| Run control and transport         | `runs.test.ts`, `runner.test.ts`, `rpc.test.ts`, `startup.gate.test.ts`                    |
| Persistence and results           | `store.test.ts`, `result.test.ts`, `notify.test.ts`, `persistence.test.ts`                 |
| Real Pi and permissions           | `child-contract.test.ts`, `child-launch.test.ts`, `permissions.test.ts`, `startup.test.ts` |
| Parent lifecycle and installation | `*.e2e.test.ts`, `cleanup.test.ts`, `supervisor.test.ts`                                   |
| Packaging and shipped defaults    | `defaults.test.ts`, `test/release.test.ts`, `test/docs.test.ts`, `context7.test.ts`        |

- Write a failing test before a fix. Confirm the failure tests the intended behaviour.
- After a check passes, break its safeguard in a disposable copy and confirm failure.
- Keep deliberate breaks outside committed files.
- Reuse fixtures before adding another harness. Tests use a fake model and a local MCP server.
- Real Pi tests use `OMPSS_PI_BIN`, then the pinned host CLI, then `pi` on PATH.
- Skip CLI-dependent suites when Pi is missing. Keep independent tests enabled.
- Run tests on macOS and Linux. Do not depend on one platform's process tree, paths or event timing.
- Use disposable directories and synthetic credentials. Leave real settings and run files untouched.
- Run `bun run ci` before finishing. Commit, then run `bun run ci:clean`.

## Dos and don'ts

- Enforce fresh `limits.maxConcurrentRuns` per parent session. Count starting, running and stopping direct children.
- Count the root as depth zero. Require exact `ompss` approval and honour inherited plus fresh depth ceilings.
- Preserve immediate-parent ownership for status and subtree cancellation. Unconfirmed cleanup blocks launches despite spare capacity.
- Wait at final-answer `turn_end` with its live abort signal; never block tool-use turns. Keep final `agent_settled` judgement.
- Map the real todo extension explicitly. Seed only child-local normal mode; never copy parent tasks or OpenSpec bindings.
- Use argument arrays with `shell: false` for child processes.
- Preserve approved tool names exactly. Listing a tool does not load its MCP server.
- Treat custom provider extensions as trusted executable code.
- Ship no mapping, persona, model or personal path. The operator keeps their mapping in `~/.pi/agent/om-pi-subagents.yaml`.
- Add settings and abstractions only for a stated requirement.
- Keep files below about 500 lines and split by responsibility.

## Code style

Use strict TypeScript, ES modules and local imports ending in `.ts`.
Oxfmt controls tab indentation, double quotes and a 120-character print width.
Write comments in British English. Explain why a constraint exists.
Oxlint runs with warnings denied. Explain any rule exception at its narrowest useful scope.
Review automatic fixes before accepting them.

## Error handling

Throw actionable errors at validation boundaries. Preserve the original error when wrapping it.
Observe launched promises and record failures. Pipe errors must reject requests without crashing the parent.
Keep partial output labelled. Cleanup that cannot be confirmed must fail the run and block another launch.
A bad registry must never silently reuse old settings.

## Security

Keep personas inside the registry directory after resolving symbolic links.
Validate session and run ids before using them in paths. Save directories with mode `0700` and files with `0600`.
Redact known authentication fields from logs. Tasks, personas and outputs can still contain sensitive text.
Never commit tokens, personal email addresses or machine-specific home paths.
Scan first-party files with Aikido when available. Trace findings before adding an inline suppression.
Keep findings and suppression evidence in ignored `docs/local-docs/`. Never commit local reports.

## Git workflow

Ask before creating repositories, installing dependencies or pushing. Do not create remotes without permission.
Use feature branches for later changes. Verify the repository and branch before commands that change state.
Use Conventional Commits and British English. Keep formatting changes in a separate `style:` commit.
Release Please reads commit messages. Use squash merges with a Conventional pull request title.
Never edit `version`, `CHANGELOG.md` or `.release-please-manifest.json` by hand.
Never run `npm publish`, `npm stage approve` or `npm stage reject`. Never create an npm token.
Pull the latest changes before a permitted push. The pre-push hook checks a fresh clone of committed HEAD.
Do not bypass the hook without approval. GitHub Actions must pass its check and audit jobs before merge.

## Documentation

Update `README.md` when setup, commands or supported behaviour change.
Record architecture decisions in `docs/adr/` and platform findings or workarounds in `docs/tdr/`.
Keep README example markers intact. `test/docs.e2e.test.ts` runs those examples through real Pi.
`test/docs.test.ts` checks tooling claims against the scripts, hook, workflow and package manifest.
Maintain the public guides in `docs/INSTALL.md`, `docs/USAGE.md` and `docs/UNINSTALL.md`.
Write short procedures in plain British English. Keep session records in ignored `docs/local-docs/`.
