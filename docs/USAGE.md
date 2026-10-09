# How to use OMPS

OMPS hands a task to an agent you defined. The agent runs in the background as its own Pi process with only the tools you allowed. Its answer returns to your conversation as a message. You can keep working meanwhile.

Before you start, [install OMPS](INSTALL.md) and [map at least one agent](SETUP.md). The examples use an agent called `reader` with read-only tools.

## Quick start

1. Type `/omps list`. Each mapped agent shows with its tool count, for example `reader: 4 tools (read-only)`.
2. Type `/omps run reader Summarise the README`.
3. Watch the `● Agents` tree above the editor.
4. Read the result message when it arrives.

The confirmation gives the run id and the run folder. This guide writes `~` for your home folder.

## Start a run

Three routes start a run. They share the same launch rules and result messages.

| Route           | Use it                                                       |
| --------------- | ------------------------------------------------------------ |
| `/omps run`     | You type a command.                                          |
| `@agent task`   | You type in Pi's interactive terminal interface. See below.  |
| The `omps` tool | Pi's model, or another agent that drives Pi, makes the call. |

### Slash commands

| Command                    | What it does                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `/omps list`               | Reads the mapping again. Lists agents and tool counts.                              |
| `/omps run <agent> <task>` | Starts one background run in Pi's current working folder.                           |
| `/omps` or `/omps status`  | Shows every run of this session.                                                    |
| `/omps status <run-id>`    | Shows one run, its folder and any error.                                            |
| `/omps cancel <run-id>`    | Stops that run and every process it started.                                        |
| `/omps inspect [run-id]`   | Opens the inspector. See [Agent trees and inspection](#agent-trees-and-inspection). |
| `/omps fleet`              | Switches the tree between expanded and collapsed for this session.                  |

`/omps list` marks an agent `write-capable` when it may use `bash`, `powershell`, `write` or `edit`.
The task is everything after the agent name. It cannot start with `/`.

### The `omps` tool

| Parameter | Used by            | Meaning                                                            |
| --------- | ------------------ | ------------------------------------------------------------------ |
| `action`  | all                | `list`, `run`, `status` or `cancel`.                               |
| `agent`   | `run`              | The mapped agent name.                                             |
| `task`    | `run`              | What the agent must do.                                            |
| `cwd`     | `run` (optional)   | Absolute path of an existing working folder. Default: Pi's folder. |
| `runId`   | `status`, `cancel` | The run id. Without it, `status` lists all session runs.           |

```json
{ "action": "list" }
```

```json
{ "action": "run", "agent": "reader", "task": "Summarise the README", "cwd": "/path/to/project" }
```

```json
{ "action": "status", "runId": "3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c" }
```

```json
{ "action": "cancel", "runId": "3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c" }
```

`run` returns at once. Only the tool can set `cwd`.

### At-mention launch

1. Open Pi's interactive terminal interface.
2. Type `@` at the start of the first editor line.
3. Select a mapped agent, or type its name.
4. Add the task after the space, for example `@reader Summarise the README`.
5. Submit the line.

The launch uses the `/omps run` path in Pi's current folder. No parent model request routes it. Completion lists agent names above Pi's file items.

| Submitted input                        | Outcome                             |
| -------------------------------------- | ----------------------------------- |
| `@reader Summarise the README`         | Launches `reader`.                  |
| `@reader` with no task                 | Shows usage. Starts nothing.        |
| `@nobody do it` (unmapped)             | Shows mapped names. Starts nothing. |
| `@README.md summarise this` (unmapped) | Passes to Pi as a file reference.   |
| `Please ask @reader to read this`      | Passes through as ordinary text.    |

An unmapped name with `/` or `.` stays a file reference. Use `@./docs` for a directory. If the mapping file has an error, OMPS shows it and sends nothing to the model.
Only interactive terminal input launches. RPC and extension input pass through. Use `/omps run` or the `omps` tool there.

## Let the model delegate

The `omps` tool carries short delegation rules. When the tool is active and Pi's default system prompt includes tool guidance, the model sees them on its first request. You can give a task without mentioning subagents.

For substantial tasks with separable work, the rules tell the model to:

1. Call `omps list` for fresh mappings.
2. Pick an agent whose approved tools fit a bounded investigation.
3. Check `omps status` before adding runs.
4. Use a safe working folder and avoid shared-file conflicts between parallel writers.
5. Wait for the separate result before relying on it.

The model delegates review, audit or security work only when you ask. Simple requests stay local. Say `Work locally; do not use subagents` to force that. The parent keeps the final answer and its own task updates.

If mappings are missing or unsuitable, the model reports it and continues locally. The rules grant no tools, invent no agents and change no settings.
Limits and cleanup blocks still apply.

### Prompt scope and host versions

The rules guide the model. They do not guarantee compliance and start no child or model request at session startup.
An inactive `omps` tool supplies no guidance. A replacement system prompt can omit it.
Pi 0.99.1 keeps an active tool's rules when its declaration is hidden. Pi 1.1.0 drops them, so hiding `omps` omits this guidance there.

Run `/skill:om-pi-subagents` for detailed operating instructions. Loading it is optional and grants no tools.
After updating OMPS, run `/reload` or start a new session. A reload cancels active runs.

## Agent trees and inspection

The `● Agents` tree above the editor shows running direct agents with no key press. It uses two lines per agent and at most 12 lines in total, running agents first:

```text
● Agents
├─ ⠹ reader  Map the API · 3 tool uses · 12.0s
│    ⎿  reading 2 files…
└─ ✗ reviewer  Review changes · 1.2s error: provider error: quota
```

- `⎿` shows the current tool, or the first line of the visible answer so far, or `thinking…`.
- `✓` completed, `✗` failed with the start of the error, `■` cancelled.
- A completed run stays until the next parent turn and at least 4 seconds. A failed or cancelled run stays until the second parent turn.
- The tree never shows tool arguments, raw tool results, thinking or stderr. Clients without widgets use `/omps` and the status line (`omps: 2 active runs`).

The tree design is adapted from [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) (MIT).

### Management list

A list below the editor shows the same runs. To use it with the default keys:

1. Empty the prompt and keep the editor focused.
2. Press Down to select the first agent.
3. Press Up or Down to move.
4. Press Enter to inspect the selected agent.
5. Press Escape to return to the prompt. The runs continue.

Outside the list, Up and Escape keep their Pi actions. The list shows `ui.maxVisibleAgents` rows (default 5) with `↑ N more` markers.

| Setting                                | Effect                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `ui.fleetView: expanded`               | Default. Tree plus list.                                                        |
| `ui.fleetView: collapsed`              | Heading only, for example `● Agents · 5 running`.                               |
| `ui.fleetView: off`                    | No widgets. `/omps` and `/omps inspect` still work.                             |
| **Management list: Hide**              | Tree only. Same as `ui.showManagementList: false`. `/omps inspect` stays.       |
| `navigationDownKey`, `navigationUpKey` | Default `down` and `up`. Another Pi key, or `off`. Edits apply after `/reload`. |

A **Fleet view shortcut** in `/omps-settings` toggles the view like `/omps fleet`.

Custom keys that Pi already uses stay inactive. OMPS names the owning action and adds no fallback.
Pi 1.0.4 binds Ctrl+Shift+Up and Ctrl+Shift+Down to `tui.altScreen.previousPrompt` and `tui.altScreen.nextPrompt`.
OMPS never rewrites Pi keybindings. Follow the [manual remapping example](SETUP.md#management-navigation-keys), check `/hotkeys`, then run `/reload`. Some terminal programs consume modified arrows, so test your pair.

### Inspect a run

1. Run `/omps inspect` to open the picker of retained nodes.
2. Move with Up and Down. Fold with Left, unfold with Right.
3. Press Enter to open details.
4. Scroll with Up, Down, PageUp, PageDown, Home or End.
5. Press Left or Right to switch agents.
6. Press Escape to return to the picker. Press Escape again to close.

`/omps inspect <run-id>` and Enter on a list row open details directly.
Every width uses a single-column layout. Fullscreen Pi supports picker clicks and mouse-wheel scrolling over the details. Regular mode uses the keyboard because the terminal owns mouse scrollback.

Details show lineage, state, model, active tools, the task, a **Live answer · provisional** section and **Saved output**.
The live answer is provisional: it holds at most 4 KiB, never proves completion and never replaces `output.md`. Failed or cancelled output stays labelled partial.
Your reading position holds during updates. Reaching the bottom follows new content.

The inspector follows descendants down to great-grandchildren. Missing evidence stays labelled incomplete.
Viewing a descendant gives no control. Only its immediate parent can use status or cancellation, and `/omps cancel <direct-run-id>` stops the whole subtree.
It reads only `config.json` and `output.md` of the selected run, at most 64 KiB each. Persona files, authentication files, event logs and stderr stay unopened.
Tasks and outputs can hold sensitive text, so check screenshots before sharing them.
RPC clients receive bounded text instead of the modal.

Each launch leaves one compact acknowledgement row, for example `OMPS: reader started (3f2c9b1e)`. Pi's `app.tools.expand` action (Ctrl+O by default) reveals its text only.

## Getting the result

When a run ends, OMPS sends one message to the run's immediate parent:

```text
OMPS run 3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c (reader) completed.
Files: ~/.pi/agent/omps/runs/<session-id>/3f2c9b1e-8a4d-4c7e-9b2a-1d5e6f7a8b9c
Result:
The README explains how to install OMPS and map agents...
```

- A failed run adds an `Error:` line. Partial text starts with `PARTIAL OUTPUT`. With no saved output, the message says `No output was saved.`
- The message starts a parent turn. It waits if Pi is busy.
- It holds at most 4000 characters. Open `output.md` for the rest.
- A cancelled run sends no message.
- If the session ended first, nothing is sent. `notification.json` records why.
- A delegating child waits for its owned runs and their delivery before its final answer.
- A failed delivery leaves a completed run completed.

### Folded results and expansion keys

Interactive Pi folds long results after eight lines, counted before wrapping. The heading, files line, `Result:` label, `Error:` line and `PARTIAL OUTPUT` note stay visible. The hint, shown in the warning colour, gives the hidden-line count and the keys.

- Ctrl+Shift+E toggles every OMPS result in the session.
- The host expansion key (Ctrl+O by default) toggles Pi's own state and also expands tool output.
- A result folds only when both states are off.

Change the key with **Result shortcut** in `/omps-settings` (`ui.resultKey`), then run `/reload`.
Ctrl+Shift+E needs extended-key reporting (kitty CSI-u or xterm `modifyOtherKeys`). If it does nothing, use the host key from the hint. Raw Ctrl+E keeps Pi's line-end action.
Folding changes only the display. The model, `output.md` and JSON, print and RPC output stay the same.

### Nested results and local todos

A child with `omps` approval can start further agents. Each result reaches its immediate parent once.
Todo works in a child only when you map the real extension and the exact `todo` tool. The child gets its own empty normal-mode list and never changes the parent's OpenSpec tasks. The parent updates its own todo after it verifies the work.

```yaml
tools: [todo]
extensions:
  - /path/to/om-pi-todo/src/extension.ts
```

To give a child these instructions, map the skill. Use the folder shown by `pi list`:

```yaml
skills:
  - ~/.pi/agent/npm/node_modules/om-pi-subagents/skills/om-pi-subagents/SKILL.md
```

## Run states

| State       | Meaning                                                                    | What to do                               |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| `starting`  | OMPS checks the guard, tools, model and working folder. Limit: 30 seconds. | Wait.                                    |
| `running`   | The agent works on the task. Limit: 30 minutes in total.                   | Wait, or cancel.                         |
| `stopping`  | OMPS stops the agent and everything it started.                            | Wait.                                    |
| `completed` | Answer saved, clean exit, cleanup confirmed.                               | Read the result or `output.md`.          |
| `failed`    | Something went wrong. Output after an error does not make a run pass.      | Run `/omps status <run-id>`. See below.  |
| `cancelled` | You cancelled, or Pi quit, reloaded or changed session.                    | Partial text, if any, is in `output.md`. |

## Cancel, quit and reload

1. Find the run id with `/omps`.
2. Type `/omps cancel <run-id>`.

OMPS stops that owned subtree and leaves unrelated siblings running. Quitting Pi, `/reload` and a session switch cancel every active run and wait for its processes to stop. These runs send no result. `/omps status` lists only runs from the current load. OMPS cannot resume a run.

## Limits and nesting

### Configured limits and nesting

Put optional `limits` beside `agents` in `omps/config.yaml`.

| Field               | Default | Meaning                                    |
| ------------------- | ------- | ------------------------------------------ |
| `maxConcurrentRuns` | 1       | Active direct children per parent session. |
| `maxDepth`          | 1       | Greatest depth. The root is depth 0.       |

Omitted fields use the defaults. Depth zero disables new launches. Starting, running and stopping runs use slots. A launch over capacity fails at once and does not queue.

To let an agent delegate, add `omps` to its `tools` and list its targets in `delegates`:

```yaml
agents:
  builder:
    persona: ./personas/builder.md
    tools: [read, edit, write, bash, omps]
    thinking: high
    delegates: [writer]
```

`delegates` is required with `omps`. A launch outside the list fails before any process starts. A target keeps its own tools, so it can be write-capable.
A branch keeps the list and depth ceiling it started with, and OMPS also reads fresh YAML. A target must pass both. Existing descendants continue when you lower a limit.
`/omps list` shows each delegating agent's targets.

Four slots through depth three can reach `4 + 16 + 64 = 84` descendants. OMPS sets no machine-wide budget. Give concurrent writers separate worktrees.

### Blocked after a failed cleanup

Sometimes OMPS cannot confirm that a run's processes stopped. The run fails and new launches stop with `no new run can start: run <run-id> may have left processes behind`. Spare capacity does not lift the block.

1. Open `status.json` in the run folder and read `pid`.
2. List the group with `pgrep -g <pid>`.
3. Stop it with `kill -- -<pid>`.
4. Check `ps` for other processes the agent started and stop them.
5. Type `/reload` in Pi.

### Tools, model and mapping

- The agent can use only the exact tool names in its mapping. A call to any other tool is blocked and the run fails.
- This guard is a rule inside Pi. It is no operating-system sandbox. Start agents with `bash`, `powershell`, `write` or `edit` in a safe folder, such as a separate worktree.
- The agent uses Pi's current model unless the mapping names one. It always uses the mapping's `thinking` level. OMPS never falls back to another model.
- Each launch reads the mapping again. A running run keeps its original settings. A mapping error blocks new launches until you fix it.

## Operator settings

1. Run `/omps-settings`. `/subagents-settings` is an alias.
2. Select a setting.
3. Enter the value.
4. Read the destination and any warning, then confirm.
5. Select Done.

Native dialogs work in interactive Pi and supported RPC clients. The command starts no agent.

| Menu item                           | Values                                  | YAML field                 |
| ----------------------------------- | --------------------------------------- | -------------------------- |
| Maximum nesting depth               | Whole number, 0 or more                 | `limits.maxDepth`          |
| Parallel direct children per parent | Whole number, 1 or more                 | `limits.maxConcurrentRuns` |
| Visible agents                      | 1 to 256. Default 5                     | `ui.maxVisibleAgents`      |
| Fleet view                          | `expanded`, `collapsed`, `off`          | `ui.fleetView`             |
| Management list                     | Show or Hide. Default Show              | `ui.showManagementList`    |
| Management next / enter key         | Pi key or `off`. Default `down`         | `ui.navigationDownKey`     |
| Management previous key             | Pi key or `off`. Default `up`           | `ui.navigationUpKey`       |
| Fleet view shortcut                 | Pi key or `off`. Default `off`          | `ui.toggleKey`             |
| Inspection shortcut                 | Pi key or `off`. Default `off`          | `ui.inspectKey`            |
| Result shortcut                     | Pi key or `off`. Default `ctrl+shift+e` | `ui.resultKey`             |
| Agent capabilities                  | Select an agent, then Memory or Todo    | That agent's YAML lists    |

All fields live in the registry YAML. The menu shows its path, including any `OMPS_REGISTRY` override. Fleet view and Management list changes apply at once. Key and shortcut edits need `/reload`.
OMPS never writes todo preferences or Pi's `settings.json`.

Type keys as text, such as `ctrl+1`. Spell out the modifier instead of holding Ctrl. Settings accepts any letter case and converts `ctr`, `ctl`, `control` to `ctrl`, `opt`, `option` to `alt`, and `cmd`, `command`, `win` to `super`. It rejects `meta`, Tab and Ctrl+I.
The confirmation shows the converted key. YAML stores it, and manual edits must use strict Pi names.
Settings checks conflicts with Pi bindings before saving and names the owning action. Enabled OMPS keys must differ.
On macOS, Option+O types `ø` unless the terminal sends Option as Alt. See [Restore the Alt keys](SETUP.md#restore-the-alt-keys).

Cancelling or declining leaves a setting unchanged. A missing registry is created only after you confirm, with `agents: {}`. It gets mode `0600` in a `0700` folder. A malformed file must be fixed first. After a save conflict, reopen settings.
An old visible-agent value in `<config-dir>/pi-subagents/config.json` works as a read-only fallback until YAML sets the field. The menu offers an import. `<config-dir>` is `$XDG_CONFIG_HOME` when that is an absolute path, else `~/.config`.

### Optional child capabilities

Memory and Todo are off for new mappings. Each agent has its own switch. A child never inherits its parent's. The full integration guide is [Todo and memory](INTEGRATIONS.md).

1. Install the package if needed: `pi install npm:om-memory-system` or `pi install npm:om-pi-todo`.
2. Run `/omps-settings` and choose **Agent capabilities**.
3. Choose an agent, then **Memory** or **Todo**.
4. Choose **Enable**, or **Enable with shipped skill** for Memory with `omms-memory`.
5. Choose a package folder if several match, or enter one if asked.
6. Check the resources and YAML destination, then confirm.

OMPS reads `packages` in `<agent-dir>/settings.json` (default `~/.pi/agent`, or `PI_CODING_AGENT_DIR`). It loads no extension and installs nothing.
Detection skips `~`, `file://`, git and URL sources. Enter the installed path by hand for those, for an unlisted checkout, or when Pi settings are unreadable. Cancelling leaves YAML unchanged.

The confirmed edit adds the tool to `tools` and the extension to `extensions`:

```yaml
agents:
  researcher:
    persona: ./personas/researcher.md
    tools: [read, memory]
    thinking: off
    extensions:
      - /path/to/om-memory-system/dist/adapters/pi/extension.js
    skills:
      - /path/to/om-memory-system/skills/omms-memory/SKILL.md
```

Approving `memory` grants the whole tool, including write and portability modes. OMMS owns recall and capture. The todo extension owns child tasks.

- **On (configured)** means the entry and tool are mapped. It does not prove the backend works.
- **Partial** means the mapping is incomplete or unclear. Fix the YAML lists by hand.
- **Disable** removes the extension, skill and tool together for future launches.

For a handoff, the parent searches its memory and gives the child only verified context. The parent checks saved output and completion state before it updates its todo or memory. A provisional preview or a child's capture proves nothing.

## Run files

Each run saves to `~/.pi/agent/omps/runs/<session-id>/<run-id>/`, or under `$PI_CODING_AGENT_DIR` when set.

| File                | Holds                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `config.json`       | Agent settings, task, working folder, start time.                    |
| `persona.md`        | The persona text the run started with.                               |
| `status.json`       | State, timestamps, error, `pid`, model.                              |
| `events.jsonl`      | Every message from the agent process, one JSON object per line.      |
| `stderr.log`        | Error output from the agent process.                                 |
| `output.md`         | The full final answer. Starts with `PARTIAL OUTPUT` after a failure. |
| `notification.json` | Whether the result message reached Pi, and why not if it failed.     |

Only your user can read these files (folders `0700`, files `0600`). OMPS removes known credential fields from the logs. Tasks, personas and answers can still hold sensitive text. OMPS never deletes run folders, so delete old ones yourself.

## Troubleshooting

For any failed run, type `/omps status <run-id>`, read the error, then check `stderr.log` and `events.jsonl` in the run folder.

| You see                                                | Fix                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `/omps` is not a known command                         | OMPS did not load. See [Install](INSTALL.md).                                               |
| `No personas mapped.`                                  | Map an agent. See [Set up agents](SETUP.md).                                                |
| An `OMPS:` error about the mapping file                | Fix the field it names. New launches stay blocked until then.                               |
| `OMPS now reads ... Move your settings:`               | Follow [Move settings into the OMPS folder](INSTALL.md#move-settings-into-the-omps-folder). |
| `... resolves inside the OMPS run folder`              | Move the persona into `omps/personas/` and update the `persona:` line.                      |
| `unknown agent "<name>"`                               | Use a name from `/omps list`.                                                               |
| `task is required` or `cannot start with a slash`      | Add a task, or reword it.                                                                   |
| `cwd must be an absolute path` or `cwd does not exist` | Give the full path of an existing folder.                                                   |
| `session capacity reached ...`                         | Wait, cancel a run, or raise `limits.maxConcurrentRuns`.                                    |
| `no new run can start: ... left processes behind`      | Follow [Blocked after a failed cleanup](#blocked-after-a-failed-cleanup).                   |
| `unknown run: <run-id>`                                | Use an id from `/omps`. Older runs are in their run folder.                                 |
| `tool "<name>" is not registered`                      | Fix the name and the MCP server. Pi 1.0 names use `_` for `-`. See [Tools](SETUP.md#tools). |
| `tool "mcp" does not exist ...`                        | Use native names such as `mcp__<server>__<tool>`.                                           |
| `model ... is not in the model registry`               | Check the model name. For a custom provider, list its extension.                            |
| `model ... has no configured authentication`           | Set up credentials for the provider in Pi.                                                  |
| `no model is selected`                                 | Select a model in Pi, or set `model` in the mapping.                                        |
| `No runs to inspect in this session.`                  | Start a run first. `/omps inspect` shows only runs from the current session.                |
| `child was not ready within 32000 ms`                  | Read `stderr.log`, then try again.                                                          |
| `permission violation: <tool> is not approved`         | Add the tool to the mapping if you trust it, or change the task.                            |
| `provider error: ...`                                  | Check your provider account and network.                                                    |
| `the response was cut off (stop reason length)`        | Ask for a shorter answer, or split the task.                                                |
| `run exceeded the total deadline of 1800000 ms`        | Split the task into smaller runs.                                                           |
| `result message not delivered: the owning session ...` | Read `output.md` in the run folder.                                                         |
| No agent tree shows                                    | Check `ui.fleetView`, whether the run left the tree, or use `/omps`.                        |

Slash command errors start with `OMPS:`. Tool errors go to the model without that prefix.
