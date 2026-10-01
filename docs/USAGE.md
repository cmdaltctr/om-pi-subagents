# How to use

OMPSS runs one mapped agent in a background Pi child process.
The parent receives the result when the child finishes.

## Commands

| Command                     | What it does                                                     |
| --------------------------- | ---------------------------------------------------------------- |
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
   ```

3. Run `/reload`.
4. Run `/ompss list`.
5. Start the agent with `/ompss run reader Summarise the README`.

The agent uses the parent's model unless the mapping selects another model.
The task cannot start with a slash, which Pi would treat as a command.

## Mapping fields

| Field        | Meaning                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| `version`    | Must be `1`.                                                             |
| `agents`     | Map agent names to settings. Use `{}` for no agents.                     |
| `persona`    | Markdown file inside the registry directory, without frontmatter.        |
| `tools`      | Exact allowed tool names. `[]` grants no tools. Wildcards are rejected.  |
| `model`      | Optional `provider/id`. The parent model is the default.                 |
| `thinking`   | Optional `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`.    |
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

The parent Pi interface shows a temporary status such as `ompss: reader running`.
That status clears when the run finishes. The final result arrives in the parent conversation.
Child tool calls are recorded in run files rather than streamed as parent tool calls.

OMPSS does not create Orca terminal tabs or separate agent panes.
When the status is no longer visible, run `/ompss status` to see the recorded result.
A live child-tool panel would require a separate UI feature.

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
