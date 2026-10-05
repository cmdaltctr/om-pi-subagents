---
name: om-pi-subagents
description: Configure and operate OMPSS mapped Pi subagents. Use for live agent trees, read-only inspection, operator settings, OMPSS YAML limits, parallel or nested delegation, subagent results, subtree cancellation, cleanup failures, and todo ownership in OMPSS children.
license: MIT
compatibility: Pi with om-pi-subagents installed and operator-managed mappings.
---

# OMPSS operations

Read [setup](../../docs/SETUP.md) for configuration.
Use the [usage guide](../../docs/USAGE.md) for tool parameters, result timing and recovery.

## Discover before delegating

1. Call `ompss` with `{ "action": "list" }`.
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
4. Call `ompss` with action `run`, the mapped `agent`, and the requested `task`.
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
Nesting requires exact `ompss` approval in the delegator's mapping.

## Operator settings

Ask the operator to run `/subagents-settings` when a setting needs changing.
This command uses native dialogs in interactive Pi and supported RPC clients. It is outside the model-callable tool.
It accepts no extra arguments and requires UI dialogs before reading files.

| Setting                             | Valid values                             | Storage                                 |
| ----------------------------------- | ---------------------------------------- | --------------------------------------- |
| Maximum nesting depth               | Safe integer of at least 0; root depth 0 | Registry `limits.maxDepth`              |
| Parallel direct children per parent | Safe integer of at least 1               | Registry `limits.maxConcurrentRuns`     |
| Visible agents                      | Safe integer from 1 to 256; default 4    | `<config-dir>/pi-subagents/config.json` |

The menu shows the resolved registry destination, including `OMPSS_REGISTRY` overrides.
The display config uses absolute `XDG_CONFIG_HOME`, otherwise `~/.config`.
Execution limits stay in YAML. OMPSS never writes todo preferences or Pi's `settings.json`.

Each edit requires confirmation. A cancelled input or declined save leaves that setting unchanged;
earlier confirmed saves remain in effect. A missing registry requires explicit creation confirmation and starts with `agents: {}`.
Malformed files require correction. On a conflict, reopen settings before saving.
Private temporary files, atomic replacement and per-destination locks protect concurrent saves.
Failed writes leave the existing destination and display cache unchanged.

Fresh launches use saved limits. Existing runs continue, while inherited branch ceilings remain in force.
Depth zero disables new launches. Explain that per-parent branching can multiply process and provider load before increasing limits.

## View trees and inspect saved evidence

Ask the operator to use Pi's native `app.tools.expand` action, default Ctrl+O, to expand run cards.
The hint follows configured keys. Tool launches and TUI slash launches show the same hierarchy.
The visible-agent preference bounds expanded cards and the compact widget. Status counts stay complete.
Missing observation evidence stays labelled incomplete; display state cannot decide completion or permit a launch.

1. Run `/ompss inspect` to choose a retained node in the current session.
2. Select with arrows and press Enter for its saved task and output.
3. Use PageUp or PageDown to scroll details.
4. Press Escape to close the viewer without stopping work.

`/ompss inspect <run-id>` opens a selected node directly. Fullscreen supports row clicks; regular mode uses keys.
Hidden retained nodes remain keyboard-accessible. Supported RPC clients receive bounded text.
Inspection follows verified descendant ownership, but status and cancellation remain immediate-parent actions.
Never use an observed descendant id as authority to control that run from an ancestor.

Selected reads open only validated `config.json` and `output.md`, capped at 64 KiB each.
Missing evidence is unavailable. Failed or cancelled output stays partial, and truncation points to the saved file.
Persona files, authentication files, raw event logs and stderr are not opened.
Tasks and outputs can contain sensitive text. Check them before sharing screenshots or RPC responses.
The inspector starts no process, sends no model turn and leaves todo widgets and preferences separate.

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
2. Call `ompss` with action `cancel` and that `runId`.
3. Wait for a terminal state before assuming its subtree has stopped.
4. If cleanup is unconfirmed, report the block and follow the usage guide's recovery procedure.

Cancellation stops the owned subtree and leaves unrelated siblings running.
Shutdown closes admission before cancelling owned work. Spare capacity cannot bypass a cleanup block.
Never start another run to work around unconfirmed cleanup or claim completion from partial output alone.

## Keep todo ownership separate

The parent owns its normal tasks or linked OpenSpec checklist.
A child uses the real `om-pi-todo` extension only when its mapping lists that extension and approves `todo`.
Its list starts empty in normal mode. Siblings and grandchildren have separate local task ids.

Subagent completion never checks a parent's task automatically.
After verifying the result, explicitly update the parent's todo through its own tool and current revision.
Children must update or explain their own in-progress tasks so real reminder continuations can finish.
Never copy parent tasks, sync bindings or global preferences into child lists.

## Explicit child skill loading

Map this installed `SKILL.md` through the child's `skills` list to make these instructions available there.
Use the path from the package folder shown by `pi list`. Ambient child skills stay disabled.
The skill supports the existing list, run, status and cancel actions; it adds no fleet or scheduling commands.
