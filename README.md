# OMPS: Opinionated Modular Pi Subagents

<img src="docs/assets/om-pi-subagents-logo.svg" alt="OMPS logo" width="168">

OMPS runs a subagent as a normal Pi child process. You decide the agent
names, the persona text, and the tools each agent may use. All of it lives in
one YAML file and plain Markdown files. OMPS ships no agents of its own.

- The parent gets the `omps` tool, `/omps` commands and an operator-only `/omps-settings` menu.
- Each run is one child Pi process in the background.
- YAML limits set each parent's direct-child capacity and maximum nesting depth. Both default to one.
- YAML `ui` settings set visible rows, default 5, and the Alt+O fleet and Alt+I inspection shortcuts.
- The result arrives as a follow-up message when the child finishes.

OMPS does not use `pi-subagents`. It does not import it, copy it, or need it.

## What to read

| You want to                                                     | Read                                  |
| --------------------------------------------------------------- | ------------------------------------- |
| Install, update or pin a version                                | [How to install](docs/INSTALL.md)     |
| Create agents: the YAML file, persona files and where they live | [Set up agents](docs/SETUP.md)        |
| Run an agent, read progress and results                         | [How to use](docs/USAGE.md)           |
| Remove OMPS and the files you created                           | [How to uninstall](docs/UNINSTALL.md) |

A new install has no agents. Read [Set up agents](docs/SETUP.md) before you run anything.

## Set up

1. Install the package:

   ```sh
   pi install npm:om-pi-subagents
   ```

2. Run `/reload` in Pi.
3. Run `/omps list`. A new install answers `No personas mapped.`

Pi supplies its own packages. The one runtime dependency is `yaml`. To load a
local checkout instead, see [installation](docs/INSTALL.md).

## Add your first agent

Each agent needs a Markdown persona and a YAML mapping. Both live in your Pi
agent directory, `~/.pi/agent/`, so package updates never touch them. Persona
paths are relative to the mapping file.

You create both. The install makes neither the mapping file nor the persona
folder. Keep persona files in `~/.pi/agent/om-pi-subagents/personas/`. OMPS
reads only the files that your `persona:` lines name. For the full explanation,
see [Set up agents](docs/SETUP.md#persona-persona-folder-and-omps-the-difference).

Persona file `~/.pi/agent/om-pi-subagents/personas/reader.md`:

<!-- docs-test: persona -->

```markdown
You read files and answer questions about them.
Give short answers. Name the file for every claim.
```

Mapping file `~/.pi/agent/om-pi-subagents.yaml`:

<!-- docs-test: yaml -->

```yaml
version: 1
agents:
  reader:
    persona: ./om-pi-subagents/personas/reader.md
    tools: [read, grep, find, ls]
    thinking: off
```

Then run `/omps list`. The list now shows `reader`. No reload is needed.
For every field, persona tips and common errors, see [Set up agents](docs/SETUP.md).

Start a run with `/omps run reader Summarise the README`, or ask the parent
model to call the `omps` tool.

### Parallel and nested runs

Add `limits` beside your existing `agents` mapping. Preserve the agents you already defined.
This empty-mapping example shows four direct slots per parent and a maximum depth of three:

<!-- docs-test: limits -->

```yaml
version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
agents: {}
```

The root is depth zero. Depth three allows children, grandchildren and great-grandchildren.
A child can delegate only when its mapping approves the exact `omps` tool.
Each target keeps its own tools, so delegation can reach write-capable targets.

Limits have no additional fixed ceiling. Four slots through depth three can create
`4 + 16 + 64 = 84` descendants. Use separate safe worktrees for concurrent writers.
See [configured limits](docs/USAGE.md#configured-limits-and-nesting) for inherited ceilings and cancellation.

For operational guidance in Pi, run `/skill:om-pi-subagents`.
Approved children need an explicit skill path; see [setup](docs/SETUP.md#skills-and-extensions).

### Operator settings

Run `/omps-settings` in Pi, or through an RPC client that supports native dialogs.
`/subagents-settings` is an alias of the same menu. Select a setting, enter a value,
then confirm the shown value and save destination:

| Setting                             | Accepted values                                                 | Save destination                        |
| ----------------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| Maximum nesting depth               | Safe integers of at least 0; root depth 0                       | `limits.maxDepth` in the registry YAML  |
| Parallel direct children per parent | Safe integers of at least 1                                     | `limits.maxConcurrentRuns` in that YAML |
| Visible agents                      | Safe integers from 1 to 256; default 5                          | `ui.maxVisibleAgents` in that YAML      |
| Fleet list shortcut                 | A Pi key specification such as `alt+o`, or `off`; default Alt+O | `ui.toggleKey` in that YAML             |
| Inspection shortcut                 | A Pi key specification such as `alt+i`, or `off`; default Alt+I | `ui.inspectKey` in that YAML            |

`OMPS_REGISTRY` selects the registry when set. The menu shows its resolved path.
Execution limits and UI settings stay in that one YAML file. OMPS leaves todo preferences
and Pi's `settings.json` untouched. Shortcut values are lowercase Pi key specifications.
Ctrl+I and Tab are refused because legacy terminals send one byte for both, and a key already
bound to an effective built-in action is refused with guidance. Both shortcuts can be `off`.

Shortcuts bind when an interactive session starts. A saved shortcut needs `/reload` before it
becomes active; the menu shows the saved and the active binding until then. Visible-agent and
limit changes take effect without a reload, and the display repaints at once.

Older OMPS versions kept visible agents in `<config-dir>/pi-subagents/config.json`. That file
is now a read-only fallback: when YAML omits `ui.maxVisibleAgents`, its valid value still applies
and the menu labels its source. The menu offers a confirmed import that writes the value into
YAML. YAML wins once it declares the field. OMPS no longer writes the legacy file.

Cancelling an input or declining confirmation leaves that setting unchanged.
Earlier confirmed saves remain in effect. Creating a missing registry requires confirmation;
it starts with `agents: {}`. Malformed files must be corrected before saving.
Conflicting edits are rejected: reopen settings to load the newer values.

Saved limits apply to fresh launches. Existing runs continue, and an existing branch keeps its inherited depth ceiling.
Depth zero disables new launches. Raising per-parent capacity can multiply process and provider load.
See [operator settings](docs/USAGE.md#operator-settings) for the procedure and write-failure guidance.

Memory and Todo are off for new agent mappings. Existing explicit mappings stay in effect.
In `/omps-settings`, choose **Agent capabilities**, then an agent and Memory or Todo.
Select **Enable**, enter the installed package folder or its published Pi extension entry,
and confirm the exact `tools` and `extensions` changes. Memory can also map its shipped
skill. Approval for `memory` covers its whole tool, including write and portability modes.
**On (configured)** reports mapped resources, not backend health. **Partial** needs an
explicit correction; inspect the agent's lists before disabling an unrecognised wrapper.
**Disable** removes the recognised extension, mapped skill and tool for future launches.
No package is installed, no parent extension setting changes, and active children keep
what they started with. See [optional child capabilities](docs/USAGE.md#optional-child-capabilities).

### Compact fleet and inspection

One fleet strip below the editor reports every active direct run. It starts collapsed to a single
content row; Alt+O or `/omps fleet` expands it into a bounded root list with task labels, states, elapsed times and
tool names. The default budget is five root rows, so expansion uses at most seven content rows and
never more than one third of a small terminal:

```text
Agents: 5 active | 3 observed descendants | alt+o list | alt+i inspect
```

With the strip expanded and the editor empty, arrows select a root, Enter inspects it and Escape
collapses without stopping work. Every active root stays reachable; hidden runs continue normally.
When all work ends, the strip keeps one compact summary of the latest finished root.

Each launch leaves one compact acknowledgement row in the transcript. Pi's native expansion action,
`app.tools.expand` with Ctrl+O by default, reveals the acknowledgement text only. It never creates a
second live tree. The complete retained hierarchy lives in the inspection modal:

1. Run `/omps inspect` to select any retained node in this session.
2. Use arrows, then Enter, to read its saved task and output.
3. Press Escape to close the viewer while the run continues.

`/omps inspect <run-id>` opens a selected node directly. Fullscreen Pi also supports row clicks.
Regular mode uses the keyboard. Supported RPC clients receive bounded text without terminal components.
Only an immediate parent can use status or cancellation for a descendant.

Tasks and outputs can contain sensitive text. Reads are limited to 64 KiB per selected evidence file;
truncated output shows its saved location. See [inspection](docs/USAGE.md#agent-trees-and-inspection).

### YAML fields

| Field        | Required | Meaning                                                            |
| ------------ | -------- | ------------------------------------------------------------------ |
| `version`    | yes      | Must be `1`.                                                       |
| `limits`     | no       | `maxConcurrentRuns` and `maxDepth`; omitted fields default to one. |
| `agents`     | yes      | A mapping. Use `{}` for no agents.                                 |
| `<name>`     | -        | The agent name. Use `[a-z][a-z0-9-]{0,63}`. No name is special.    |
| `persona`    | yes      | Path to a Markdown file inside this directory. No frontmatter.     |
| `tools`      | yes      | Exact tool names. `[]` grants no tools. No wildcards.              |
| `model`      | no       | `provider/id`. The default is the parent's model.                  |
| `thinking`   | yes      | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.      |
| `skills`     | no       | Paths to `SKILL.md` files. Paths may start with `~/`.              |
| `extensions` | no       | Paths to trusted extensions. See "Provider extensions".            |

OMPS rejects unknown fields, duplicate keys, aliases, and custom YAML tags.
A bad file stops every launch until you fix it. OMPS never runs on old
settings after a failed load.

Every agent needs explicit `thinking`. Add a supported value to older mappings
before launching. OMPS uses that value even when the parent has a different
thinking level. An empty `agents: {}` registry remains valid.

Edits take effect at the next launch. `/omps list` reloads the file. A run
that already started keeps the settings it started with.

## Tools and MCP

Write each tool by its exact name. Native MCP tools are named
`mcp__<server>__<tool>`. The server name comes from your `mcp.json`.

```yaml
tools:
  - read
  - tool_search
  - mcp__context7-mcp__resolve-library-id
  - mcp__context7-mcp__query-docs
```

- Add `tool_search` if the agent must find deferred MCP tools.
- The old `mcp` proxy tool no longer exists. A persona that lists `mcp` fails
  before the task reaches a model, and the error names the native form.
- Listing a tool does not load it. The server must also be configured and
  connected in the child.

## The permission boundary

Before it sends the task, OMPS checks that the child loaded its guard, that
every approved tool exists, that the model resolves, and that the working
directory is right. It then blocks, at the moment of the call, every tool that
is not on the list. This covers direct calls, tools found with `tool_search`,
and calls made through another tool. A blocked call fails the run.

Only the parent may prompt a child. The guard refuses any other prompt, such as
one a trusted extension sends, before Pi starts a model run. A refused prompt
before readiness stops the launch. A refused prompt later fails the run.

This is a rule inside trusted Pi code. It is **not** an operating-system
sandbox.

- A tool name does not prove what the tool does. An MCP tool marked read-only
  gets no extra trust. Only the names you list are allowed.
- `bash`, `powershell`, `write`, and `edit` can change files. `/omps list`
  marks an agent that has one of them as `write-capable`.
- An agent with a write-capable tool runs with your file permissions. Start it
  in a feature worktree or another directory that is safe to change.
- Sessions have separate direct-child slots. OMPS sets no combined machine or provider budget.
- `/omps list` marks approved `omps` targets as `delegation-capable`, including their ability to select write-capable targets.

## Provider extensions

A child loads its guard, required Pi built-ins and explicitly mapped resources.
OMPS also loads managed delegation or todo setup when those tools are approved.
Ambient resources stay disabled. For a custom provider, list the extension that registers it:

```yaml
model: my-provider/my-model
extensions: [~/.pi/agent/extensions/my-provider/index.ts]
```

Only list code you trust. It runs in the child with your permissions.
If the model is not known to the child, the run fails before the task is sent.
OMPS does not choose another model for you.

## Reading progress

Run `/omps` without arguments to see current-session status. Whitespace-only
arguments also show status. A fresh session answers `No runs in this session.`
Use `/omps status <run-id>` for one run, or `/omps cancel <run-id>` to stop it.

The fleet strip appears below the editor. Collapsed, it is one content row with the active count
and observed descendants. Alt+O expands it into at most `ui.maxVisibleAgents` root rows plus a
summary and a navigation row. When all work ends, it retains one compact summary of the latest
finished root. Cancellation sends no automatic result message.

The strip excludes tool arguments, raw tool results, thinking, stderr and answer previews.
Terminal controls are removed from displayed text. The full saved answer and
result message stay on their existing paths. Clients without widget support
can use `/omps` or the status line. OMPS opens no extra Orca terminals.

## Run files

OMPS saves each run in `~/.pi/agent/omps/runs/<session-id>/<run-id>/`. The
directory and the files are private to your user.

| File                         | Content                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `config.json`, `persona.md`  | The settings and persona the run started with, and the task.                                  |
| `status.json`                | State, timestamps, error, child process id, depth, ownership and effective limits.            |
| `events.jsonl`, `stderr.log` | Streamed evidence. Known credential fields are redacted.                                      |
| `output.md`                  | The final answer. Partial text from a failed or cancelled run starts with `> PARTIAL OUTPUT`. |
| `notification.json`          | Whether the result message reached the parent.                                                |

Personas, tasks, and outputs can hold sensitive text. OMPS never deletes run
directories. Remove old ones yourself.

## Run states

`starting`, `running`, `stopping`, `completed`, `failed`, `cancelled`.

A run is `completed` only when all of these are true: the child accepted the
task, it settled, the last assistant message is a normal answer, the output is
saved, the child exited cleanly, and cleanup is confirmed. Output that exists
after an error does not make a run pass.

- Start-up has 30 seconds. A whole run has 30 minutes.
- `/omps cancel <run-id>` stops that owned subtree, including nested agents, without cancelling unrelated siblings.
- A delegating child waits for owned runs and result-delivery attempts before final settlement.
- `om-pi-todo` and OMMS are optional and off for new child mappings. Child tasks stay local and never update the parent's OpenSpec checkboxes.
- Reload, quit, or a new session stops active runs. No child outlives its
  parent.
- If OMPS cannot confirm that all processes stopped, the run fails and the
  session cannot start another until you stop them by hand and reload.

## Not supported

These are outside this version:

- Calls to the old `subagent` tool and workflow scripts.
- Councils, scheduling, remote workers, automatic worktrees, and provider
  fallback.
- Resuming a run after a restart.

Skills that promise these features need edits before you use them with OMPS.

## Remove OMPS

1. Stop active runs with `/omps cancel <run-id>`, or quit Pi.
2. Run `pi remove npm:om-pi-subagents`.
3. Run `/reload`.

Run files stay in `~/.pi/agent/omps/runs/` until you delete them. Your mapping
in `~/.pi/agent/om-pi-subagents.yaml` and your persona folder also stay. You
created them, so you remove them. For the steps, see
[How to uninstall](docs/UNINSTALL.md#remove-your-own-files-optional).

## Release (maintainers)

Releases go to npm as `om-pi-subagents`. [Release Please](https://github.com/googleapis/release-please) prepares each one. You never edit the version or the changelog by hand.

1. Write commits and pull request titles in the [Conventional Commits](https://www.conventionalcommits.org) style: `feat:`, `fix:`, `perf:`, `docs:`. Add `!` for a breaking change, for example `feat!:`.
2. Merge to `main`. Release Please opens or updates a pull request called "chore(main): release X.Y.Z". It bumps `version` in `package.json` and writes `CHANGELOG.md`.
3. Read that pull request. Check the version and the changelog text. Its CI checks run.
4. Merge it. Release Please tags the commit and creates a GitHub release.
5. The publish job runs the full gate on that exact commit, then **stages** the version on npm. It captures npm's stage UUID and adds the exact approval command to the GitHub release. The version is not installable yet.
6. As the human maintainer, run `bun run release:approve` from the repository with two-factor authentication.

   The helper reads the captured UUID from the release note. If capture failed, the note gives manual-list guidance:

   ```sh
   npm stage list om-pi-subagents
   bun run release:approve <stage-uuid>
   ```

   Select the UUID for that version. You can instead run the note's exact `npm stage approve` command,
   or use the Staged tab at https://www.npmjs.com/package/om-pi-subagents. Reject with `npm stage reject <stage-id>`.

### Human-run approval helper

Run `bun run release:approve` from this repository checkout. In Pi, the human can use `! bun run release:approve`.
The `!` prefix runs a shell command; it is not part of the package script. Agents and CI must never run real approval.

Prerequisites: Bun, GitHub CLI (`gh`) with repository access, npm 11.15 or newer, and an npm account with approval rights.
Check `gh auth status` and `npm whoami` before starting. npm owns login and the two-factor authentication prompt.
The helper is repository tooling and is excluded from the installed npm package.

1. Run `bun run release:approve` to discover the stage UUID from the newest GitHub release note.
2. If discovery fails, run `npm stage list om-pi-subagents` and select the matching pending version.
3. Retry with `bun run release:approve <stage-uuid>`.
4. After confirmed registry visibility, run the printed `pi update npm:om-pi-subagents` command when ready.
5. Restart Pi or run `/reload` after updating.

The helper displays the stage before approval and polls npm with fresh reads, at most 30 attempts.
`OMPS_REPO` overrides the GitHub repository; `OMPS_RELEASE_POLL_SECONDS` changes the five-second polling interval.
Failed approval stops before polling and gives login guidance. After a visibility timeout, check npm status before retrying.
An already published version needs no further approval. The helper performs no Pi update or plugin/channel operation.

What each commit type does before version 1.0.0:

| Commit                                      | Version change                    |
| ------------------------------------------- | --------------------------------- |
| `fix:`, `perf:`                             | Patch, for example 0.1.0 to 0.1.1 |
| `feat:`                                     | Minor, for example 0.1.0 to 0.2.0 |
| `feat!:` or a `BREAKING CHANGE:` footer     | Minor. After 1.0.0 it is major.   |
| `docs:`, `style:`, `test:`, `chore:`, `ci:` | No release                        |

### One-time setup

No npm token is used. npm trusts the release workflow through OIDC.

1. Publish the first version by hand, then tag it and create its GitHub release, so Release Please counts from it.
2. Create the release GitHub App with the manifest helper. It saves `RELEASE_APP_ID` and `RELEASE_APP_PRIVATE_KEY` as repository secrets. No key file is created.
3. Create the `npm-publish` environment, limited to the `main` branch.
4. Add the trusted publisher:

   ```sh
   npm trust github om-pi-subagents --file release.yml --repo cmdaltctr/om-pi-subagents --env npm-publish --allow-stage-publish
   ```

5. Switch the workflow on: `gh variable set RELEASE_PLEASE_ENABLED --body true`.

## Development tooling

Use Bun 1.4.2 and Node.js 22.12 or newer. Run these commands from the repository root:

```sh
bun install
bun run setup:host
bun run ci
```

Oxlint checks code with warnings denied. Oxfmt formats files with tabs and a
120-character print width. Husky installs the pre-push hook through `prepare`.

Host setup uses Bun to fetch Pi 0.99.1 and typebox 1.3.27 into `.pi-host/`.
It includes `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`,
`@earendil-works/pi-tui` and `typebox`. Host packages remain outside this
project's `node_modules`. `bunfig.toml` sets `peer = false` to keep them there.
The extension declares its directly used host packages as peers.
Vite is a direct development dependency because Vitest needs it while automatic
peer installation is disabled.
`@fission-ai/openspec` 1.14.0 is a pinned development dependency for the real
`om-pi-todo` OpenSpec compatibility tests. `bun install` supplies its CLI locally;
production installs do not require it.

> [!CAUTION]
> **Known high-severity vulnerability in a development dependency**
> OpenSpec 1.14.0 brings in `braces@3.0.3` through `fast-glob` and `micromatch`.
> [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) allows deeply nested brace patterns to crash the OpenSpec CLI.
> No patched release exists as of 5 October 2026. Use only trusted schema patterns and repositories.
> The maintainer accepts this risk for personal development and compatibility tests.
> `bun run audit` checks production dependencies without exceptions, then checks all dependencies with this advisory excluded.
> Other advisories still fail the audit. Run `bun audit` to see the accepted finding.
> Remove the exception when a patched dependency becomes available.

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

`bun run ci:clean` needs a git commit. It installs from the lockfile with
`HUSKY=0` in a temporary clone and runs `bun run ci`. Uncommitted changes are
excluded. Host packages already downloaded locally are reused.
The clone sets `OMPS_PI_BIN` to the pinned host CLI, matching GitHub Actions.

The executable `.husky/pre-push` runs host setup followed by `bun run ci:clean`.
GitHub Actions runs the same checks and a separate audit job on pushes and
pull requests. Its actions use full commit SHA pins.

Tests start real Pi 0.99.1 children with a local fake model and local MCP server.
They use no live model or real credential. CLI-dependent suites skip when Pi is
missing; independent tests still run.

Tests use `OMPS_PI_BIN` first, then `.pi-host/node_modules/.bin/pi`, then `pi`
on PATH. Set an explicit override only when testing another installation.
`OMPS_REGISTRY` selects another mapping file, for tests or for a second setup.

Read [AGENTS.md](AGENTS.md) before changing the project.

## Documentation

- [How to install](docs/INSTALL.md)
- [Set up agents](docs/SETUP.md)
- [How to use](docs/USAGE.md)
- [How to uninstall](docs/UNINSTALL.md)
- [Architecture decisions](docs/adr/ADR_README.md)
- [Technical decisions](docs/tdr/TDR_README.md)
