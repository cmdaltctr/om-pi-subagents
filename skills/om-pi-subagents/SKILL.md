---
name: om-pi-subagents
description: Configure and operate OMPS mapped Pi subagents. Use for compact fleet navigation, descendant inspection, /omps-settings, per-agent Memory and Todo controls, YAML limits, parallel or nested delegation, result handoff, subtree cancellation, cleanup failures, and parent/child ownership.
license: MIT
compatibility: Pi with om-pi-subagents installed and operator-managed mappings.
---

# OMPS operations

Read [setup](../../docs/SETUP.md) for configuration.
Use the [usage guide](../../docs/USAGE.md) for tool parameters, result timing and recovery.

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

## Respect configured limits

Use `limits.maxConcurrentRuns` and `limits.maxDepth` from the operator YAML.
Omitted fields default to one. Read the usage guide before proposing edits.

Capacity counts starting, running and stopping direct children of each immediate parent.
An excess launch fails immediately. Wait, cancel an owned run, or ask the operator to change capacity.
There is no machine-wide budget; branching can multiply the provider and process load.

The root is depth zero. `maxDepth: 0` disables launches while listing and status remain available.
Each launch adds one depth. A branch keeps its inherited depth ceiling and also respects fresh YAML.
Raising depth permits new root branches; it does not expand an existing branch's permission.
Nesting requires exact `omps` approval in the delegator's mapping.

## Operator settings

Ask the operator to run `/omps-settings` when a setting needs changing.
`/subagents-settings` is an alias. Native dialogs work in interactive Pi and supported RPC clients.
The command is outside the model-callable tool. It requires UI dialogs before reading files.

| Setting                             | Valid values                                 | Storage                             |
| ----------------------------------- | -------------------------------------------- | ----------------------------------- |
| Maximum nesting depth               | Safe integer of at least 0; root depth 0     | Registry `limits.maxDepth`          |
| Parallel direct children per parent | Safe integer of at least 1                   | Registry `limits.maxConcurrentRuns` |
| Visible agents                      | Safe integer from 1 to 256; default 5        | Registry `ui.maxVisibleAgents`      |
| Fleet view                          | `expanded`, `collapsed` or `off`             | Registry `ui.fleetView`             |
| Fleet list / inspection shortcut    | Pi key specification or `off`; default `off` | Registry `ui.toggleKey/inspectKey`  |
| Agent capabilities                  | Select agent, then Memory or Todo            | That agent's existing YAML lists    |

The menu shows the resolved registry destination, including `OMPS_REGISTRY` overrides.
YAML owns limits and UI fields. A valid legacy visible-row value remains read-only fallback
until the operator confirms its import into YAML. Neither edit writes the old display JSON.
Shortcut changes require `/reload`. Visible-row changes repaint immediately.
OMPS never writes sibling preferences or Pi's `settings.json`.

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
Press Down in an empty prompt to select an agent. Up and Down move, Enter inspects and Escape returns to the prompt.
Outside that selection, Up and Escape keep their Pi actions. The view shortcuts default to `off`; use `/omps inspect` or set keys.
The tree uses at most 12 lines, running agents first. The list shows five rows by default with more markers.
`omps list` gives the model every tool name; `/omps list` and the collapsed tool row show a tool count per agent.
Incomplete descendant observations stay labelled. A hidden row is still reachable by scrolling.

Pi's native `app.tools.expand` action (Ctrl+O by default) expands transcript output only.
Launch acknowledgements stay compact; native expansion never creates another live tree.

1. Run `/omps inspect` to open the current session's retained tree.
2. Use arrows to choose a node, Left/Right to fold branches, and Enter to open details.
3. Use PageUp or PageDown to scroll selected output.
4. Press Escape to return or close without stopping work.

`/omps inspect <run-id>` opens a selected node directly. Fullscreen supports row clicks; regular mode uses keys.
The modal retains descendants in parent-first order. Narrow terminals show tree and details in sequence.
Selected previews contain visible assistant text only, capped at 4 KiB and labelled provisional.
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

To enable either later, ask the operator to select **Agent capabilities** in `/omps-settings`.
Choose one mapped agent, then Memory or Todo, and provide an installed package folder or published Pi entry.
Confirm the exact `tools`, `extensions` and optional `skills` changes for that agent.
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
