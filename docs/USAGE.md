# How to use

OMPSS runs one mapped agent in a background Pi child process.
The parent receives the result when the child finishes.

## Commands

| Command                     | What it does                                                     |
| --------------------------- | ---------------------------------------------------------------- |
| `/ompss`                    | Show current-session status without launching a child.           |
| `/ompss list`               | Reload and list mapped agents, tools and write-capable warnings. |
| `/ompss run <agent> <task>` | Start one background run in the parent's working directory.      |
| `/ompss status`             | Show runs belonging to the current parent session.               |
| `/ompss status <run-id>`    | Show the selected run and its file directory.                    |
| `/ompss cancel <run-id>`    | Stop that run and its child processes.                           |

One child can run at a time per parent session. Separate parent sessions can each run a child.

## Add your first agent

1. Create `~/.pi/agent/personas/reader.md`:

   ```markdown
   You read files and answer questions about them.
   Give short answers. Name the file for every claim.
   ```

2. Create `~/.pi/agent/om-pi-subagents.yaml` with this mapping:

   ```yaml
   version: 1
   agents:
     reader:
       persona: ./personas/reader.md
       tools: [read, grep, find, ls]
       thinking: off
   ```

3. Run `/reload`.
4. Run `/ompss list`.
5. Start the agent with `/ompss run reader Summarise the README`.

The agent uses the parent's model unless the mapping selects another model.
Every mapped agent needs explicit `thinking`; it never inherits the parent's thinking level.
Add a supported value to older mappings before launching. An empty `agents: {}` remains valid.
The task cannot start with a slash, which Pi would treat as a command.

## Mapping fields

| Field        | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `version`    | Must be `1`.                                                             |
| `agents`     | Map agent names to settings. Use `{}` for no agents.                     |
| `persona`    | Markdown file inside the registry directory, without frontmatter.        |
| `tools`      | Exact allowed tool names. `[]` grants no tools. Wildcards are rejected.  |
| `model`      | Optional `provider/id`. The parent model is the default.                 |
| `thinking`   | Required `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`.    |
| `skills`     | Optional paths to `SKILL.md` files. Home-relative paths start with `~/`. |
| `extensions` | Optional paths to trusted provider extensions.                           |

Unknown fields, duplicate YAML keys, aliases and custom tags are rejected.
A failed configuration read blocks new launches. An active run keeps its original settings.

Native MCP tools use names such as `mcp__context7-mcp__query-docs`.
Add `tool_search` when the child needs to discover deferred tools.
The MCP server must also be configured in Pi; listing its tools does not connect it.

## Reading progress in Pi and Orca

OMPSS launches children in RPC mode, which sends machine-readable messages through pipes.
Those children have no interactive terminal of their own.

The parent panel appears above the editor and shows the agent, run state and active tool names.
It tracks concurrent and nested calls by identifier. Startup tool activity stays outside this display.
A fast tool can appear while the run still shows `starting`. It stays listed after the run shows `running`.
The status line still shows a temporary entry such as `ompss: reader running`.

The panel retains the final state until another run starts or the session ends.
Completed and failed runs can show up to 240 characters of saved output.
Failed output is labelled partial. Cancellation sends no automatic result message.
The full result arrives separately in the parent conversation, with its own delivery record.
If the session ends first, the result is not sent and the delivery record shows the failure.

Displayed text excludes tool arguments, raw results, thinking and stderr. Terminal controls are removed.
Child tool calls remain in the private run files; they do not become parent tool calls.
OMPSS does not create Orca terminal tabs or separate agent panes.

Use bare `/ompss` or `/ompss status` when a client does not show widgets.
Whitespace-only arguments also show status. A fresh session reports `No runs in this session.`
These status requests read no registry and start no child.

## Run states and files

States are `starting`, `running`, `stopping`, `completed`, `failed` and `cancelled`.
Completion requires saved output, a clean child exit and confirmed process cleanup.
A failed result notification is recorded separately from the run's outcome.

Run files live in `~/.pi/agent/ompss/runs/<session-id>/<run-id>/`.

| File                         | Content                                                   |
| ---------------------------- | --------------------------------------------------------- |
| `config.json`, `persona.md`  | Original launch settings, task and persona.               |
| `status.json`                | State, timestamps, error and child process id.            |
| `events.jsonl`, `stderr.log` | Event and error evidence with known credentials redacted. |
| `output.md`                  | Answer, labelled `PARTIAL OUTPUT` after a failed run.     |
| `notification.json`          | Whether the result reached the parent.                    |

These files are private to your user. Tasks, personas and answers can contain sensitive text.
OMPSS keeps them after [uninstallation](UNINSTALL.md).

## Permission limits

The guard checks exact tool names when tools run. It is not an operating-system sandbox.
Agents with `bash`, `powershell`, `write` or `edit` can change files with your permissions.
Start those agents in a checkout that is safe to change.
Trusted extensions can run code with the same permissions.

## When a run fails

1. Run `/ompss status <run-id>`.
2. Read the reported error and its run files.
3. Correct the configuration, provider access or process-cleanup problem before starting another run.

For an unknown tool, check the exact tool name and MCP server configuration.
If the child cannot resolve its model, check the mapped provider extension.
A provider can refuse a run when credentials or account balance are missing.

If cleanup cannot be confirmed, stop the remaining processes before reloading Pi.
The session blocks another launch while that problem remains.

## Tool examples for agents

The parent uses the `ompss` tool with these actions:

```json
{ "action": "list" }
```

```json
{ "action": "run", "agent": "reader", "task": "Summarise the README" }
```

```json
{ "action": "status" }
```

```json
{ "action": "cancel", "runId": "replace-with-the-run-id" }
```

For a different working directory, pass an absolute `cwd` to the run action.
OMPSS supports no recursive delegation, councils, scheduling or provider fallback.
