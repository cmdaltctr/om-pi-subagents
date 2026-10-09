# Set up your agents

An agent is a name in one YAML file, a persona file, a tool list and a thinking level.
OMPS ships no agents. You create each one.

## Where the files live

```text
~/.pi/agent/omps/
├── config.yaml                   # your mapping file
├── personas/                     # your persona files
│   └── reader.md
└── runs/<session-id>/<run-id>/   # evidence OMPS writes
```

- You create `config.yaml` and the persona files. Package updates never touch them.
- A persona is one Markdown file. It holds the instructions for one agent.
- The folder name `personas/` is free. OMPS reads only the files that a `persona:` line names.
- A `persona:` path starts from the folder of `config.yaml`. It must stay inside that folder and outside `runs/`.
- Set `OMPS_REGISTRY` to use another mapping file. Set `PI_CODING_AGENT_DIR` to replace `~/.pi/agent`.
- If only the old `~/.pi/agent/om-pi-subagents.yaml` exists, OMPS stops and prints migration commands. See [Move settings into the OMPS folder](INSTALL.md#move-settings-into-the-omps-folder).

## Create your first agent

1. Make the folder: `mkdir -p ~/.pi/agent/omps/personas`
2. Write `~/.pi/agent/omps/personas/reader.md`:

   ```markdown
   You read files and answer questions about them.
   Give short answers. Name the file for every claim.
   ```

3. Write `~/.pi/agent/omps/config.yaml`. This replaces any existing mapping file.

   ```yaml
   version: 1
   agents:
     reader:
       persona: ./personas/reader.md
       tools: [read, grep, find, ls]
       thinking: off
   ```

4. In Pi, run `/omps list`. The answer is `reader: 4 tools (read-only)`.
5. Run `/omps run reader Summarise the README`.
6. Wait. The result arrives as a new message. See [How to use](USAGE.md) for progress and cancellation.

The run uses the parent's working directory and, without a `model` field, the parent's model.

## Write a persona

A persona is plain Markdown. OMPS appends it to the child's system prompt. The task from `/omps run` arrives as a separate message.

- Use UTF-8 text with at least one non-blank line. The limit is 256 KiB.
- Put settings in `config.yaml`. A persona that starts with `---` (frontmatter) is rejected.
- Keep one job per agent.
- Match the persona to the tools. A persona that says "edit the file" needs `edit` or `write`.
- Ask for a fixed output format. State what to report when the agent cannot finish.

OMPS copies the persona into the run folder at launch. Later edits apply to the next run.

## The mapping file

### Top-level keys

| Key       | Required | Value                                                                                              |
| --------- | -------- | -------------------------------------------------------------------------------------------------- |
| `version` | yes      | The number `1`.                                                                                    |
| `agents`  | yes      | Agent names and their settings. Use `agents: {}` for none.                                         |
| `limits`  | no       | `maxConcurrentRuns` and `maxDepth`. See [Limits and nesting](#limits-and-nesting).                 |
| `ui`      | no       | Visible rows, fleet view, list visibility and keys. See [Interface settings](#interface-settings). |

OMPS rejects other top-level keys, duplicate keys, YAML aliases, custom tags and files over 256 KiB.

### Agent fields

Agent names match `[a-z][a-z0-9-]{0,63}`. No name has a special meaning.

| Field        | Required | Value                                                                         |
| ------------ | -------- | ----------------------------------------------------------------------------- |
| `persona`    | yes      | Path to a Markdown file inside the mapping folder.                            |
| `tools`      | yes      | Exact tool names. `[]` grants none.                                           |
| `thinking`   | yes      | `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`.                  |
| `model`      | no       | `provider/id`. Run `pi --list-models` for names. The default is the parent's. |
| `skills`     | no       | Paths to `SKILL.md` files.                                                    |
| `extensions` | no       | Paths to extension files or folders.                                          |
| `delegates`  | no       | Agents this agent may launch. Required when `tools` includes `omps`.          |

The child loads nothing else from your Pi set-up. Every agent needs `thinking`, even when the parent uses another level.
If the model is unknown or has no credentials, the run fails before the task is sent.

### `tools`

Write each tool by its exact name. Wildcards are rejected.

| Name                                  | Changes files |
| ------------------------------------- | ------------- |
| `read`, `grep`, `find`, `ls`          | no            |
| `edit`, `write`, `bash`, `powershell` | yes           |
| `tool_search`, `codemode`             | no            |

`tool_search` and `codemode` can call only tools that are also on the list.

`/omps list` marks an agent with `edit`, `write`, `bash` or `powershell` as write-capable.
Start such an agent in a folder that is safe to change.

MCP tools are named `mcp__<server>__<tool>`. The server name comes from Pi's `mcp.json`.
On Pi 1.0 and newer, every character other than a letter, digit or `_` becomes `_`. Hyphens turn into underscores. Pi 0.99 and earlier kept hyphens.

```yaml
tools:
  - read
  - tool_search
  - mcp__context7_mcp__resolve_library_id
  - mcp__context7_mcp__query_docs
```

- Add `tool_search` when the agent must find deferred MCP tools.
- Listing an MCP tool does not start its server. Configure the server in Pi first.
- The old `mcp` proxy tool no longer exists. Use the native names.
- After a Pi update from 0.99 to 1.0, change the hyphens in your MCP tool names to underscores. If you do not, runs fail with `tool "..." is not registered`.
- A tool from an extension needs the matching `extensions` entry.
- Before the task is sent, OMPS checks that every listed tool exists in the child.

### `delegates`

An agent that lists the exact `omps` tool can launch other agents. It needs a non-empty `delegates` list.

```yaml
agents:
  builder:
    persona: ./personas/builder.md
    tools: [read, edit, write, bash, omps]
    thinking: high
    delegates: [writer, explorer]
```

- Each entry must be a mapped agent in the same file. The list cannot be empty.
- `omps` without `delegates` fails validation. `delegates` without `omps` fails too.
- OMPS refuses any other launch and starts no process.
- Each target keeps its own tools. A listed target can still write files.
- A running branch keeps the list it started with. OMPS also reads the YAML on every launch, so edits can narrow a branch and never widen it.

### `skills` and `extensions`

A skill is a `SKILL.md` file. An extension is code that adds tools, commands or model providers.
Both lists accept absolute paths, `~/` paths and paths relative to the mapping folder. They may point outside that folder.

```yaml
skills: [~/.pi/agent/skills/citations/SKILL.md]
extensions: [~/.pi/agent/extensions/my-provider/index.ts]
```

An extension runs as code in the child with your permissions. List only code you trust.
A model from a custom provider needs the extension that registers it.
To give a child the `/skill:om-pi-subagents` instructions, map the installed `skills/om-pi-subagents/SKILL.md`. Use the folder that `pi list` shows. The skill grants no tools.

### Memory and Todo

New mappings have both off. A child gets them only through its own `tools`, `extensions` and `skills` entries.

1. Install the optional package: `pi install npm:om-memory-system` for Memory, `pi install npm:om-pi-todo` for Todo.
2. Run `/omps-settings` and choose **Agent capabilities**.
3. Choose an agent, then Memory or Todo.
4. Choose **Enable**. For Memory, **Enable with shipped skill** also maps `omms-memory`.
5. Enter the package folder if OMPS asks. Confirm the proposed changes.

OMPS reads package metadata and runs nothing. It installs nothing.
**Off** means no mapped entries. **On (configured)** means the extension and exact tool are mapped. It does not test the backend.
**Partial** means an entry is missing or duplicated. Fix it in YAML. **Disable** removes the extension, skill and tool together for later launches.

Approving `memory` allows every mode of that tool, including writes. Give it only to a child that needs it.
Each child starts with its own empty todo list and never sees the parent's tasks. See [Todo and memory](INTEGRATIONS.md).

### Limits and nesting

```yaml
version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
agents: {}
```

- `maxConcurrentRuns` is the number of direct children each parent may run at once. It defaults to one.
- `maxDepth` is how deep agents may nest. The root is depth zero. It defaults to one. Depth zero disables new launches.
- A running branch keeps its inherited depth ceiling. A new ceiling applies to new branches.
- OMPS sets no combined ceiling. Four slots at depth three allow 4 + 16 + 64 = 84 descendants.

See [configured limits and nesting](USAGE.md#configured-limits-and-nesting).

### Interface settings

The `ui` keys are easiest to change with `/omps-settings`. Key edits need `/reload`.

| Key                       | Value                                                           | Default        |
| ------------------------- | --------------------------------------------------------------- | -------------- |
| `maxVisibleAgents`        | Whole number, 1 to 256                                          | 5              |
| `fleetView`               | `expanded`, `collapsed` or `off`                                | `expanded`     |
| `showManagementList`      | `true` or `false` (the Management list)                         | `true`         |
| `navigationDownKey`       | Pi key such as `down`, or `off`                                 | `down`         |
| `navigationUpKey`         | Pi key, or `off`                                                | `up`           |
| `resultKey`               | Pi key, or `off`                                                | `ctrl+shift+e` |
| `toggleKey`, `inspectKey` | Pi key, or `off` (the Fleet view shortcut and inspect shortcut) | `off`          |

- Write keys in lower case, for example `ctrl+alt+p`. Enabled keys must differ.
- Tab and Ctrl+I are refused. A key that an effective Pi action already uses stays inactive, and OMPS names the owner.
- `/omps fleet` and `/omps inspect` work without any shortcut.
- Ctrl+Shift+E needs extended-key reporting (kitty or xterm `modifyOtherKeys`). If your terminal drops Shift, use the host key in the fold hint, usually Ctrl+O.

To disable the result shortcut:

```yaml
ui:
  resultKey: off
```

#### Management navigation keys

Down and Up select an agent from an empty, focused prompt. They need a visible Management list.
This example keeps the tree and hides the list:

```yaml
ui:
  fleetView: expanded
  showManagementList: false
  navigationDownKey: ctrl+shift+down
  navigationUpKey: ctrl+shift+up
```

Pi 1.0.4 binds Ctrl+Shift+Up and Ctrl+Shift+Down to `tui.altScreen.previousPrompt` and `tui.altScreen.nextPrompt`.
OMPS never rewrites Pi keybindings. To free those keys, do this yourself:

1. Open your Pi `keybindings.json`.
2. Merge these entries and keep your other bindings:

   ```json
   {
   	"tui.altScreen.previousPrompt": ["ctrl+up"],
   	"tui.altScreen.nextPrompt": ["ctrl+down"]
   }
   ```

3. Run `/hotkeys` to check the result, then `/reload`.

Some terminals consume or report modified arrows differently. Test the pair, or choose other keys.

#### Restore the Alt keys

Versions 0.5 and earlier bound `alt+o` and `alt+i`. To bring them back:

```yaml
ui:
  toggleKey: alt+o
  inspectKey: alt+i
```

On macOS, Option+O types `ø` unless the terminal sends Option as Alt. Change this first, then run `/reload`:

| Terminal     | Setting                                                       |
| ------------ | ------------------------------------------------------------- |
| Terminal.app | Settings > Profiles > Keyboard > Use Option as Meta key       |
| iTerm2       | Settings > Profiles > Keys > Left Option key > Esc+           |
| Ghostty      | Add `macos-option-as-alt = true` to the Ghostty configuration |

## When changes apply

`/omps list` and `/omps run` read the mapping file and the personas every time. Edits apply at the next launch. A running agent keeps its start settings.
An invalid file blocks every launch until you fix it. OMPS never falls back to old settings.
Run `/reload` after you install, update or remove the package, or after you change a key.

## Common errors

Errors read `OMPS: <field>: <problem>`. The field is the place in the file, for example `agents.reader.tools`.

| Message                                        | Fix                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `No personas mapped.`                          | Create the mapping file. Start from [Create your first agent](#create-your-first-agent). |
| `unknown field`                                | Remove or correct the key named in the message.                                          |
| `persona: cannot read <path>`                  | Create the file, or correct the path.                                                    |
| `is not an exact tool name`                    | Write each tool by its exact name.                                                       |
| `tool "<name>" is not registered`              | Check the name. Configure the MCP server or add the extension.                           |
| `model ... is not in the model registry`       | Correct `model`, or add the provider extension.                                          |
| `model ... has no configured authentication`   | Log in to the provider in Pi.                                                            |
| `permission violation: <tool> is not approved` | Add the tool to the agent, or tighten the persona.                                       |

## Security

- The child guard blocks every tool call whose name is not on the list, and the run fails. It checks names only and gives no operating-system sandbox.
- Personas, tasks and outputs can hold sensitive text. Run folders are private to your user, and OMPS never deletes them.
