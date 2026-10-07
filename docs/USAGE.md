# How to use OMPS

OMPS lets Pi hand a task to a specialist agent that you defined. The agent runs in the background as a separate Pi process. It can use only the tools you allowed for it. When it finishes, its answer comes back into your Pi conversation as a message. You can keep working while it runs.

## Contents

- [Before you start](#before-you-start)
- [Quick start](#quick-start)
- [Two ways to start a run](#two-ways-to-start-a-run)
- [While a run works](#while-a-run-works)
- [Agent trees and inspection](#agent-trees-and-inspection)
- [Getting the result](#getting-the-result)
- [Run states](#run-states)
- [Cancelling, quitting and reloading](#cancelling-quitting-and-reloading)
- [Rules and limits](#rules-and-limits)
- [Operator settings](#operator-settings)
- [Run files](#run-files)
- [Troubleshooting](#troubleshooting)

For an older OMPSS installation, follow [manual migration and rollback](INSTALL.md#migrate-from-ompss-to-omps).
Saved evidence can retain old path strings. Moving it never resumes tasks or restores former session ownership.

## Before you start

1. Install OMPS. See [Install](INSTALL.md).
2. Map at least one agent in `~/.pi/agent/om-pi-subagents.yaml`. See [Set up agents](SETUP.md).

The examples below use an agent called `reader` that may only read files.

## Quick start

1. Type `/omps list` in Pi. OMPS shows each mapped agent and its allowed tools:

   ```text
   reader: tools [read, grep, find, ls]
   ```

2. Start a run:

   ```text
   /omps run reader Summarise the README
   ```

3. Read the confirmation. It gives the run id and the folder for the run files:

   ```text
   Started run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c (reader) in the background.
   Files: ~/.pi/agent/omps/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
   Check it with "omps status 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c". The result arrives as a follow-up message.
   ```

4. Watch the fleet strip below the editor. It shows the agent tree while runs are active.
5. Read the result message when it arrives in the conversation.

Pi shows full paths in its output. This guide writes `~` for your home folder.

## Two ways to start a run

You can type a slash command. You can also ask Pi in plain words, for example "Ask the reader agent to summarise the README". Pi's model then calls the `omps` tool for you. Both ways do the same work and give the same messages.

### Slash commands

| Command                    | What it does                                                         | Example                                       |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| `/omps list`               | Reads the mapping file again and lists agents and their tools.       | `/omps list`                                  |
| `/omps run <agent> <task>` | Starts one background run in Pi's current working folder.            | `/omps run reader Summarise the README`       |
| `/omps` or `/omps status`  | Shows all runs of this session. Starts nothing and reads no mapping. | `/omps`                                       |
| `/omps status <run-id>`    | Shows one run, its folder and any error.                             | `/omps status 3f2c9b1e-8a4d-...-1d5e6f7a8b9c` |
| `/omps cancel <run-id>`    | Stops that run and every process it started.                         | `/omps cancel 3f2c9b1e-8a4d-...-1d5e6f7a8b9c` |
| `/omps inspect [run-id]`   | Views retained nodes in this session without changing a run.         | `/omps inspect`                               |
| `/omps fleet`              | Toggles or reports the session fleet without starting work.          | `/omps fleet`                                 |

`/omps list` marks an agent as `write-capable` when it may use `bash`, `powershell`, `write` or `edit`. An agent with its own model shows it too:

```text
fixer: tools [read, edit, bash]; model my-provider/my-model; write-capable
```

The task is everything after the agent name. It can be long. A command that OMPS does not recognise shows this hint:

```text
Usage: /omps list | run <agent> <task> | status [run-id] | cancel <run-id> | inspect [run-id] | fleet
```

### The `omps` tool

Pi's model uses the `omps` tool. You can also give these examples to another agent that drives Pi. The tool takes these parameters:

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

### The fleet strip

One strip below the editor shows every active direct run. By default it shows the agent tree, with no key press. Each row shows the task label, run state, elapsed time, tools in use and observed descendant count:

```text
Agents: 3 active | 3 observed descendants
  reader Map the API running 12s reading
  builder Update validation running 18s editing | 3 descendants
  reviewer Review changes starting 1s
↓ select
```

| Part                     | Meaning                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `Agents: N active`       | Direct runs starting, running or stopping. See [Run states](#run-states).             |
| `M observed descendants` | Retained nested runs across roots. `(incomplete)` marks missing observation evidence. |
| `↓ select`               | Press Down in an empty prompt to select an agent.                                     |

The tree uses at most `ui.maxVisibleAgents` root rows plus one summary and one navigation row: seven content rows with the default of five. A small terminal lowers the budget to one third of its height; if the rows cannot fit, the strip shows one summary row and inspection still reaches every run.

To navigate the fleet:

1. Make sure the prompt is empty.
2. Press Down. The first agent is selected and the hint changes to `↑↓ move | Enter inspect | Esc back`.
3. Press Up or Down to move to another agent.
4. Press Enter to inspect the selected agent.
5. Press Escape to return to the prompt. The runs continue.

Outside the list, Up recalls prompt history and Escape interrupts as usual. Typing ends the selection and returns input to the editor. A dialog or overlay that owns focus keeps its keys.

Set `ui.fleetView` in `/omps-settings` to change the starting view:

| Value       | Effect                                                                           |
| ----------- | -------------------------------------------------------------------------------- |
| `expanded`  | Default. Shows the agent tree.                                                   |
| `collapsed` | Shows one summary row, for example `Agents: 5 active \| 3 observed descendants`. |
| `off`       | Shows no strip. `/omps`, `/omps status` and `/omps inspect` still work.          |

`/omps fleet` switches between the tree and one row for the current session. A bound fleet shortcut does the same. Shortcuts are `off` by default; see [operator settings](#operator-settings).

The strip shows task labels, states, times and tool names only. It never shows tool arguments, tool results, the agent's thinking, error logs or answer previews. OMPS removes terminal control characters from the text. Saved answers appear in inspection and in the result message, never in the strip.

Each observed run also carries two bounded pieces of display text:

- A one-line task label: the submitted task, sanitised to a single line of at most 160 characters.
- A provisional assistant preview: the most recent visible assistant text, sanitised and capped at 4 KiB of UTF-8. Oversized text is cut and marked `[preview truncated]`. Rapid updates are coalesced to at most five preview refreshes per second per run.

Previews contain visible assistant text only. Tool arguments, raw tool results, hidden thinking, stderr, system history and authentication fields never enter display state. Terminal control characters and direction overrides are removed without changing the saved files.
A preview is provisional. It never proves that a run completed, and it never replaces the saved final answer: `output.md` in the run folder remains the only authoritative result. A stale preview stays labelled provisional after a run ends.

The visible-agent setting bounds the root rows, defaulting to five. Every active root stays reachable through the arrows; hidden runs continue normally.
The display bound does not restrict launches; `/omps status` lists every direct owned run.
Finishing one run leaves active siblings visible. When all runs end, the strip shows a summary of the latest finished root for 10 seconds and then clears. A launch within those 10 seconds keeps the strip. `/omps inspect` still opens finished runs after the strip clears. Old previews cannot replace newer work.

### The status line

The status line shows a short entry, for example `omps: reader running` or `omps: 2 active runs`.
The entry clears only when no owned run remains active.

### Checking with a command

Some Pi clients do not show the strip. Use `/omps` or `/omps status` instead. A summary looks like this:

```text
run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c: running
  agent reader, directory /path/to/project
  files ~/.pi/agent/omps/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
```

A session with no runs answers `No runs in this session.`

OMPS opens no extra terminal tabs or panes, also in Orca. The agent has no terminal of its own. Pi talks to it through pipes in RPC mode (a machine-readable message format).

## Agent trees and inspection

Each launch leaves one compact acknowledgement row in the transcript, for example `OMPS: reader started (3f2c9b1e)`.
It shows the agent, the short run id and the launch state. Pi's `app.tools.expand` action, Ctrl+O by default,
reveals the acknowledgement text only. It never re-creates a live per-run tree, and other tool cards keep their normal expansion.

The hierarchy lives in the fleet strip and the inspection modal. Identical agent names stay distinct through run ids.
Expanded strip rows are bounded by the visible-agent setting; the modal lists every retained node without that bound.
Status counts still include all active direct children.

1. Run `/omps inspect` to open the current session's retained nodes.
2. Move with Up and Down. Rows sit beneath their immediate parent, indented by depth.
3. Fold a branch with Left; unfold it with Right. Folded rows show `+N folded`; nothing is discarded.
4. Press Enter to read the selected node's saved task and output.
5. Use PageUp or PageDown to scroll the detail area.
6. Press Escape to return to Pi's editor.

You can also run `/omps inspect <run-id>` to open a selected node directly, or press Enter on a fleet row to inspect that root.
Fullscreen mode supports clicks on tree rows. Regular mode uses keyboard input; a narrow terminal shows the tree and details
one after the other, and Escape steps back from the detail screen before closing the modal.
The modal includes retained hidden descendants and completed short runs, and it updates while agents run.
Resizing keeps the selected run. Closing the modal restores your editor draft and releases its pending reads; the run continues.
An empty session answers `No runs to inspect in this session.` without reading the mapping or display preferences.

Selected details show the lineage, state, known model, active tools, the submitted task, any provisional assistant preview
and the saved output. The preview is live visible answer text labelled provisional; it never proves completion and never
replaces `output.md`, which stays the only authoritative final answer. Failed or cancelled output stays labelled partial.

### Observation and control

Inspection can follow validated descendants down to great-grandchildren when nesting permits them.
Snapshots keep immediate-parent ownership through each verified RPC connection.
Out-of-order evidence waits within a bounded backlog. Missing evidence, dropped records and overflow produce incomplete labels.
Recovered temporary gaps clear; permanent loss stays labelled. An ancestor's terminal state never invents a descendant result.

Viewing a descendant provides no control authority. Status and cancellation still belong to its immediate parent.
Use `/omps cancel <direct-run-id>` from that parent to stop its owned subtree.
Inspection starts no process and sends no model turn. Results still arrive through the separate delivery path described below.
Todo keeps its own widget, keys and stored preferences.

### Private detail files

The inspector reads only a selected node's validated `config.json` and `output.md`.
It reads at most 64 KiB from each file, with one extra byte to detect truncation.
Persona files, authentication files, raw event logs and stderr remain unopened.
Terminal instructions and direction overrides are removed from displayed text.

The detail area preserves full run ids, lineage and known model information.
Missing files show unavailable information. Failed or cancelled output remains partial.
Truncated output identifies its saved file. Open that file separately only when you need its full contents.
Saved tasks and outputs can contain sensitive text. Avoid sharing inspector screenshots or RPC responses without checking them.

Supported RPC clients receive bounded text, without terminal components or mouse input.
Each response is capped at 64 KiB. JSON and print runs keep their existing result behaviour.

## Getting the result

When a run completes or fails, OMPS sends one message into the conversation:

```text
OMPS run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c (reader) completed.
Files: ~/.pi/agent/omps/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
Result:
The README explains how to install OMPS and map agents...
```

- A failed run adds an `Error:` line. If the agent wrote any text, the result starts with a `PARTIAL OUTPUT` note.
- When no output was saved, the message says `No output was saved.`
- The message starts a new turn, so Pi's model reads the result and can act on it.
- If Pi is busy with a reply, the message waits until that reply ends.
- The message holds at most 4000 characters of the result. A longer result ends with `[truncated; full text in .../output.md]`. Open `output.md` in the run folder for the full text.
- A cancelled run sends no message.
- If the session ended before the message was sent, nothing is sent. `notification.json` in the run folder records the failure.

### Nested results and local todos

Each result reaches the run's immediate parent, once and separately from other results.
A delegating child waits for owned runs and delivery attempts before final settlement.
It can then use the delivered results in its final answer. A failed delivery does not change a completed run's outcome.

`om-pi-todo` works when its real extension and exact `todo` tool are explicitly mapped:

```yaml
tools: [todo]
extensions:
  - /path/to/om-pi-todo/src/extension.ts
```

Replace the extension path with its installed entry from `pi list` and that package's manifest.
A child starts an empty normal-mode list, including when global preferences select OpenSpec mode.
Its local ids can match sibling or parent ids without sharing tasks. Real todo reminders finish before accepted output.
Child completion never updates the parent's OpenSpec tasks or changes global todo preferences.
The parent must explicitly update its own todo when that work is verified.

Run `/skill:om-pi-subagents` for the packaged operational instructions.
A mapped child needs the skill explicitly, for example:

```yaml
skills:
  - ~/.pi/agent/npm/node_modules/om-pi-subagents/skills/om-pi-subagents/SKILL.md
```

Use the package folder shown by `pi list` if yours differs. Skill loading grants no tools.
Add `omps` to that child's tools only when you approve delegation.

### Optional child capabilities

Memory and Todo default to Off for a new mapping. Existing explicit mappings remain in effect.
The parent keeps its own extension settings and OpenSpec tasks. Each descendant uses its
own mapping, even when its immediate parent has either capability enabled.

1. Install `om-memory-system` or `om-pi-todo` separately if needed.
2. Run `/omps-settings` and choose **Agent capabilities**.
3. Choose an existing agent, then **Memory** or **Todo**.
4. Choose **Enable** and enter the installed package folder or its published Pi extension entry.
5. Confirm the exact changes to that agent's lists and the YAML destination.

The helper reads the package's published `pi.extensions` metadata. Memory also offers
**Enable with shipped skill** when `omms-memory` is present in its published skills.
It adds `memory` or `todo` to `tools`, and the selected entry to `extensions`.
No separate permission flag or sibling configuration block is needed:

```yaml
agents:
  researcher:
    persona: ./researcher.md
    tools: [read, memory]
    thinking: off
    extensions:
      - /path/to/om-memory-system/dist/adapters/pi/extension.js
    skills:
      - /path/to/om-memory-system/skills/omms-memory/SKILL.md
```

Use the installed entry shown in your package manifest; the example path is a placeholder.
`memory` grants the **whole** tool, including write and portability modes. Grant it only
when the child needs those operations. Memory recall and settled capture belong to OMMS;
child tasks belong to the real todo extension. OMPS stores neither sibling's state.

**On (configured)** means the entry and exact tool are mapped; it does not prove backend
health. **Partial** means an incomplete or ambiguous mapping. Check the agent's YAML lists
and correct an unrecognised wrapper by hand. A missing package, cancelled edit or changed
YAML leaves the file unchanged. Reopen settings after a save conflict.
Choose **Disable** to remove recognised sibling entries, mapped skills and matching tool
approval together. Future launches have no memory hooks or child todo bootstrap. An
admitted child keeps its original resources. Other agents and parent extensions stay as they were.

For a handoff, the parent searches its own memory and chooses a bounded task. Give the child
only verified context. After the result arrives, the parent checks the saved output and
completion state before updating its own todo or recording useful knowledge in memory.
A provisional preview or a child's capture does not prove a completed run.

## Run states

| State       | What it means                                                                                            | What to do                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `starting`  | OMPS starts the agent process. It checks the guard, the tools, the model and the working folder first.   | Wait. Start-up has 30 seconds.                                                           |
| `running`   | The agent accepted the task and works on it.                                                             | Wait, or cancel it.                                                                      |
| `stopping`  | The run has an outcome. OMPS stops the agent process and everything it started.                          | Wait.                                                                                    |
| `completed` | The answer is saved, the agent process exited cleanly and OMPS confirmed that all its processes stopped. | Read the result message or `output.md`.                                                  |
| `failed`    | Something went wrong. Output that exists after an error does not make a run pass.                        | Run `/omps status <run-id>` and read the error. See [Troubleshooting](#troubleshooting). |
| `cancelled` | You cancelled the run, or Pi quit, reloaded or changed session.                                          | Nothing. If the agent wrote any text, it is in `output.md`, labelled partial.            |

## Cancelling, quitting and reloading

1. Find the run id with `/omps`.
2. Type `/omps cancel <run-id>`.

OMPS answers `Run <run-id> is stopping.` It stops that owned subtree, including descendants in separate process groups.
Unrelated siblings keep running. An ended run answers `Run <run-id> is already <state>.`

When you quit Pi, reload with `/reload`, or switch to another session, OMPS closes admission and cancels every active direct run and its subtree. It waits until the processes stop. No agent outlives the Pi session that started it. These runs send no result message.

`/omps status` lists only runs from the current session since OMPS last loaded. After a reload, a restart or a session switch, older runs no longer show. Their files stay in the run folder. OMPS cannot resume a run after a restart.

## Rules and limits

### Configured limits and nesting

Put optional `limits` beside `agents` in `om-pi-subagents.yaml`.

| Field               | Accepted values             | Default | Meaning                                   |
| ------------------- | --------------------------- | ------- | ----------------------------------------- |
| `maxConcurrentRuns` | Safe integers of at least 1 | 1       | Active direct children per parent session |
| `maxDepth`          | Safe integers of at least 0 | 1       | Greatest depth from root depth zero       |

A safe integer is a whole number JavaScript can represent exactly. Omitted limits use the defaults.
No additional fixed cap applies. Depth zero disables launches while list and status remain available.

```text
root: depth 0
  child: depth 1
    grandchild: depth 2
      great-grandchild: depth 3
```

Approve `omps` in a target's `tools` to let it delegate. It uses the same canonical registry,
its own direct slots and the immediate parent's model unless its mapping sets another model.
Each target keeps its own tool permissions. A delegator can select a write-capable target.

A branch retains its inherited depth ceiling. Nested launches use the smaller of that ceiling and fresh YAML.
Raising depth affects new root branches; lowering it stops new deeper launches without cancelling existing descendants.
Changing concurrency affects the next launch. A lower limit leaves existing runs alive until capacity becomes available.

Starting, running and stopping runs consume slots. Excess requests fail immediately rather than queue:

```text
session capacity reached (limits.maxConcurrentRuns: 4); active runs: <ids>. Wait for a run, cancel it, or edit limits.maxConcurrentRuns in YAML.
```

A capacity of four through depth three can reach `4 + 16 + 64 = 84` descendants.
There is no machine-wide budget. Concurrent writers need separate safe working directories or worktrees.

### Operator settings

1. Run `/omps-settings` with no arguments. `/subagents-settings` is an alias of the same menu.
2. Select a setting from the menu.
3. Enter a whole number for limits and visible rows, or a key specification for a shortcut.
4. Read the value, destination and any load warning.
5. Confirm the save, or decline it.
6. Select Done to close the menu.

Native selection, input and confirmation dialogs work in interactive Pi and supported RPC clients.
The command starts no agent or model request. Clients without dialogs receive an error before any settings file access.

| Menu item                           | Validation                                           | Save destination                        |
| ----------------------------------- | ---------------------------------------------------- | --------------------------------------- |
| Maximum nesting depth               | Safe integer of at least 0; root depth is 0          | `limits.maxDepth` in registry YAML      |
| Parallel direct children per parent | Safe integer of at least 1                           | `limits.maxConcurrentRuns` in that YAML |
| Visible agents                      | Safe integer from 1 to 256; default 5                | `ui.maxVisibleAgents` in that YAML      |
| Fleet view                          | `expanded`, `collapsed` or `off`; default `expanded` | `ui.fleetView` in that YAML             |
| Fleet list shortcut                 | Pi key specification or `off`; default `off`         | `ui.toggleKey` in that YAML             |
| Inspection shortcut                 | Pi key specification or `off`; default `off`         | `ui.inspectKey` in that YAML            |
| Agent capabilities                  | Select an agent, then Memory or Todo                 | That agent's existing YAML lists        |
| Import legacy visible agents        | Offered while a valid legacy value applies           | `ui.maxVisibleAgents` in that YAML      |

Parallel agents and direct children share the same per-parent limit.
The menu shows the selected registry path, including any `OMPS_REGISTRY` override, and labels
the source of the effective visible-agent value: YAML, the legacy display file or the default.
OMPS does not write todo preferences or Pi's `settings.json`.

A saved fleet view applies at once and replaces any session toggle. Shortcut edits need `/reload`.

Shortcut keys are lowercase Pi key specifications, such as `alt+o`. Tab and Ctrl+I are refused,
and so is a key already bound to an effective built-in action, with guidance to choose another.
The two shortcuts must differ; either or both can be `off`.
Shortcuts default to `off`. To restore the old `alt+o` and `alt+i` keys, and for the macOS Option setting they need, see [Restore the Alt keys](SETUP.md#restore-the-alt-keys).

Shortcuts bind when an interactive session starts. A saved shortcut needs `/reload` before it
becomes active; the menu shows the saved and the active binding until then. A visible-agent
save repaints the display at once.

Older OMPS versions kept visible agents in `<config-dir>/pi-subagents/config.json`, selected by
absolute `XDG_CONFIG_HOME` and otherwise `~/.config`. That file is now a read-only fallback:
while YAML omits `ui.maxVisibleAgents`, its valid value still applies and is labelled `legacy`.
Malformed legacy data is diagnosed and the default applies. The import entry writes the shown
value into YAML after confirmation. YAML wins once it declares the field, and the legacy file
is never written or deleted.

Cancelling an input or declining confirmation changes nothing for that setting.
Earlier confirmed saves remain in effect. Confirming creation of a missing registry creates version one with `agents: {}`.
YAML comments, agent mappings, resource paths and the other limit remain intact after an edit.

Malformed or unreadable files must be corrected before saving.
A file changed by another session or editor causes a conflict: reopen settings before saving.
Writes use private temporary files and atomic replacement. A failed write leaves the destination and display cache unchanged.
Short-lived locks apply to individual destinations and allow concurrent Pi sessions.

New launches read saved execution limits afresh. Lower capacity leaves admitted work running until a slot becomes available.
Depth zero blocks new launches. Raising depth applies to new branches; an existing branch retains its inherited ceiling.
Each parent has its own capacity, so nested branching can multiply process and provider load.

### Blocked after a failed cleanup

Unconfirmed descendant cleanup also fails ancestor runs. Spare capacity cannot bypass the block.
Status and cancellation remain available for the owner's other runs.

Sometimes OMPS cannot confirm that all processes of a run stopped. The run then fails, and the session refuses new runs with:

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

The agent can use only the exact tool names in its mapping. OMPS checks every tool call when it runs. A call to any other tool is blocked and the run fails at once.

This check is a rule inside Pi. It is not an operating-system sandbox. An agent with `bash`, `powershell`, `write` or `edit` can change files with your permissions. Start such an agent in a folder that is safe to change, for example a separate git worktree. Provider extensions that you list in the mapping also run with your permissions.

### Model and thinking

The agent uses Pi's current model, unless its mapping names another model. It always uses the `thinking` level from its mapping, not Pi's level. OMPS does not switch to another model when the first one fails.

### Mapping changes

Each launch reads the mapping file again. An edit takes effect at the next launch. A run that already started keeps its original settings. If the mapping file has an error, OMPS refuses new launches until you fix it. See [Set up agents](SETUP.md).

### Time limits

| Limit                          | Value      |
| ------------------------------ | ---------- |
| Start-up, before the task goes | 30 seconds |
| Whole run, start-up included   | 30 minutes |

A run that passes a limit fails.

### Not supported

OMPS has no councils, scheduling, automatic worktrees or provider fallback.

## Run files

OMPS saves each run in its own folder:

```text
~/.pi/agent/omps/runs/<session-id>/<run-id>/
```

If you set `PI_CODING_AGENT_DIR`, the folder is `$PI_CODING_AGENT_DIR/omps/runs/` instead. The confirmation message and `/omps status` show the exact path.

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

Only your user can read these files. The folders have mode `0700` and the files `0600`. OMPS removes known credential fields from `events.jsonl` and `stderr.log`. Tasks, personas and answers can still hold sensitive text. OMPS never deletes run folders, also not when you [uninstall](UNINSTALL.md) it. Delete old ones yourself.

## Troubleshooting

| You see                                                            | Cause                                                                                                     | Fix                                                                             |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `/omps` is not a known command                                     | OMPS did not load.                                                                                        | See [Install](INSTALL.md).                                                      |
| `No personas mapped.`                                              | The mapping file has no agents, or does not exist.                                                        | Map an agent. See [Set up agents](SETUP.md).                                    |
| An `OMPS:` error about the mapping file                            | The mapping file has an error. New launches stay blocked.                                                 | Fix the field the error names. See [Set up agents](SETUP.md).                   |
| `unknown agent "<name>"; mapped agents: ...`                       | The agent name is wrong.                                                                                  | Use a name from `/omps list`.                                                   |
| `Usage: /omps list \| run <agent> <task> \| ...`                   | OMPS did not recognise the command, for example a run with no task.                                       | Check the command against the [table](#slash-commands).                         |
| `task is required`                                                 | The tool call had no task.                                                                                | Add a task.                                                                     |
| `the task cannot start with a slash, ...`                          | The task starts with `/`.                                                                                 | Reword the task.                                                                |
| `cwd must be an absolute path: ...`                                | The tool's `cwd` is a relative path.                                                                      | Give the full path.                                                             |
| `cwd does not exist or is not a directory: ...`                    | The folder is missing.                                                                                    | Check the path.                                                                 |
| `session capacity reached ...`                                     | Configured direct-child slots are full.                                                                   | Wait, cancel an owned run, or change `limits.maxConcurrentRuns` in YAML.        |
| `no new run can start: run ... may have left processes behind`     | OMPS could not confirm that a run's processes stopped.                                                    | Follow [Blocked after a failed cleanup](#blocked-after-a-failed-cleanup).       |
| `unknown run: <run-id>`                                            | The id is wrong, or the run belongs to another session or an earlier load.                                | Use an id from `/omps`. For an older run, read its run folder.                  |
| `child is not ready: tool "<name>" is not registered`              | The name is wrong or the MCP server is missing. Pi 1.0 MCP names use `_` for `-`.                         | Fix the name (`_` for `-`) and the server. See [Set up agents](SETUP.md#tools). |
| `tool "mcp" does not exist; the obsolete MCP proxy was removed...` | The mapping lists the old `mcp` tool.                                                                     | Use native names such as `mcp__<server>__<tool>`.                               |
| `child is not ready: model ... is not in the model registry`       | The agent process does not know the model.                                                                | Check the model name. For a custom provider, list its extension in the mapping. |
| `child is not ready: model ... has no configured authentication`   | No credentials for that provider.                                                                         | Set up credentials for that provider in Pi.                                     |
| `child is not ready: no model is selected`                         | Pi has no model and the mapping names none.                                                               | Select a model in Pi, or set `model` in the mapping.                            |
| `child was not ready within 32000 ms`                              | Start-up took too long, for example a slow MCP server.                                                    | Read `stderr.log`. Try again.                                                   |
| `permission violation: <tool> is not approved`                     | The agent tried a tool that is not in its list.                                                           | Add the tool to the mapping if you trust it, or change the persona or task.     |
| `provider error: ...` or `provider failed after retries: ...`      | The model provider refused or failed, for example no credentials or no account balance.                   | Check your provider account and network.                                        |
| `the response was cut off (stop reason length)`                    | The answer was too long for the model.                                                                    | Ask for a shorter answer, or split the task.                                    |
| `run exceeded the total deadline of 1800000 ms`                    | The run took more than 30 minutes.                                                                        | Split the task into smaller runs.                                               |
| `result message not delivered: the owning session has ended`       | The session ended before the run finished.                                                                | Read `output.md` in the run folder.                                             |
| No fleet strip shows                                               | `ui.fleetView` is `off`, the last run ended over 10 seconds ago, or your Pi client does not show widgets. | Set `ui.fleetView` in `/omps-settings`, or use `/omps` and the status line.     |

Slash command errors start with `OMPS:`. Tool errors go to Pi's model without that prefix.

For any failed run:

1. Type `/omps status <run-id>`.
2. Read the error line.
3. Open `stderr.log` and `events.jsonl` in the run folder for more detail.
4. Fix the cause before you start another run.
