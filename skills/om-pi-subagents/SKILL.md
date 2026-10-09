---
name: om-pi-subagents
description: Configure and operate OMPS mapped Pi subagents. Use for proactive delegation of substantial tasks with separable investigation, interactive at-mention launches, compact fleet navigation, descendant inspection, /omps-settings, per-agent Memory and Todo controls, YAML limits, parallel or nested delegation, result handoff, subtree cancellation, cleanup failures, and parent/child ownership.
license: MIT
compatibility: Pi with om-pi-subagents installed and operator-managed mappings.
---

# OMPS operations

Read [setup](../../docs/SETUP.md) for configuration.
Use the [usage guide](../../docs/USAGE.md) for tool parameters, result timing and recovery.

Operator settings live in `<agent-dir>/omps/config.yaml`, with personas in `omps/personas/` and saved evidence in `omps/runs/`.
`OMPS_REGISTRY` selects another file. If only the old default registry exists, OMPS blocks listing, launches and settings saves
and prints migration commands. Ask the operator to follow [the migration guide](../../docs/INSTALL.md#move-settings-into-the-omps-folder).
Never move operator files automatically or map persona instructions from run evidence.

## Choose useful work proactively

For substantial tasks with separable work, discover mapped agents and proactively delegate a suitable bounded investigation.
Give each child a clear task and expected result. Delegate without waiting for a user reminder.
Delegate review, audit or security work only when the user asks for it. You may suggest one.
Keep simple tasks local. Honour explicit user requests to avoid subagents.
Do not require discovery or a launch for every request, or a fixed number of subagents.

Select only from fresh `omps list` output and match the task to the target's approved tools.
Check current-session `status` before adding runs. Report an empty, invalid or unsuitable mapping;
continue permitted local work where possible. Never invent agents, grant tools or change settings without permission.
Verify the working folder and avoid shared-file conflicts between parallel writers.
Respect configured concurrency, inherited depth ceilings and cleanup blocks.
Follow the waiting or recovery guidance below without repeated launch attempts or unauthorised limit changes.

Wait for the separate result before relying on findings. Assess it against the task and available evidence;
retain failed or partial labels. The parent owns the final answer and parent task updates.
Continue independent work while a child runs.

Pi supplies short built-in rules in its default system prompt when `omps` is active and the host includes its guidance,
without loading this skill. Replacement prompts or omitted tool guidance can leave these rules out.
Guidance does not guarantee model compliance. The model chooses launches; OMPS starts no child or model request at session startup.
Loading this skill grants no tools.

## Start a run

1. Call `omps` with `{ "action": "list" }`. Pick a target only from that result.
2. Call `{ "action": "status" }` to see current-session runs.
3. If no personas are mapped, report that and point to the setup guide. Ask permission before creating personas or editing live YAML.
4. Verify the working directory before a write-capable launch. Use separate worktrees for parallel writers.
5. Call `omps` with action `run`, the mapped `agent` and the `task`. Set `cwd` to a verified absolute directory when needed.
6. Keep the returned run id for status and cancellation.

A listing marks write-capable agents and the targets of each delegator. Each target keeps its own tools.
The task must contain text and cannot start with a slash. Never invent a persona or assume a model.
The skill cannot bypass the child guard.

## At-mention launch

In Pi's interactive terminal, the operator types `@reader Summarise the README` to launch the mapped agent `reader`.
It shares `/omps run` validation, limits, acknowledgement and result delivery, and sends no routing request to the model.
Unmapped names with `/` or `.`, such as `@README.md`, stay file references. Unknown bare names show the mapped names.
RPC and extension input never launch. A delegating agent must call the approved `omps` tool. See the [usage guide](../../docs/USAGE.md#at-mention-launch).

## Respect limits

`limits.maxConcurrentRuns` and `limits.maxDepth` default to one. Capacity counts starting, running and stopping direct children of each parent.
An excess launch fails at once. Wait, cancel an owned run, or ask the operator to raise capacity. Branching multiplies process and provider load.

The root is depth zero. `maxDepth: 0` disables launches. A branch keeps its inherited depth ceiling and also respects fresh YAML.
Nesting needs exact `omps` approval and a `delegates` list in the delegator's mapping. A launch outside that list is refused before any process starts.
Do not retry the same target. Inside a restricted child, `omps list` shows only the targets it may start.
Ask the operator to edit `delegates`; you cannot.

## Operator settings

Ask the operator to run `/omps-settings` (alias `/subagents-settings`). It is not a model tool and needs native dialogs.
Each edit asks for confirmation. A cancelled input changes nothing. Full tables and key rules are in the [setup guide](../../docs/SETUP.md).

| Setting                                  | Values                                   | YAML                             |
| ---------------------------------------- | ---------------------------------------- | -------------------------------- |
| Maximum nesting depth                    | Integer of at least 0                    | `limits.maxDepth`                |
| Parallel direct children per parent      | Integer of at least 1                    | `limits.maxConcurrentRuns`       |
| Visible agents                           | 1 to 256, default 5                      | `ui.maxVisibleAgents`            |
| Fleet view                               | `expanded`, `collapsed` or `off`         | `ui.fleetView`                   |
| Management list                          | Show or Hide, default Show               | `ui.showManagementList`          |
| Management next and previous keys        | Pi key or `off`, default `down` and `up` | `ui.navigationDownKey/UpKey`     |
| Fleet view shortcut, inspection shortcut | Pi key or `off`, default `off`           | `ui.toggleKey`, `ui.inspectKey`  |
| Result shortcut                          | Pi key or `off`, default `ctrl+shift+e`  | `ui.resultKey`                   |
| Agent capabilities                       | Pick an agent, then Memory or Todo       | That agent's existing YAML lists |

The fleet view and inspection shortcuts default to `off`; use `/omps inspect` until the operator sets keys.
Shortcut and navigation-key changes need `/reload`. Limits and visible-agent changes apply at once to new launches.
Existing runs continue. Warn the operator that higher limits multiply load before they raise them.
Type keys as text such as `ctrl+1`. Unknown modifiers, including `meta`, are rejected.
On macOS, Option can type a character instead of Alt. Point the operator to [the terminal fix](../../docs/SETUP.md#restore-the-alt-keys).
Never edit live operator files, Pi's `settings.json` or Pi keybindings automatically.

## Navigate the fleet and inspect runs

The `● Agents` tree above the editor shows running agents. `ui.fleetView` sets it, and `/omps fleet` switches it for the session.
A Management list below the editor lets the operator select runs: Press Down in an empty focused prompt, use Up and Down to move,
Enter to inspect, Escape to return. `ui.showManagementList: false` hides the list and frees its keys.
Custom `ui.navigationDownKey` and `ui.navigationUpKey` that Pi already uses stay inactive, with the owning action named.

Pi 1.0.4 binds Ctrl+Shift+Up and Ctrl+Shift+Down to `tui.altScreen.previousPrompt` and `tui.altScreen.nextPrompt` in fullscreen.
OMPS never rewrites Pi keybindings. Point the operator to [the manual remap](../../docs/SETUP.md#management-navigation-keys)
and tell them to check their terminal and run `/reload`.

`/omps inspect` opens a picker of retained runs, parents first. Enter opens single-column details.
Scroll with Up and Down, PageUp and PageDown, or Home and End. Fullscreen also supports the mouse wheel; regular mode uses keys.
Live answers are provisional and capped at 4 KiB. Saved output is the proof of completion.
Inspection reads only validated `config.json` and `output.md` (64 KiB each), never persona, authentication, event or stderr files.
It grants no status or cancel rights over another immediate parent's runs. Tasks and outputs can hold sensitive text.

## Receive and assess results

A launch returns at once. Wait for the separate result message instead of sending repeated prompts.
Each result goes to its immediate parent. A delegating child waits for its owned runs before it settles.
A run is completed only with a saved answer, a clean exit and confirmed cleanup.

Interactive Pi folds long results after eight answer lines. Errors and partial-output notes stay visible.
Ctrl+Shift+E (`ui.resultKey`) toggles all OMPS results; Ctrl+O is Pi's host action. Folding changes the display only.
Read the same delivered text or the saved `output.md` when you assess a result.

Treat failed output as partial. Read the error and saved evidence before you retry.
A delivery failure leaves a completed run's outcome unchanged. Cancelled runs send no result message.

## Cancel and handle uncertain cleanup

1. Find the owned run id through `status`.
2. Call `omps` with action `cancel` and that `runId`.
3. Wait for a terminal state before you assume the subtree has stopped.
4. If cleanup is unconfirmed, report the block and follow the usage guide's recovery steps.

Cancellation stops the owned subtree and leaves siblings running. Spare capacity cannot bypass a cleanup block.
Never start another run to work around one. Never claim completion from partial output.

## Memory and Todo

Both are Off for new agent mappings. Existing explicit mappings stay in effect.
A child gets real OMMS or `om-pi-todo` only through its own mapped extension and exact `memory` or `todo` tool.
Approval of `memory` covers the whole tool, including write and portability modes.
Each child starts with an empty local todo list in normal mode. It never copies parent tasks or OpenSpec bindings.

To enable one, ask the operator to:

1. Run `/omps-settings`, choose **Agent capabilities**, then the agent, then Memory or Todo.
2. Select **Enable**. For Memory, **Enable with shipped skill** adds `omms-memory`.
3. Choose an installation if several are found, or enter an installed path if asked.
4. Confirm the exact resources and YAML destination.

**On (configured)** reports the mapping, not backend health. **Partial** needs a correction. **Disable** removes the extension, skill and tool together.
An admitted child keeps its captured mapping. Never install packages or run an extension for discovery.

The parent can search memory before it delegates and pass the child only verified context.
After you check the saved result and cleanup, update the parent's todo through its own tool.
Record useful verified knowledge through the parent's real memory tool. A child's own capture is not verified completion.

## Load this skill in a child

Map this installed `SKILL.md` in the child's `skills` list. Use the package folder shown by `pi list`.
Ambient child skills stay disabled. Loading this skill grants no tools.
Use only the exact approved `omps`, `memory` and `todo` tool names.
