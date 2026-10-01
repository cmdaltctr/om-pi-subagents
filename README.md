# OMPSS: Opinionated Modular Pi Subagents System

OMPSS runs a subagent as a normal Pi child process. You decide the agent
names, the persona text, and the tools each agent may use. All of it lives in
one YAML file and plain Markdown files. OMPSS ships no agents of its own.

- The parent gets one tool, `ompss`, and one command, `/ompss`.
- Each run is one child Pi process in the background.
- One child can run at a time in each parent session.
- The result arrives as a follow-up message when the child finishes.

OMPSS does not use `pi-subagents`. It does not import it, copy it, or need it.

## Set up

1. Copy this directory to `~/.pi/agent/extensions/ompss/`.
2. In that directory, run `bun install --production`. This installs the one runtime
   dependency, `yaml`. Pi supplies its own packages.
3. Run `/reload` in Pi.
4. Run `/ompss list`. A new install answers `No personas mapped.`

Pi loads the extension because the directory has an `index.ts` file.

## Add your first agent

Each agent needs a Markdown persona and a YAML mapping. Both live in your Pi
agent directory, `~/.pi/agent/`, so package updates never touch them. Persona
paths are relative to the mapping file.

Persona file `~/.pi/agent/personas/reader.md`:

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
    persona: ./personas/reader.md
    tools: [read, grep, find, ls]
```

Then run `/reload` and `/ompss list`. The list now shows `reader`.

Start a run with `/ompss run reader Summarise the README`, or ask the parent
model to call the `ompss` tool.

### YAML fields

| Field        | Required | Meaning                                                         |
| ------------ | -------- | --------------------------------------------------------------- |
| `version`    | yes      | Must be `1`.                                                    |
| `agents`     | yes      | A mapping. Use `{}` for no agents.                              |
| `<name>`     | -        | The agent name. Use `[a-z][a-z0-9-]{0,63}`. No name is special. |
| `persona`    | yes      | Path to a Markdown file inside this directory. No frontmatter.  |
| `tools`      | yes      | Exact tool names. `[]` grants no tools. No wildcards.           |
| `model`      | no       | `provider/id`. The default is the parent's model.               |
| `thinking`   | no       | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`.   |
| `skills`     | no       | Paths to `SKILL.md` files. Paths may start with `~/`.           |
| `extensions` | no       | Paths to trusted extensions. See "Provider extensions".         |

OMPSS rejects unknown fields, duplicate names, aliases, and custom YAML tags.
A bad file stops every launch until you fix it. OMPSS never runs on old
settings after a failed load.

Edits take effect at the next launch. `/ompss list` reloads the file. A run
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

Before it sends the task, OMPSS checks that the child loaded its guard, that
every approved tool exists, that the model resolves, and that the working
directory is right. It then blocks, at the moment of the call, every tool that
is not on the list. This covers direct calls, tools found with `tool_search`,
and calls made through another tool. A blocked call fails the run.

This is a rule inside trusted Pi code. It is **not** an operating-system
sandbox.

- A tool name does not prove what the tool does. An MCP tool marked read-only
  gets no extra trust. Only the names you list are allowed.
- `bash`, `powershell`, `write`, and `edit` can change files. `/ompss list`
  marks an agent that has one of them as `write-capable`.
- An agent with a write-capable tool runs with your file permissions. Start it
  in a feature worktree or another directory that is safe to change.
- Two parent sessions can run two children at once. OMPSS does not limit the
  combined load on your model provider.

## Provider extensions

A child loads no extensions except its own guard and the Pi built-ins its
tools need. If an agent needs a custom provider, list the
extension that registers it:

```yaml
model: my-provider/my-model
extensions: [~/.pi/agent/extensions/my-provider/index.ts]
```

Only list code you trust. It runs in the child with your permissions.
If the model is not known to the child, the run fails before the task is sent.
OMPSS does not choose another model for you.

## Run files

OMPSS saves each run in `~/.pi/agent/ompss/runs/<session-id>/<run-id>/`. The
directory and the files are private to your user.

| File                         | Content                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `config.json`, `persona.md`  | The settings and persona the run started with, and the task.       |
| `status.json`                | State, timestamps, error, and the child process id.                |
| `events.jsonl`, `stderr.log` | Streamed evidence. Known credential fields are redacted.           |
| `output.md`                  | The final answer. After a failure it starts with `PARTIAL OUTPUT`. |
| `notification.json`          | Whether the result message reached the parent.                     |

Personas, tasks, and outputs can hold sensitive text. OMPSS never deletes run
directories. Remove old ones yourself.

## Run states

`starting`, `running`, `stopping`, `completed`, `failed`, `cancelled`.

A run is `completed` only when all of these are true: the child accepted the
task, it settled, the last assistant message is a normal answer, the output is
saved, the child exited cleanly, and cleanup is confirmed. Output that exists
after an error does not make a run pass.

- Start-up has 30 seconds. A whole run has 30 minutes.
- `/ompss cancel <run-id>` stops the child and everything it started.
- Reload, quit, or a new session stops active runs. No child outlives its
  parent.
- If OMPSS cannot confirm that all processes stopped, the run fails and the
  session cannot start another until you stop them by hand and reload.

## Not supported

These are outside this version:

- Calls to the old `subagent` tool, workflow scripts, and fleet commands.
- A child that starts another child.
- Councils, scheduling, remote workers, automatic worktrees, and provider
  fallback.
- Resuming a run after a restart.

Skills that promise these features need edits before you use them with OMPSS.

## Remove OMPSS

1. Stop active runs with `/ompss cancel <run-id>`, or quit Pi.
2. Move `~/.pi/agent/extensions/ompss/` out of the extensions directory.
3. Run `/reload`.

Run files stay in `~/.pi/agent/ompss/runs/` until you delete them.

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

| Purpose                               | Command                |
| ------------------------------------- | ---------------------- |
| Fetch pinned host packages and Pi CLI | `bun run setup:host`   |
| Format files                          | `bun run format`       |
| Check formatting                      | `bun run format:check` |
| Lint with warnings denied             | `bun run lint`         |
| Apply lint fixes for review           | `bun run lint:fix`     |
| Check types                           | `bun run typecheck`    |
| Run tests                             | `bun run test`         |
| Check dependency vulnerabilities      | `bun run audit`        |
| Format check, lint, types, then tests | `bun run ci`           |
| Check a fresh clone of committed HEAD | `bun run ci:clean`     |
| Install the Husky hooks               | `bun run prepare`      |

`bun run ci:clean` needs a git commit. It installs from the lockfile with
`HUSKY=0` in a temporary clone and runs `bun run ci`. Uncommitted changes are
excluded. Host packages already downloaded locally are reused.

The executable `.husky/pre-push` runs host setup followed by `bun run ci:clean`.
GitHub Actions runs the same checks and a separate audit job on pushes and
pull requests. Its actions use full commit SHA pins.

Tests start real Pi 0.99.1 children with a local fake model and local MCP server.
They use no live model or real credential. CLI-dependent suites skip when Pi is
missing; independent tests still run. Legacy parity tests skip when the old
operator-owned agent files are absent.

Tests use `OMPSS_PI_BIN` first, then `.pi-host/node_modules/.bin/pi`, then `pi`
on PATH. Set an explicit override only when testing another installation.
`OMPSS_REGISTRY` selects an alternative registry for tests.

Read [AGENTS.md](AGENTS.md) before changing the project.

## Documentation

- [How to install](docs/INSTALL.md)
- [How to use](docs/USAGE.md)
- [How to uninstall](docs/UNINSTALL.md)
