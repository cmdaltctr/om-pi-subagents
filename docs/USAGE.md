# How to use OMPSS

OMPSS lets Pi hand a task to a specialist agent that you defined. The agent runs in the background as a separate Pi process. It can use only the tools you allowed for it. When it finishes, its answer comes back into your Pi conversation as a message. You can keep working while it runs.

## Contents

- [Before you start](#before-you-start)
- [Quick start](#quick-start)
- [Two ways to start a run](#two-ways-to-start-a-run)
- [While a run works](#while-a-run-works)
- [Getting the result](#getting-the-result)
- [Run states](#run-states)
- [Cancelling, quitting and reloading](#cancelling-quitting-and-reloading)
- [Rules and limits](#rules-and-limits)
- [Run files](#run-files)
- [Troubleshooting](#troubleshooting)

## Before you start

1. Install OMPSS. See [Install](INSTALL.md).
2. Map at least one agent in `~/.pi/agent/om-pi-subagents.yaml`. See [Set up agents](SETUP.md).

The examples below use an agent called `reader` that may only read files.

## Quick start

1. Type `/ompss list` in Pi. OMPSS shows each mapped agent and its allowed tools:

   ```text
   reader: tools [read, grep, find, ls]
   ```

2. Start a run:

   ```text
   /ompss run reader Summarise the README
   ```

3. Read the confirmation. It gives the run id and the folder for the run files:

   ```text
   Started run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c (reader) in the background.
   Files: ~/.pi/agent/ompss/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
   Check it with "ompss status 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c". The result arrives as a follow-up message.
   ```

4. Watch the panel above the editor. It shows the run state and the tools the agent uses now.
5. Read the result message when it arrives in the conversation.

Pi shows full paths in its output. This guide writes `~` for your home folder.

## Two ways to start a run

You can type a slash command. You can also ask Pi in plain words, for example "Ask the reader agent to summarise the README". Pi's model then calls the `ompss` tool for you. Both ways do the same work and give the same messages.

### Slash commands

| Command                     | What it does                                                         | Example                                        |
| --------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| `/ompss list`               | Reads the mapping file again and lists agents and their tools.       | `/ompss list`                                  |
| `/ompss run <agent> <task>` | Starts one background run in Pi's current working folder.            | `/ompss run reader Summarise the README`       |
| `/ompss` or `/ompss status` | Shows all runs of this session. Starts nothing and reads no mapping. | `/ompss`                                       |
| `/ompss status <run-id>`    | Shows one run, its folder and any error.                             | `/ompss status 3f2c9b1e-8a4d-...-1d5e6f7a8b9c` |
| `/ompss cancel <run-id>`    | Stops that run and every process it started.                         | `/ompss cancel 3f2c9b1e-8a4d-...-1d5e6f7a8b9c` |

`/ompss list` marks an agent as `write-capable` when it may use `bash`, `powershell`, `write` or `edit`. An agent with its own model shows it too:

```text
fixer: tools [read, edit, bash]; model my-provider/my-model; write-capable
```

The task is everything after the agent name. It can be long. A command that OMPSS does not recognise shows this hint:

```text
Usage: /ompss list | run <agent> <task> | status [run-id] | cancel <run-id>
```

### The `ompss` tool

Pi's model uses the `ompss` tool. You can also give these examples to another agent that drives Pi. The tool takes these parameters:

| Parameter | Used by            | Meaning                                                                         |
| --------- | ------------------ | ------------------------------------------------------------------------------- |
| `action`  | all                | One of `list`, `run`, `status`, `cancel`.                                       |
| `agent`   | `run`              | The mapped agent name.                                                          |
| `task`    | `run`              | What the agent must do.                                                         |
| `cwd`     | `run` (optional)   | Absolute path of the working folder. Pi's current folder is the default.        |
| `runId`   | `status`, `cancel` | The run id. Optional for `status`: without it, the tool lists all session runs. |

List the mapped agents:

```json
{ "action": "list" }
```

Start the `reader` agent in another folder. Leave out `cwd` to use Pi's current folder:

```json
{ "action": "run", "agent": "reader", "task": "Summarise the README", "cwd": "/path/to/project" }
```

Check one run:

```json
{ "action": "status", "runId": "3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c" }
```

Cancel one run:

```json
{ "action": "cancel", "runId": "3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c" }
```

Only the tool can set a different working folder. The slash command always uses Pi's current folder.

The `run` action returns at once. It does not wait for the agent to answer.

## While a run works

### The panel

A panel appears above the editor. For example:

```text
OMPSS: reader running
Tools: read, grep
```

| Line                     | Meaning                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `OMPSS: <agent> <state>` | The agent name and the run state. See [Run states](#run-states).                             |
| `Tools: ...`             | Tools the agent uses at this moment. It shows up to four names, then a count such as `(+2)`. |
| `Answer: ...`            | After a completed run: the first 240 characters of the saved answer.                         |
| `Partial output: ...`    | After a failed run: the first 240 characters of what the agent wrote before it failed.       |

A fast tool can show while the state is still `starting`. This is normal. Tool calls made while the child process starts up do not show.

The panel shows only tool names and the short preview. It never shows tool arguments, tool results, the agent's thinking or error logs. OMPSS removes terminal control characters from the text.

The panel keeps the final state until you start another run or the session ends.

### The status line

The status line shows a short entry, for example `ompss: reader running`. The entry goes away when the run ends.

### Checking with a command

Some Pi clients do not show the panel. Use `/ompss` or `/ompss status` instead. A summary looks like this:

```text
run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c: running
  agent reader, directory /path/to/project
  files ~/.pi/agent/ompss/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
```

A session with no runs answers `No runs in this session.`

OMPSS opens no extra terminal tabs or panes, also in Orca. The agent has no terminal of its own. Pi talks to it through pipes in RPC mode (a machine-readable message format).

## Getting the result

When a run completes or fails, OMPSS sends one message into the conversation:

```text
OMPSS run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c (reader) completed.
Files: ~/.pi/agent/ompss/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
Result:
The README explains how to install OMPSS and map agents...
```

- A failed run adds an `Error:` line. If the agent wrote any text, the result starts with a `PARTIAL OUTPUT` note.
- When no output was saved, the message says `No output was saved.`
- The message starts a new turn, so Pi's model reads the result and can act on it.
- If Pi is busy with a reply, the message waits until that reply ends.
- The message holds at most 4000 characters of the result. A longer result ends with `[truncated; full text in .../output.md]`. Open `output.md` in the run folder for the full text.
- A cancelled run sends no message.
- If the session ended before the message was sent, nothing is sent. `notification.json` in the run folder records the failure.

## Run states

| State       | What it means                                                                                             | What to do                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `starting`  | OMPSS starts the agent process. It checks the guard, the tools, the model and the working folder first.   | Wait. Start-up has 30 seconds.                                                            |
| `running`   | The agent accepted the task and works on it.                                                              | Wait, or cancel it.                                                                       |
| `stopping`  | The run has an outcome. OMPSS stops the agent process and everything it started.                          | Wait.                                                                                     |
| `completed` | The answer is saved, the agent process exited cleanly and OMPSS confirmed that all its processes stopped. | Read the result message or `output.md`.                                                   |
| `failed`    | Something went wrong. Output that exists after an error does not make a run pass.                         | Run `/ompss status <run-id>` and read the error. See [Troubleshooting](#troubleshooting). |
| `cancelled` | You cancelled the run, or Pi quit, reloaded or changed session.                                           | Nothing. If the agent wrote any text, it is in `output.md`, labelled partial.             |

## Cancelling, quitting and reloading

1. Find the run id with `/ompss`.
2. Type `/ompss cancel <run-id>`.

OMPSS answers `Run <run-id> is stopping.` It then stops the agent process and every process it started. If the run already ended, OMPSS answers `Run <run-id> is already <state>.`

When you quit Pi, reload with `/reload`, or switch to another session, OMPSS cancels the active run. It waits until the processes stop. No agent outlives the Pi session that started it. These runs send no result message.

`/ompss status` lists only runs from the current session since OMPSS last loaded. After a reload, a restart or a session switch, older runs no longer show. Their files stay in the run folder. OMPSS cannot resume a run after a restart.

## Rules and limits

### One run per session

Each Pi session can have one active run. A second launch fails with:

```text
another run is active in this session: <run-id>. Wait for it, or cancel it with "ompss cancel <run-id>".
```

Two separate Pi sessions can each run one agent at the same time. OMPSS does not limit the total load on your model provider.

### Blocked after a failed cleanup

Sometimes OMPSS cannot confirm that all processes of a run stopped. The run then fails, and the session refuses new runs with:

```text
no new run can start: run <run-id> may have left processes behind (<cause>). Stop them by hand, then reload Pi.
```

To recover:

1. Open `status.json` in the run folder.
2. Read the `pid` value. This is the agent's process id. It is also the id of its process group.
3. List the processes in that group with `pgrep -g <pid>`.
4. Stop the group with `kill -- -<pid>`.
5. Check with `ps` for other processes the agent started, and stop them.
6. Type `/reload` in Pi.

### The task

- A task is required.
- A task cannot start with `/`. Pi would run it as a slash command. Reword the task.

### Working folder

- The slash command uses Pi's current working folder.
- The tool's `cwd` must be an absolute path to a folder that exists.

### Tools

The agent can use only the exact tool names in its mapping. OMPSS checks every tool call when it runs. A call to any other tool is blocked and the run fails at once.

This check is a rule inside Pi. It is not an operating-system sandbox. An agent with `bash`, `powershell`, `write` or `edit` can change files with your permissions. Start such an agent in a folder that is safe to change, for example a separate git worktree. Provider extensions that you list in the mapping also run with your permissions.

### Model and thinking

The agent uses Pi's current model, unless its mapping names another model. It always uses the `thinking` level from its mapping, not Pi's level. OMPSS does not switch to another model when the first one fails.

### Mapping changes

Each launch reads the mapping file again. An edit takes effect at the next launch. A run that already started keeps its original settings. If the mapping file has an error, OMPSS refuses new launches until you fix it. See [Set up agents](SETUP.md).

### Time limits

| Limit                          | Value      |
| ------------------------------ | ---------- |
| Start-up, before the task goes | 30 seconds |
| Whole run, start-up included   | 30 minutes |

A run that passes a limit fails.

### Not supported

An agent cannot start another agent. OMPSS has no councils, scheduling or provider fallback.

## Run files

OMPSS saves each run in its own folder:

```text
~/.pi/agent/ompss/runs/<session-id>/<run-id>/
```

If you set `PI_CODING_AGENT_DIR`, the folder is `$PI_CODING_AGENT_DIR/ompss/runs/` instead. The confirmation message and `/ompss status` show the exact path.

| File                | What it holds                                                                           | Use it to                          |
| ------------------- | --------------------------------------------------------------------------------------- | ---------------------------------- |
| `config.json`       | The agent settings, the task, the working folder and the start time.                    | Check what the run started with.   |
| `persona.md`        | The persona text the run started with.                                                  | Check the agent's instructions.    |
| `status.json`       | State, timestamps, error, the agent's process id (`pid`) and the model it used.         | Find the state, error or process.  |
| `events.jsonl`      | Every message from the agent process, one JSON object for each line.                    | See each step and tool call.       |
| `stderr.log`        | Error output from the agent process.                                                    | Find start-up and provider errors. |
| `output.md`         | The full final answer. After a failed or cancelled run it starts with `PARTIAL OUTPUT`. | Read the complete answer.          |
| `notification.json` | Whether the result message reached Pi, and the reason if not.                           | Find out why no message came.      |

A run that never got output has no `output.md`. A cancelled run has no `notification.json`.

Only your user can read these files. The folders have mode `0700` and the files `0600`. OMPSS removes known credential fields from `events.jsonl` and `stderr.log`. Tasks, personas and answers can still hold sensitive text. OMPSS never deletes run folders, also not when you [uninstall](UNINSTALL.md) it. Delete old ones yourself.

## Troubleshooting

| You see                                                            | Cause                                                                                   | Fix                                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/ompss` is not a known command                                    | OMPSS did not load.                                                                     | See [Install](INSTALL.md).                                                      |
| `No personas mapped.`                                              | The mapping file has no agents, or does not exist.                                      | Map an agent. See [Set up agents](SETUP.md).                                    |
| An `OMPSS:` error about the mapping file                           | The mapping file has an error. New launches stay blocked.                               | Fix the field the error names. See [Set up agents](SETUP.md).                   |
| `unknown agent "<name>"; mapped agents: ...`                       | The agent name is wrong.                                                                | Use a name from `/ompss list`.                                                  |
| `Usage: /ompss list \| run <agent> <task> \| ...`                  | OMPSS did not recognise the command, for example a run with no task.                    | Check the command against the [table](#slash-commands).                         |
| `task is required`                                                 | The tool call had no task.                                                              | Add a task.                                                                     |
| `the task cannot start with a slash, ...`                          | The task starts with `/`.                                                               | Reword the task.                                                                |
| `cwd must be an absolute path: ...`                                | The tool's `cwd` is a relative path.                                                    | Give the full path.                                                             |
| `cwd does not exist or is not a directory: ...`                    | The folder is missing.                                                                  | Check the path.                                                                 |
| `another run is active in this session: ...`                       | One run per session.                                                                    | Wait, or cancel the active run.                                                 |
| `no new run can start: run ... may have left processes behind`     | OMPSS could not confirm that a run's processes stopped.                                 | Follow [Blocked after a failed cleanup](#blocked-after-a-failed-cleanup).       |
| `unknown run: <run-id>`                                            | The id is wrong, or the run belongs to another session or an earlier load.              | Use an id from `/ompss`. For an older run, read its run folder.                 |
| `child is not ready: tool "<name>" is not registered`              | The tool name is wrong, or its MCP server is not set up in Pi.                          | Check the exact tool name and the MCP server. See [Set up agents](SETUP.md).    |
| `tool "mcp" does not exist; the obsolete MCP proxy was removed...` | The mapping lists the old `mcp` tool.                                                   | Use native names such as `mcp__<server>__<tool>`.                               |
| `child is not ready: model ... is not in the model registry`       | The agent process does not know the model.                                              | Check the model name. For a custom provider, list its extension in the mapping. |
| `child is not ready: model ... has no configured authentication`   | No credentials for that provider.                                                       | Set up credentials for that provider in Pi.                                     |
| `child is not ready: no model is selected`                         | Pi has no model and the mapping names none.                                             | Select a model in Pi, or set `model` in the mapping.                            |
| `child was not ready within 32000 ms`                              | Start-up took too long, for example a slow MCP server.                                  | Read `stderr.log`. Try again.                                                   |
| `permission violation: <tool> is not approved`                     | The agent tried a tool that is not in its list.                                         | Add the tool to the mapping if you trust it, or change the persona or task.     |
| `provider error: ...` or `provider failed after retries: ...`      | The model provider refused or failed, for example no credentials or no account balance. | Check your provider account and network.                                        |
| `the response was cut off (stop reason length)`                    | The answer was too long for the model.                                                  | Ask for a shorter answer, or split the task.                                    |
| `run exceeded the total deadline of 1800000 ms`                    | The run took more than 30 minutes.                                                      | Split the task into smaller runs.                                               |
| `result message not delivered: the owning session has ended`       | The session ended before the run finished.                                              | Read `output.md` in the run folder.                                             |
| No panel shows                                                     | Your Pi client does not show widgets.                                                   | Use `/ompss` or the status line.                                                |

Slash command errors start with `OMPSS:`. Tool errors go to Pi's model without that prefix.

For any failed run:

1. Type `/ompss status <run-id>`.
2. Read the error line.
3. Open `stderr.log` and `events.jsonl` in the run folder for more detail.
4. Fix the cause before you start another run.
