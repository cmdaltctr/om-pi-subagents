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
2. Map at least one agent in `~/.pi/agent/omps/config.yaml`. See [Set up agents](SETUP.md).

The examples below use an agent called `reader` that may only read files.

## Quick start

1. Type `/omps list` in Pi. OMPS shows each mapped agent with its tool count:

   ```text
   reader: 4 tools (read-only)
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

4. Watch the `● Agents` tree above the editor. It shows each running agent with no key press.
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

### The agent tree and the list

The `● Agents` tree above the editor shows every running direct agent, with no key press. Its look is adapted from [tintinweb/pi-subagents](https://github.com/tintinweb/pi-subagents) (MIT). Each running agent uses two lines:

```text
● Agents
├─ ⠹ reader  Map the API · 3 tool uses · 12.0s
│    ⎿  reading 2 files…
├─ ⠹ builder  Update validation · 5 tool uses · 18.4s
│    ⎿  editing…
└─ ✗ reviewer  Review changes · 1.2s error: provider error: quota
```

| Part          | Meaning                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `●` or `○`    | `●` while a run is active, `○` when only finished runs remain.                                                                                                                                   |
| Spinner       | The agent is running. It moves every 80 ms.                                                                                                                                                      |
| `N tool uses` | Task tool calls the agent has started.                                                                                                                                                           |
| Elapsed time  | Time since the run started. Finished lines show the full duration.                                                                                                                               |
| `⎿` line      | What the agent does now: `reading…`, `searching 3 patterns…`, `running command…` or another tool name. With no tool active it shows the first line of the visible answer so far, or `thinking…`. |
| `✓`, `✗`, `■` | Completed, failed (with the start of the error) or cancelled.                                                                                                                                    |
| `+N more (…)` | The tree is limited to 12 lines. Running agents come first, then finished ones.                                                                                                                  |

Finished agents stay in the tree for a short time:

- A completed run stays until the next parent turn starts and at least 4 seconds have passed.
- A failed or cancelled run stays until the second parent turn starts.

An optional Management list below the editor shows the same runs for navigation:

```text
  ↓ to manage
  ○ reader  Map the API                                12s
  ○ builder  Update validation                         18s
```

To navigate the list with the default keys:

1. Make sure the editor owns focus and the prompt is empty.
2. Press Down. The first agent is selected with `●` and the hint changes to `↑↓ select · enter inspect · esc back`.
3. Press Up or Down to move to another agent.
4. Press Enter to inspect the selected agent.
5. Press Escape to return to the prompt. The runs continue.

Outside the list, Up recalls prompt history and Escape interrupts as usual. Typing ends selection and returns input to the editor. A dialog or overlay that owns focus keeps its keys. The list keeps a finished run for 4 seconds, and shows `↑ N more` and `↓ N more` when there are more runs than visible rows.

Set `ui.fleetView` in `/omps-settings` to change the starting view:

| Value       | Effect                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| `expanded`  | Default. Shows the tree; the list appears when `ui.showManagementList` is true. |
| `collapsed` | Shows only the tree heading, for example `● Agents · 5 running`. No list.       |
| `off`       | Shows neither widget. `/omps`, `/omps status` and `/omps inspect` still work.   |

`/omps fleet` switches between expanded and collapsed for the current session. A bound **Fleet view shortcut** does the same.
Choose **Management list: Hide** in `/omps-settings`, or set `ui.showManagementList: false`, to keep the expanded tree alone.
The preference defaults to true. Hiding the list ends selection, removes its hint and releases its navigation keys immediately.
Showing it restores rows from retained evidence. Session fleet toggles preserve that saved preference.
Every retained agent stays reachable through `/omps inspect` while the list is hidden.

`ui.navigationDownKey` and `ui.navigationUpKey` default to `down` and `up`. Either can be `off`.
Hints use the active pair. Key edits apply after `/reload`; settings shows saved values alongside active keys until then.
With the Down action off or inactive, keys cannot enter selection. Plain arrows pass through when you configure another pair.
A focused Pi selector, settings screen or overlay keeps its keys. If editor focus cannot be verified, input passes through.

Custom bindings that Pi owns remain inactive, with the owning action named and no plain-arrow fallback.
In Pi 1.0.4, Ctrl+Shift+Up/Down belong to `tui.altScreen.previousPrompt` and `tui.altScreen.nextPrompt`.
OMPS never rewrites Pi keybindings. Follow the [manual remapping example](SETUP.md#management-navigation-keys),
keep other entries, check `/hotkeys`, then run `/reload`. Some terminals consume modified arrows;
test your pair locally or choose other keys. View shortcuts default to `off`; see [operator settings](#operator-settings).

The widgets never show tool arguments, tool results, the agent's thinking or error logs. OMPS removes terminal control characters from the text. Saved answers appear in inspection and in the result message.

Each observed run also carries two bounded pieces of display text:

- A one-line task label: the submitted task, sanitised to a single line of at most 160 characters.
- A provisional assistant preview: the most recent visible assistant text, sanitised with Markdown line breaks and indentation preserved, capped at 4 KiB of UTF-8. Oversized text is cut and marked `[preview truncated]`. Rapid updates are coalesced to at most five preview refreshes per second per run.

Previews contain visible assistant text only. Tool arguments, raw tool results, hidden thinking, stderr, system history and authentication fields never enter display state. Terminal control characters and direction overrides are removed without changing the saved files.
A preview is provisional. It never proves that a run completed, and it never replaces the saved final answer: `output.md` in the run folder remains the only authoritative result. A stale preview stays labelled provisional after a run ends.

The visible-agent setting bounds the list rows, defaulting to five. Every active root stays reachable through a visible list
or `/omps inspect`; hidden runs continue normally.
The display bounds do not restrict launches; `/omps status` lists every direct owned run.
Finishing one run leaves active siblings visible. Finished runs leave the tree and the list as described above. `/omps inspect` still opens finished runs after they leave. Old previews cannot replace newer work.

### The status line

The status line shows a short entry, for example `omps: reader running` or `omps: 2 active runs`.
The entry clears only when no owned run remains active.

### Checking with a command

Some Pi clients do not show widgets. Use `/omps` or `/omps status` instead. A summary looks like this:

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

The hierarchy lives in the agent tree, the list and the inspection modal. Identical agent names stay distinct through run ids.
List rows are bounded by the visible-agent setting and the tree by 12 lines; the modal lists every retained node without that bound.
Status counts still include all active direct children.

1. Run `/omps inspect` to open the picker of retained nodes.
2. Move with Up/Down. Rows sit beneath their immediate parent, indented by depth.
3. Fold with Left or unfold with Right. Folded rows stay retained.
4. Press Enter to open details.
5. Scroll with Up/Down, PageUp/PageDown or Home/End.
6. Switch agents with Left/Right while details are open.
7. Press Escape to return to the picker with its selection and folds intact.
8. Press Escape again to return to Pi's editor.

Every width uses one column. Both the picker and details keep a margin on all four sides when space permits:

- At widths of at least 40 columns, each side margin is 2 columns. Below 40 columns, side margins are zero.
- At heights of at least 10 rows, the top and bottom margins are 1 blank row each. Below 10 rows, these margins are zero.

The header, body and footer sit inside the margins. The footer hint keeps its row at heights of at least 2 rows.
At height one, the picker shows the selected agent row and omits the footer.

Long task summaries wrap below their agent row, with matching indentation. Each summary uses at most 3 lines.
A summary shortened by that cap ends with an ellipsis. Open details to read the full retained task.
Summaries stay hidden when the available content width is below 30 columns.
Picker observation warnings wrap fully without a separate line cap or ellipsis; the available body still limits visible lines.

A header identifies the selected agent, state and elapsed time.
The scrollable body separates task, current activity, **Live answer · provisional** and **Saved output**.
Each section heading has a blank line before and after it. A heading at the start of the body has no leading blank line.
Answers use Pi's themed Markdown. The footer shows controls and the visible line range when content exceeds the viewport.
Scrolling works while saved reads load or fail, including provisional-only answers.
New content preserves your reading position. Reaching the bottom follows updates until you scroll upwards.
Terminal duration freezes at the retained end time. With no observed tool, details say **No active tool observed**.
Tool names and concurrent counts describe current activity; they provide no complete tool history.

`/omps inspect <run-id>` and Enter on a management row open details directly; Escape closes without a picker step.
Fullscreen mode supports picker-row clicks, including wrapped continuation lines, and mouse-wheel scrolling over the detail body.
Regular mode uses keyboard input because the terminal owns mouse scrollback.
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
4. Choose **Enable**, or **Enable with shipped skill** for Memory when you also need `omms-memory`.
5. Choose a package folder if OMPS finds several valid installations.
6. Enter an installed package folder or published extension entry if detection offers the fallback prompt.
7. Review the exact list changes and YAML destination before confirming.

OMPS first reads `packages` in `<agent-dir>/settings.json`.
The agent directory defaults to `~/.pi/agent`; `PI_CODING_AGENT_DIR` selects another directory.
One valid package skips the path prompt. Several distinct package folders require your choice.
With no usable match, OMPS shows installation guidance and offers manual entry.
Cancelling a package choice or the fallback prompt leaves YAML unchanged.

Detection accepts string sources and objects with a string `source`.
Matching `npm:om-memory-system` and `npm:om-pi-todo` entries resolve under `<agent-dir>/npm/node_modules/`.
A version, range or tag suffix selects the same installed package folder.
Absolute local paths are checked directly; relative paths resolve from the agent directory.
Repeated sources and symbolic links to the same package folder count as one installation.

Parent `autoload: false` and resource filters, such as `extensions: []`, do not hide valid candidates.
Your confirmation approves the child's resources separately. Parent settings stay unchanged.
Detection reads metadata and checks filesystem paths without importing, executing or loading either extension.

**Manual path fallback**

Detection skips sources beginning with `~`, `file://`, git sources and URLs.
An unlisted checkout, project-only package or legacy global npm install also needs manual entry.
Missing, unreadable or invalid Pi settings use this fallback. Unusable package entries are skipped.

1. Use `pi list` to locate the installed package.
2. Enter its absolute package folder or published Pi extension entry path in the prompt.
3. Review the exact resources and YAML destination.
4. Confirm the save, or cancel to leave YAML unchanged.

For a skipped source, supply its installed filesystem path in place of the source string.
If the package is absent, install the required sibling separately, then reopen `/omps-settings`:

```sh
pi install npm:om-memory-system
```

For Todo:

```sh
pi install npm:om-pi-todo
```

OMPS runs neither command and writes nothing to Pi's settings.
Both detection and manual entry validate the package name and its published `pi.extensions` metadata.
**Enable with shipped skill** also requires the published `omms-memory` skill; select another package if it is missing.
The confirmed edit adds `memory` or `todo` to `tools`, and the selected entry to `extensions`.
No separate permission flag or sibling configuration block is needed:

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

Put optional `limits` beside `agents` in `omps/config.yaml`.

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
3. Enter a whole number for limits and visible rows, or type shortcut text such as `ctrl+1`.
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
| Management list                     | Show/Hide; default Show                              | `ui.showManagementList` in that YAML    |
| Management next / enter key         | Pi key specification or `off`; default `down`        | `ui.navigationDownKey` in that YAML     |
| Management previous key             | Pi key specification or `off`; default `up`          | `ui.navigationUpKey` in that YAML       |
| Fleet view shortcut                 | Pi key specification or `off`; default `off`         | `ui.toggleKey` in that YAML             |
| Inspection shortcut                 | Pi key specification or `off`; default `off`         | `ui.inspectKey` in that YAML            |
| Agent capabilities                  | Select an agent, then Memory or Todo                 | That agent's existing YAML lists        |
| Import legacy visible agents        | Offered while a valid legacy value applies           | `ui.maxVisibleAgents` in that YAML      |

Parallel agents and direct children share the same per-parent limit.
The menu shows the selected registry path, including any `OMPS_REGISTRY` override, and labels
the source of the effective visible-agent value: YAML, the legacy display file or the default.
OMPS does not write todo preferences or Pi's `settings.json`.

A saved fleet view applies at once and replaces any session toggle. Management-list visibility also repaints immediately.
Navigation-key and view-shortcut edits need `/reload`.

Type the shortcut as text, for example `ctrl+1`. Spell out the modifier instead of holding Ctrl while entering the key.
Common modifiers are `ctrl`, `shift` and `alt`; `super` is also a valid modifier name.
Separate a modifier and key with `+`. Type `off` to disable a key.
Settings accepts any letter case and spaces around `+`. It converts these modifier spellings:

| Typed modifier                   | Saved modifier |
| -------------------------------- | -------------- |
| `ctrl`, `ctr`, `ctl`, `control`  | `ctrl`         |
| `shift`                          | `shift`        |
| `alt`, `opt`, `option`           | `alt`          |
| `super`, `cmd`, `command`, `win` | `super`        |

For `Control + 1`, the confirmation shows both your text and `ctrl+1`. YAML stores `ctrl+1` after confirmation.
Unknown modifiers, including `meta`, are rejected. Manual YAML edits must use strict Pi modifier names.

Shortcut keys are lowercase Pi key specifications, such as `alt+o`. Tab and Ctrl+I are refused.
Settings checks effective Pi bindings before confirmation and saving, using the same policy as shortcut registration.
A conflict names the owning actions and points to `keybindings.json`, `/hotkeys` and `/reload`.
All enabled OMPS keys must differ after modifier normalisation. Each key can be `off`.
Default Down/Up retain their scoped editor/list use; custom navigation keys must be free of effective Pi actions.
Shortcuts default to `off`. On macOS, Option+O can type `ø` unless the terminal sends Option as Alt.
Set the terminal's Option behaviour before using an Alt shortcut, or choose another key.
See [Restore the Alt keys](SETUP.md#restore-the-alt-keys) for terminal settings and the old `alt+o` and `alt+i` bindings.
[TDR-007](https://github.com/cmdaltctr/om-pi-subagents/blob/main/docs/tdr/007-macos-option-key-and-pi-modifier-order.md) records the existing platform finding.

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
The default destination is `<agent-dir>/omps/config.yaml`. A new `omps/` folder uses mode `0700`; the file uses `0600`.
Settings creates no persona folder. When only the old registry exists, settings shows migration commands and offers no save.
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

| You see                                                            | Cause                                                                                                       | Fix                                                                                                                |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/omps` is not a known command                                     | OMPS did not load.                                                                                          | See [Install](INSTALL.md).                                                                                         |
| `No personas mapped.`                                              | The mapping file has no agents, or does not exist.                                                          | Map an agent. See [Set up agents](SETUP.md).                                                                       |
| An `OMPS:` error about the mapping file                            | The mapping file has an error. New launches stay blocked.                                                   | Fix the field the error names. See [Set up agents](SETUP.md).                                                      |
| `config.yaml: OMPS now reads ... Move your settings:`              | Only the old default registry exists. Listing, launches and settings saves stay blocked.                    | Follow [Move settings into the OMPS folder](INSTALL.md#move-settings-into-the-omps-folder), then run `/omps list`. |
| `agents.<name>.persona: ... resolves inside the OMPS run folder`   | The persona points to saved run evidence, directly or through a symbolic link.                              | Move trusted instructions into `omps/personas/` and update the `persona:` line.                                    |
| `unknown agent "<name>"; mapped agents: ...`                       | The agent name is wrong.                                                                                    | Use a name from `/omps list`.                                                                                      |
| `Usage: /omps list \| run <agent> <task> \| ...`                   | OMPS did not recognise the command, for example a run with no task.                                         | Check the command against the [table](#slash-commands).                                                            |
| `task is required`                                                 | The tool call had no task.                                                                                  | Add a task.                                                                                                        |
| `the task cannot start with a slash, ...`                          | The task starts with `/`.                                                                                   | Reword the task.                                                                                                   |
| `cwd must be an absolute path: ...`                                | The tool's `cwd` is a relative path.                                                                        | Give the full path.                                                                                                |
| `cwd does not exist or is not a directory: ...`                    | The folder is missing.                                                                                      | Check the path.                                                                                                    |
| `session capacity reached ...`                                     | Configured direct-child slots are full.                                                                     | Wait, cancel an owned run, or change `limits.maxConcurrentRuns` in YAML.                                           |
| `no new run can start: run ... may have left processes behind`     | OMPS could not confirm that a run's processes stopped.                                                      | Follow [Blocked after a failed cleanup](#blocked-after-a-failed-cleanup).                                          |
| `unknown run: <run-id>`                                            | The id is wrong, or the run belongs to another session or an earlier load.                                  | Use an id from `/omps`. For an older run, read its run folder.                                                     |
| `child is not ready: tool "<name>" is not registered`              | The name is wrong or the MCP server is missing. Pi 1.0 MCP names use `_` for `-`.                           | Fix the name (`_` for `-`) and the server. See [Set up agents](SETUP.md#tools).                                    |
| `tool "mcp" does not exist; the obsolete MCP proxy was removed...` | The mapping lists the old `mcp` tool.                                                                       | Use native names such as `mcp__<server>__<tool>`.                                                                  |
| `child is not ready: model ... is not in the model registry`       | The agent process does not know the model.                                                                  | Check the model name. For a custom provider, list its extension in the mapping.                                    |
| `child is not ready: model ... has no configured authentication`   | No credentials for that provider.                                                                           | Set up credentials for that provider in Pi.                                                                        |
| `child is not ready: no model is selected`                         | Pi has no model and the mapping names none.                                                                 | Select a model in Pi, or set `model` in the mapping.                                                               |
| `child was not ready within 32000 ms`                              | Start-up took too long, for example a slow MCP server.                                                      | Read `stderr.log`. Try again.                                                                                      |
| `permission violation: <tool> is not approved`                     | The agent tried a tool that is not in its list.                                                             | Add the tool to the mapping if you trust it, or change the persona or task.                                        |
| `provider error: ...` or `provider failed after retries: ...`      | The model provider refused or failed, for example no credentials or no account balance.                     | Check your provider account and network.                                                                           |
| `the response was cut off (stop reason length)`                    | The answer was too long for the model.                                                                      | Ask for a shorter answer, or split the task.                                                                       |
| `run exceeded the total deadline of 1800000 ms`                    | The run took more than 30 minutes.                                                                          | Split the task into smaller runs.                                                                                  |
| `result message not delivered: the owning session has ended`       | The session ended before the run finished.                                                                  | Read `output.md` in the run folder.                                                                                |
| No agent tree shows                                                | `ui.fleetView` is `off`, the runs have finished and left the tree, or your Pi client does not show widgets. | Set `ui.fleetView` in `/omps-settings`, or use `/omps` and the status line.                                        |

Slash command errors start with `OMPS:`. Tool errors go to Pi's model without that prefix.

For any failed run:

1. Type `/omps status <run-id>`.
2. Read the error line.
3. Open `stderr.log` and `events.jsonl` in the run folder for more detail.
4. Fix the cause before you start another run.
