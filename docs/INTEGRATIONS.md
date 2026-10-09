# Todo and memory

OMPS works with two sibling packages. Both are optional and off for every agent.

| Package                                                                     | Gives a child               | Tool     |
| --------------------------------------------------------------------------- | --------------------------- | -------- |
| [`om-pi-todo`](https://www.npmjs.com/package/om-pi-todo)                    | Its own task list           | `todo`   |
| [OMMS (`om-memory-system`)](https://www.npmjs.com/package/om-memory-system) | Project memory, with recall | `memory` |

OMPS never installs these packages, never reads their stores and never writes to them.
Without them, OMPS runs as normal.

## Turn one on for an agent

1. Install the package: `pi install npm:om-pi-todo` or `pi install npm:om-memory-system`.
2. Run `/omps-settings` and choose **Agent capabilities**.
3. Choose the agent, then **Todo** or **Memory**.
4. Choose **Enable**. For Memory, **Enable with shipped skill** also maps the `omms-memory` skill.
5. Pick the package folder if several match. Enter its path if OMPS finds none.
6. Check the resources and the YAML destination, then confirm.

The edit adds three things to that one agent in `config.yaml`: the exact tool name, the package's extension and, if you chose it, the skill.

```yaml
agents:
  researcher:
    persona: ./personas/researcher.md
    tools: [read, memory]
    thinking: off
    extensions:
      - /path/to/om-memory-system/dist/adapters/pi/extension.js
```

The change applies to the next launch. A running child keeps the mapping it started with.

OMPS finds packages by reading `packages` in `<agent-dir>/settings.json`. It reads package metadata only and loads no extension.
It skips `~`, `file://`, git and URL sources. For those, or for a checkout that Pi does not list, enter the installed path by hand.
Cancelling leaves the YAML unchanged.

| State               | Meaning                                                                      |
| ------------------- | ---------------------------------------------------------------------------- |
| **Off**             | No tool, extension or skill is mapped.                                       |
| **On (configured)** | The extension and the exact tool are mapped. This does not test the backend. |
| **Partial**         | Something is missing or duplicated. Correct the YAML by hand.                |

**Disable** removes the extension, the skill and the tool together.

## Todo

Each child that has `todo` approved gets its own task list.

- **The list starts empty.** OMPS starts the child in todo's normal mode. It copies no parent tasks and no OpenSpec binding.
- **Lists stay separate.** Siblings and grandchildren each keep their own list. Equal task numbers do not clash.
- **The parent is unchanged.** A child's tasks never tick the parent's `tasks.md` checkboxes, and your global todo preference stays as it is. This holds even when that preference is OpenSpec mode.
- **Both widgets show.** The todo widget and the `● Agents` tree appear above the editor without changing each other. Ctrl+O expands todo as usual. The fleet view has its own state.
- **Reminders work.** If a child ends a turn with an unexplained task in progress, todo sends its normal reminder. OMPS waits for that follow-up before it accepts the final answer.
- **The fleet shows no task counts.** OMPS does not read todo's task store.

A child result is evidence. Check the saved output, then update the parent's own tasks yourself.

## Memory

OMMS keeps its own recall, tools and capture. OMPS only decides whether a child may use them.

- **Three things are needed.** Map the OMMS extension, approve the exact `memory` tool, and optionally map the `omms-memory` skill. A skill alone grants no tool.
- **Approval covers the whole tool.** That includes write and portability modes. Give it only to a child that needs it.
- **Scope follows the folder.** A child uses the folder it runs in and its own session. Two children in the same project share that project's store. A child in another folder follows OMMS's own scope rules.
- **Maintenance is off in children.** OMPS sets `OMMS_DISABLE_WEB_AUTOSTART=1` and `OMMS_DISABLE_AUTO_BACKFILL=1` for the child process only. Recall, manual use and capture still work. Your own OMMS settings stay as they are.
- **Delivery writes no memory.** OMPS saves nothing when a result arrives.

### Hand off context

1. In the parent, search memory before you delegate.
2. Give the child only context you have checked.
3. Read the child's saved output when it finishes.
4. Save any verified finding with the parent's own `memory` tool.

OMMS may capture a child's work before cleanup finishes. That capture does not show the run succeeded. A run counts as completed only when OMPS has the saved answer, a clean exit and confirmed cleanup.

## When it does not work

| You see                                        | Cause and fix                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `tool "memory" is not registered`              | The tool is approved but no mapped extension adds it. Map the extension.                    |
| `permission violation: memory is not approved` | The extension is mapped but `memory` is not in `tools`. Add it, or leave it out on purpose. |
| **Partial** in the menu                        | An entry is missing or listed twice. Correct the agent's YAML lists.                        |
| `Install om-pi-todo and select its ...`        | OMPS found no valid package. Install it, then enter its folder or extension path.           |

The same applies to `todo`. In every case OMPS fails before the task reaches the model.

For the YAML fields, see [Set up agents](SETUP.md#skills-and-extensions). For the settings menu, see [How to use](USAGE.md#optional-child-capabilities).
