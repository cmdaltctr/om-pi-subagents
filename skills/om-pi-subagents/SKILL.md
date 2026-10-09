---
name: om-pi-subagents
description: Configure and operate OMPS mapped Pi subagents. Use for proactive delegation of substantial tasks with separable investigation, interactive at-mention launches, compact fleet navigation, descendant inspection, /omps-settings, per-agent Memory and Todo controls, YAML limits, parallel or nested delegation, result handoff, subtree cancellation, cleanup failures, and parent/child ownership.
license: MIT
compatibility: Pi with om-pi-subagents installed and operator-managed mappings.
---

# OMPS operations

Read [setup](../../docs/SETUP.md) for configuration.
Use the [usage guide](../../docs/USAGE.md) for tool parameters, result timing and recovery.

Operator settings default to `<agent-dir>/omps/config.yaml`, with personas in `omps/personas/`
and saved evidence in `omps/runs/`. Map personas as `./personas/<name>.md`.
`OMPS_REGISTRY` still selects another file. If only the old default registry exists, OMPS
blocks listing, launches and settings saves with migration commands. Ask the operator to follow
[the migration guide](../../docs/INSTALL.md#move-settings-into-the-omps-folder).
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

## Discover before delegating

1. Call `omps` with `{ "action": "list" }`.
2. Select a target only from that returned mapping.
3. Check current-session runs with `{ "action": "status" }` before starting more work.
4. If no personas are mapped, report that and point to the setup guide.
5. Ask permission before creating personas or changing the operator's live YAML.

A listing identifies direct write-capable tools and approved delegation.
A delegator can select a mapped write-capable target. Each target keeps its own tools.
This skill grants no tools and cannot bypass the child guard.

## Start work safely

1. Confirm the task and the target's approved tools.
2. Verify the working directory before a write-capable launch.
3. Use separate safe worktrees when parallel writers could change the same files.
4. Call `omps` with action `run`, the mapped `agent`, and the requested `task`.
5. Set `cwd` to a verified absolute directory when the current directory is unsuitable.
6. Keep each returned run id for status and cancellation.

The task must contain text and cannot start with a slash.
Use the operator's selected model or the immediate parent's inherited model.
Never invent a persona, assume a model or grant additional resources to make a task fit.

## Operator at-mention launch

Use `@<agent> <task>` in Pi's interactive terminal interface.
See the [usage guide](../../docs/USAGE.md#at-mention-launch).

1. Type `@` at the very start of the first editor line.
2. Choose a mapped agent, or type its name.
3. Add the task after the space.
4. Submit the line.

For a mapped `reader`, use `@reader Summarise the README`.
Completion labels contain names only. Pi's file items keep their order.
Selecting an agent leaves one space and the cursor ready for the task.
Completion requires the cursor to remain in the first word on editor line zero.
Pi trims submitted text, so leading spaces still allow launch.

The shortcut shares `/omps run` validation, capacity and depth limits, acknowledgement and result delivery.
It uses Pi's current working folder. No parent model request routes the launch;
child model calls and later result-triggered parent turns keep their existing behaviour.
Unknown bare names show mapped names. A mapped name without a task shows usage.
Neither case launches or reaches the model.

Unmapped names containing `/` or `.` keep file-reference behaviour, including `@README.md` and `@src/x.ts`.
Use `@./docs` for a directory; unknown bare `@docs` shows guidance.
A mapped bare name takes the agent route. Ordinary text and mid-sentence mentions pass through.
An initial-`@` registry failure shows an error and sends nothing to the model; fix the reported field before retrying.

Only interactive input in terminal mode (`tui`) launches. RPC and extension-origin input pass through.
An agent must call the approved `omps` tool to delegate; sending `@agent` text from an extension does not launch it.
This shortcut changes no YAML field or tool approval.

## Respect configured limits

Use `limits.maxConcurrentRuns` and `limits.maxDepth` from the operator YAML.
Omitted fields default to one. Read the usage guide before proposing edits.

Capacity counts starting, running and stopping direct children of each immediate parent.
An excess launch fails immediately. Wait, cancel an owned run, or ask the operator to change capacity.
There is no machine-wide budget; branching can multiply the provider and process load.

The root is depth zero. `maxDepth: 0` disables launches while listing and status remain available.
Each launch adds one depth. A branch keeps its inherited depth ceiling and also respects fresh YAML.
Raising depth permits new root branches; it does not expand an existing branch's permission.
Nesting requires exact `omps` approval and a `delegates` list in the delegator's mapping.
A nested launch must name an agent in that list, in both the list the branch started with and fresh YAML.
A refusal names the agent, the target and the allowed targets; it starts no process. Do not retry the same target.
The `omps list` result inside a restricted child shows only the targets it may start.
Ask the operator to edit `delegates` in YAML when a needed target is missing; you cannot change it.

## Operator settings

Ask the operator to run `/omps-settings` when a setting needs changing.
`/subagents-settings` is an alias. Native dialogs work in interactive Pi and supported RPC clients.
The command is outside the model-callable tool. It requires UI dialogs before reading files.

| Setting                                   | Valid values                                          | Storage                             |
| ----------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| Maximum nesting depth                     | Safe integer of at least 0; root depth 0              | Registry `limits.maxDepth`          |
| Parallel direct children per parent       | Safe integer of at least 1                            | Registry `limits.maxConcurrentRuns` |
| Visible agents                            | Safe integer from 1 to 256; default 5                 | Registry `ui.maxVisibleAgents`      |
| Fleet view                                | `expanded`, `collapsed` or `off`                      | Registry `ui.fleetView`             |
| Management list                           | Show/Hide; default Show                               | Registry `ui.showManagementList`    |
| Management next / enter key               | Pi key specification or `off`; default `down`         | Registry `ui.navigationDownKey`     |
| Management previous key                   | Pi key specification or `off`; default `up`           | Registry `ui.navigationUpKey`       |
| Fleet view shortcut / inspection shortcut | Pi key specification or `off`; default `off`          | Registry `ui.toggleKey/inspectKey`  |
| Result shortcut                           | Pi key specification or `off`; default `ctrl+shift+e` | Registry `ui.resultKey`             |
| Agent capabilities                        | Select agent, then Memory or Todo                     | That agent's existing YAML lists    |

The menu shows the resolved registry destination, including `OMPS_REGISTRY` overrides.
YAML owns limits and UI fields. A valid legacy visible-row value remains read-only fallback
until the operator confirms its import into YAML. Neither edit writes the old display JSON.
Shortcut and navigation-key changes require `/reload`. Settings distinguishes saved keys from active keys until reload.
Visible-row and Management list changes repaint immediately. Hide ends selection without changing the tree.
OMPS never writes sibling preferences or Pi's `settings.json`.

Ask the operator to type shortcut text such as `ctrl+1` in the input dialog.
Spell out the modifier instead of holding Ctrl while entering the key.
Common modifiers are `ctrl`, `shift` and `alt`; `super` is also a valid modifier name.
Settings accepts any letter case and spaces around `+`. It converts `ctr`, `ctl` and `control` to `ctrl`,
`opt` and `option` to `alt`, and `cmd`, `command` and `win` to `super`.
The confirmation shows the converted key and the typed text when they differ; YAML stores the converted key.
Unknown modifiers, including `meta`, are rejected. Type `off` to disable a key. YAML uses strict Pi modifier names.
Settings checks effective Pi conflicts before confirmation or saving and names the owning actions in its guidance.
The same policy runs at registration, preserving the permitted direction-specific default Up/Down overlaps.
On macOS, Option can produce a character instead of Alt input. Ask the operator to set Option to send Alt,
or choose another key. See [terminal settings](../../docs/SETUP.md#restore-the-alt-keys) and
[the existing TDR-007](https://github.com/cmdaltctr/om-pi-subagents/blob/main/docs/tdr/007-macos-option-key-and-pi-modifier-order.md).

Each edit requires confirmation. A cancelled input or declined save leaves that setting unchanged;
earlier confirmed saves remain in effect. A missing registry requires explicit creation confirmation and starts with `agents: {}`.
Malformed files require correction. On a conflict, reopen settings before saving.
Private temporary files, atomic replacement and per-destination locks protect concurrent saves.
Failed writes leave the existing destination and display cache unchanged.

Fresh launches use saved limits. Existing runs continue, while inherited branch ceilings remain in force.
Depth zero disables new launches. Explain that per-parent branching can multiply process and provider load before increasing limits.

## Navigate the fleet and inspect saved evidence

The `● Agents` tree above the editor shows each running agent by default (`ui.fleetView: expanded`), adapted from tintinweb/pi-subagents. A list below the editor offers navigation.
Set `ui.fleetView` to `collapsed` for the tree heading only, or `off` to hide both widgets. `/omps fleet` switches the view for the session.
Press Down in an empty focused prompt to select an agent. Up and Down move, Enter inspects and Escape returns to the prompt.
`ui.navigationDownKey` and `ui.navigationUpKey` default to `down` and `up`; either accepts another safe Pi key or `off`.
Hints show active keys. With Down off or inactive, keys cannot enter selection. Settings, selectors and overlays keep their keys.
If actual editor focus cannot be verified, pass input through and use `/omps inspect`.
Outside selection, Up and Escape keep their Pi actions. The view shortcuts default to `off`; use `/omps inspect` or set keys.

Choose **Management list: Hide** in `/omps-settings`, or set `ui.showManagementList: false`, for tree-only monitoring.
This boolean defaults to true. Hide removes list rows and hints, ends selection and releases its keys immediately.
The expanded above-editor tree and `/omps inspect` remain available. Session fleet toggles preserve the saved list preference.

Custom navigation keys occupied by Pi stay inactive; name the action and give recovery guidance without a fallback.
Pi 1.0.4 binds Ctrl+Shift+Up/Down to `tui.altScreen.previousPrompt` and `tui.altScreen.nextPrompt`.
OMPS never rewrites Pi keybindings. Ask the operator to merge the manual example in
[setup](../../docs/SETUP.md#management-navigation-keys), preserve other entries, check `/hotkeys`, then run `/reload`.
Terminal reporting varies; test modified arrows locally or choose other keys. Do not edit live operator files automatically.
The tree uses at most 12 lines, running agents first. The list shows five rows by default with more markers.
`omps list` gives the model every tool name; `/omps list` and the collapsed tool row show a tool count per agent.
Incomplete descendant observations stay labelled. A hidden row is still reachable by scrolling.

Pi's native `app.tools.expand` action (Ctrl+O by default) expands transcript output only.
Launch acknowledgements stay compact; native expansion never creates another live tree.

1. Run `/omps inspect` to open the retained-node picker.
2. Use Up/Down to choose; Left/Right folds branches. Enter opens single-column details.
3. Scroll details with Up/Down, PageUp/PageDown or Home/End, including while saved reads load or fail.
4. Use Left/Right in details to switch visible picker nodes.
5. Press Escape to return to the picker, then Escape again to close.

`/omps inspect <run-id>` and management-list inspection open details directly; Escape closes them.
Every width uses one column. Fullscreen supports picker-row clicks and wheel scrolling over the detail body;
regular mode uses keys because the terminal owns mouse scrollback.
The modal retains descendants in parent-first order. Live updates preserve reading position;
reaching the bottom follows new content until you scroll upwards. The footer reports the visible line range.
Pi's theme styles sections and Markdown answers. Details show task, current observed tools, elapsed time,
Live answer · provisional and Saved output. No active tool observed means no current tool evidence;
current names/counts never imply complete tool history. Terminal elapsed time stays frozen at the end time.
Selected previews preserve visible Markdown line breaks and indentation, capped at 4 KiB and labelled provisional.
Terminal controls and direction overrides are removed; hidden thinking and raw tool results stay excluded.
Only saved output after a clean exit and confirmed cleanup proves completion. Older or missing evidence remains labelled.
Supported RPC clients receive bounded text rather than a terminal modal.
Inspection never grants status or cancellation over another immediate parent's child.

Selected reads open only validated `config.json` and `output.md`, capped at 64 KiB each.
Missing evidence is unavailable. Failed or cancelled output stays partial, and truncation points to the saved file.
Persona files, authentication files, raw event logs and stderr are not opened.
Tasks and outputs can contain sensitive text. Check them before sharing screenshots or RPC responses.
Inspection starts no process or model turn and leaves sibling widgets separate.

## Receive and assess results

A launch returns immediately. Wait for its separate result message rather than sending repeated prompts.
Status is available through the existing run id. Commands see only the caller's direct owned runs.

Interactive Pi folds long results after eight answer lines, counted before terminal wrapping.
The heading, files line and `Result:` label stay visible. Errors and partial-output notes remain visible too.
Short results show in full without a fold hint.
The hint shows the hidden-line count, the active Result shortcut and always the host expansion key as a fallback.

Ask the operator to press Ctrl+Shift+E to toggle every OMPS result in the session.
`ui.resultKey` defaults to `ctrl+shift+e`; **Result shortcut** in `/omps-settings` accepts another free key or `off`.
Saved key edits need `/reload`. Fleet and inspection shortcuts remain `off` by default.
Pi's host `app.tools.expand` action, Ctrl+O by default, also expands results and retains its tool-output behaviour.
Each action toggles its own state. Both must be off to fold results; either enabled state also expands later results.
The result shortcut leaves unrelated tool output unchanged, and its state resets at session end or reload.

Ctrl+Shift+E needs extended-key reporting through kitty CSI-u or xterm `modifyOtherKeys`.
Without confirmed kitty support, OMPS warns that support is unverified and keeps a conflict-free result binding active.
Raw Ctrl+E retains Pi's editor line-end action. Use the host key in the hint if the terminal drops Shift.
An effective Pi conflict leaves the result key inactive with guidance. Never edit live host keybindings automatically.

Folding changes only the terminal display. Read the same delivered content or saved `output.md` when assessing a result.
The model-facing text, 4000-character answer limit and delivery record stay unchanged.
JSON, print and RPC result content retains its existing behaviour.

Each result reaches its immediate parent. A delegating child waits for owned runs and delivery attempts
before its final answer can settle. Completed output requires a saved answer, clean exit and confirmed cleanup.

Treat failed output as partial. Read the error and saved evidence before deciding whether to retry.
A delivery failure leaves a completed run's outcome unchanged; check its saved `output.md`.
Cancelled runs send no automatic result message.

## Cancel and handle uncertain cleanup

1. Find the owned run id through status.
2. Call `omps` with action `cancel` and that `runId`.
3. Wait for a terminal state before assuming its subtree has stopped.
4. If cleanup is unconfirmed, report the block and follow the usage guide's recovery procedure.

Cancellation stops the owned subtree and leaves unrelated siblings running.
Shutdown closes admission before cancelling owned work. Spare capacity cannot bypass a cleanup block.
Never start another run to work around unconfirmed cleanup or claim completion from partial output alone.

## Keep Memory and Todo optional and locally owned

New agent mappings have both capabilities Off. Existing explicit mappings stay in effect.
The parent owns its memory decisions and normal tasks or linked OpenSpec checklist.
A child loads real OMMS or `om-pi-todo` only through its own mapped extension and exact `memory` or `todo` tool.
The todo list starts empty in normal mode. Siblings and grandchildren have separate local task ids.

To enable either later:

1. Ask the operator to select **Agent capabilities** in `/omps-settings`.
2. Choose one mapped agent, then Memory or Todo.
3. Select **Enable**, or **Enable with shipped skill** for Memory when `omms-memory` is needed.
4. Choose an installation if detection finds several valid package folders.
5. Supply an absolute installed package folder or published Pi extension entry if the fallback prompt appears.
6. Confirm the exact resources and YAML destination for that agent.

OMPS first checks `packages` in `<agent-dir>/settings.json`.
`PI_CODING_AGENT_DIR` selects the agent directory; its default is `~/.pi/agent`.
String entries and objects with a string `source` are accepted.
Matching npm sources resolve under `<agent-dir>/npm/node_modules/`; version, range and tag suffixes use the installed folder.
Relative local paths resolve against the agent directory. Absolute local paths are checked directly.
One valid package skips the path prompt; several distinct roots require the operator's choice.
Parent `autoload` and resource filters do not restrict this separately confirmed child mapping.

With no usable match, OMPS shows installation guidance and offers manual entry.
Unlisted checkouts, project-only packages and legacy global npm installs need that fallback.
Detection skips `~`, `file://`, git and URL sources; supply their absolute installed filesystem paths.
Missing, unreadable or invalid settings also use the fallback. Cancelling leaves YAML unchanged.
Detection reads metadata without importing, executing or loading either sibling extension.
Never execute an extension for discovery or install a package on the operator's behalf.
Memory can include its shipped `omms-memory` skill. Whole-tool `memory` approval includes write and portability modes.
**On (configured)** reports the mapping, not backend health. **Partial** needs correction of missing or ambiguous resources.
The helper never installs packages or changes OMMS stores, todo preferences or parent Pi settings.
**Disable** removes the recognised extension, skill and exact tool together for future launches.
An admitted child keeps its captured mapping. Descendant targets do not inherit the delegator's switch state.

The parent can search memory before a bounded delegation. Give the child only verified context.
OMMS owns child recall, manual tool use and configured capture. A child's capture is not verified completion.
After checking the saved result and cleanup, explicitly update the parent's todo through its own tool
and current revision. Record useful verified knowledge through the parent's real memory tool when appropriate.
Children must update or explain their own in-progress tasks so reminder continuations can finish.
Never copy parent tasks, sync bindings or global preferences into child lists.

## Explicit child skill loading

Map this installed `SKILL.md` through the child's `skills` list to make these instructions available there.
Use the package folder shown by `pi list`. Ambient child skills stay disabled.
Loading this skill grants no tools. Use only the exact approved `omps`, `memory` and `todo` tool names.
