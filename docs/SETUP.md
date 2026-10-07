# Set up your agents

OMPS runs agents. An agent is a name in one YAML file, a persona file, a list of allowed tools and a thinking level.
You can also give it a model, skills and extensions. OMPS ships no agents, so you create each one yourself.

Contents:

- [Where the files live](#where-the-files-live)
- [Set up your first agent](#set-up-your-first-agent)
- [Write a persona](#write-a-persona)
- [The mapping file reference](#the-mapping-file-reference)
- [When changes apply](#when-changes-apply)
- [Common errors and fixes](#common-errors-and-fixes)
- [Security](#security)

## Where the files live

Two kinds of file define your agents:

- The mapping file, `om-pi-subagents.yaml`. It lists every agent and its settings.
- Persona files. Each is a Markdown file with the instructions for one agent.

Both live in your Pi agent directory. Run files go in a sub-folder of the same directory.

```text
~/.pi/agent/
├── om-pi-subagents.yaml          # the mapping file. YOU create it
├── om-pi-subagents/              # your files for this extension. YOU create it
│   └── personas/                 # your persona files. YOU create it
│       ├── reader.md
│       └── reviewer.md
├── mcp.json                      # Pi's own MCP server list, if you use MCP tools
└── omps/
    └── runs/<session-id>/<run-id>/   # one private folder per run, written by OMPS
```

Rules for these locations:

- OMPS reads the mapping file from `~/.pi/agent/om-pi-subagents.yaml`.
- If you do not have this file, OMPS has no agents. `/omps list` answers `No personas mapped.`
- Persona paths are relative to the folder that holds the mapping file.
- A persona must stay inside that folder after symbolic links are resolved. A path or link that leads outside it is rejected.
- The package contains no mapping file and no personas. Package updates do not write to your agent directory.

### Persona, persona folder and `omps/`: the difference

Several names look alike. Each one is a different thing.

| Name                                    | What it is                                                           | Who creates it         | How OMPS uses it                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `~/.pi/agent/om-pi-subagents.yaml`      | The mapping file. A file. It lists every agent.                      | You                    | Reads it to learn the agent names and their settings.                                                                         |
| `~/.pi/agent/om-pi-subagents/`          | A folder for your files for this extension. It holds `personas/`.    | You, with `mkdir`      | Never reads the folder itself.                                                                                                |
| `~/.pi/agent/om-pi-subagents/personas/` | The persona folder. It holds your persona files.                     | You, with `mkdir`      | Never reads the folder itself. It reads only the files that `persona:` lines name.                                            |
| Persona                                 | One Markdown file with the instructions for one agent.               | You                    | Reads it on `/omps list` and `/omps run`. Saves a copy as `persona.md`. Gives the copy to the child Pi as system prompt text. |
| `persona:` field                        | One line under an agent in the YAML. It holds the path to a persona. | You                    | Joins the path to the YAML's folder. Reads that one file.                                                                     |
| `~/.pi/agent/omps/`                     | The run folder.                                                      | OMPS, on the first run | Writes each run's files here. See [USAGE.md](USAGE.md).                                                                       |

The mapping file and the `om-pi-subagents/` folder sit side by side and have almost the same name.
The file is the list of agents. The folder holds the files that the list points to.

Rules that follow from this:

- Keep every persona in `~/.pi/agent/om-pi-subagents/personas/`. Every example in these docs uses this folder.
- The package creates neither folder. You create both with `mkdir -p ~/.pi/agent/om-pi-subagents/personas`.
- OMPS does not scan the persona folder. A file in it that no `persona:` line names is ignored.
- OMPS itself accepts any path inside `~/.pi/agent/`. Use the path above so that your set-up matches the docs.
- If you move the persona folder, edit every `persona:` line that uses it.

### Where each `persona:` path points

OMPS takes the `persona:` text from the YAML exactly as you wrote it.
It then joins that text to the folder that holds the mapping file. By default this folder is `~/.pi/agent/`.
The folder where you start Pi has no effect.

| `persona:` value in the YAML           | File OMPS reads                                  |
| -------------------------------------- | ------------------------------------------------ |
| `./om-pi-subagents/personas/reader.md` | `~/.pi/agent/om-pi-subagents/personas/reader.md` |

- If the folder or the file is missing, `/omps list` fails with `agents.<name>.persona: cannot read <path>`. The `<path>` is the text from your YAML, not the full path.
- To check which folder your YAML uses, run `grep persona: ~/.pi/agent/om-pi-subagents.yaml`.

Two environment variables change these locations:

| Variable              | Effect                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `OMPS_REGISTRY`       | Full path of the mapping file to use instead. Persona paths then resolve from that file's folder.                 |
| `PI_CODING_AGENT_DIR` | Replaces `~/.pi/agent` as the agent directory. The default mapping file and the `omps/runs/` folder move with it. |

Set either variable before you start Pi.

## Set up your first agent

This procedure makes an agent called `reader`. It reads files and answers questions about them.

1. Install OMPS. See [How to install](INSTALL.md).
2. Run `/reload` in Pi.
3. Open a terminal.
4. Make the persona folder:

   ```sh
   mkdir -p ~/.pi/agent/om-pi-subagents/personas
   ```

5. Write the persona file:

   ```sh
   cat > ~/.pi/agent/om-pi-subagents/personas/reader.md <<'EOF'
   You read files and answer questions about them.
   Give short answers. Name the file for every claim.
   EOF
   ```

6. Write the mapping file. This command replaces an existing mapping file, so check first that you have none:

   ```sh
   cat > ~/.pi/agent/om-pi-subagents.yaml <<'EOF'
   version: 1
   agents:
     reader:
       persona: ./om-pi-subagents/personas/reader.md
       tools: [read, grep, find, ls]
       thinking: off
   EOF
   ```

7. In Pi, run `/omps list`. The answer is:

   ```text
   reader: 4 tools (read-only)
   ```

8. Start a run:

   ```text
   /omps run reader Summarise the README
   ```

   The answer gives the run id and the run folder:

   ```text
   Started run <run-id> (reader) in the background.
   Files: <agent-dir>/omps/runs/<session-id>/<run-id>
   Check it with "omps status <run-id>". The result arrives as a follow-up message.
   ```

9. Wait for the result. It arrives as a new message in the parent conversation.

The run uses the parent's working directory and the parent's model. To see progress, run `/omps` or `/omps status <run-id>`.
See [How to use](USAGE.md) for the panel, run states and cancellation.

If step 7 shows an error, find the message in [Common errors and fixes](#common-errors-and-fixes).

## Write a persona

A persona is plain Markdown text. OMPS adds it to the end of the child Pi's system prompt (the standing instructions the model reads before the task).
Pi keeps its own system prompt and tool descriptions. Your persona comes after them.
The task you give in `/omps run` reaches the child as a separate message.

### Settings go in the YAML file, not in the persona

A persona file holds instructions only. Do not add YAML frontmatter to it.
Frontmatter is a settings block between two `---` lines at the top of a Markdown file. Some other tools use it. OMPS does not.

| Where                              | What goes there                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Persona `.md` file                 | The instructions for the model, in plain Markdown only.                        |
| `~/.pi/agent/om-pi-subagents.yaml` | `tools`, `model`, `thinking`, `skills`, `extensions`, and the `persona:` path. |

Wrong. OMPS rejects this persona file:

```markdown
---
tools: [read, grep]
thinking: high
---

You review code changes.
```

Right. The persona file has text only:

```markdown
You review code changes.
```

Right. The settings are in the mapping file:

```yaml
agents:
  reviewer:
    persona: ./om-pi-subagents/personas/reviewer.md
    tools: [read, grep]
    thinking: high
```

If a persona starts with `---`, `/omps list` and `/omps run` fail with `has frontmatter; put settings in om-pi-subagents.yaml`.

### What happens to the file

1. OMPS reads the persona when you run `/omps list` or `/omps run`.
2. At launch, OMPS saves a copy as `persona.md` in the run folder.
3. The child receives that copy through Pi's `--append-system-prompt` option.

A run uses the text that existed when it started. Edits after that point apply to the next run only.

### Rules the file must follow

- Read as UTF-8 text.
- Maximum size is 262,144 bytes (256 KiB).
- It must contain text other than spaces and blank lines.
- It must not start with `---`. OMPS treats that as frontmatter (a settings block) and rejects it. Put all settings in the mapping file.
- It must be a file. A folder is rejected.

### What to put in it

Write to the model in the second person. Cover these points:

| Topic          | Ask yourself                                                          |
| -------------- | --------------------------------------------------------------------- |
| Role           | What is this agent for?                                               |
| Scope          | Which files, folders or questions belong to it? What is out of scope? |
| Method         | Which steps must it follow? Which tools should it use first?          |
| Output format  | What shape must the answer have? Headings, a list, a table, a length? |
| Prohibitions   | What must it never do?                                                |
| When it cannot | What must it report if it cannot finish?                              |

### Example

A read-only code reviewer, saved as `~/.pi/agent/om-pi-subagents/personas/reviewer.md`.
The file has no `---` block. Its settings (`tools`, `thinking`) are in the mapping file. See [Complete example](#complete-example).

```markdown
You review code changes. You do not change files.

## Scope

- Review only the files or the diff named in the task.
- Ignore formatting. The project formatter handles it.

## Method

1. Read each named file in full before you comment on it.
2. Use grep to find the callers of any function that changed.
3. Check error handling, input validation and resource cleanup.

## Output

Start with one line: "No blocking issues" or "Blocking issues found".
Then give a numbered list. For each finding, write:

- the file and line number,
- the problem in one sentence,
- the fix in one sentence.

Put blocking issues first. Keep the whole answer under 400 words.

## Limits

- Do not suggest new features.
- If a file is missing or unreadable, say so and continue with the others.
```

### Tips

- Keep one job per agent. Make a second agent for a second job.
- Match the persona to the tools. A persona that says "edit the file" needs `edit` or `write` in its tool list.
- Ask for a fixed output format. The result message and the run panel are easier to read.
- Tell the agent what to do when it is blocked. Otherwise it can guess.
- Test with a small task first. Read `output.md` in the run folder to check the answer.

## The mapping file reference

### Top-level keys

| Key       | Required | Value                                                                     |
| --------- | -------- | ------------------------------------------------------------------------- |
| `version` | yes      | The number `1`. The text `'1'` and other numbers are rejected.            |
| `agents`  | yes      | A mapping of agent names to settings. Use `agents: {}` for none.          |
| `limits`  | no       | `maxConcurrentRuns` and `maxDepth`. Omitted fields default to one.        |
| `ui`      | no       | `maxVisibleAgents`, `fleetView`, `toggleKey` and `inspectKey`. See below. |

Only `version`, `agents`, `limits` and `ui` are allowed at the top level.
`maxConcurrentRuns` accepts safe integers of at least one; `maxDepth` accepts safe integers of at least zero.
See [configured limits and nesting](USAGE.md#configured-limits-and-nesting) for the table, depth examples and branch ceilings.

`ui.maxVisibleAgents` accepts safe integers from one to 256 and defaults to five.
`ui.fleetView` sets how the fleet first appears: `expanded` (default) shows the `● Agents` tree above the editor and the list below it,
`collapsed` shows only the tree heading and `off` hides both. `/omps fleet` and a bound toggle key change the view for the current session only.
`ui.toggleKey` and `ui.inspectKey` accept lowercase Pi key specifications, such as `alt+o`
or `ctrl+alt+p`, or `off` to disable the shortcut. Both default to `off`. Empty-prompt arrows, `/omps fleet` and
`/omps inspect` give full access without a shortcut.
The two keys must differ. Tab and Ctrl+I are refused because legacy terminals send one byte
for both. A key bound to an effective built-in action is refused with guidance when the
session starts. The check ignores modifier order, so `ctrl+shift+o` is refused because Pi 1.0 binds
`shift+ctrl+o` to the session-tree filter. Edit these fields with `/omps-settings`, or by hand; see
[operator settings](USAGE.md#operator-settings).

#### Restore the Alt keys

OMPS 0.5 and earlier bound `alt+o` and `alt+i` by default. To keep them, add these lines:

```yaml
ui:
  toggleKey: alt+o
  inspectKey: alt+i
```

On macOS, Option+O types `ø` unless the terminal sends Option as Alt. Change this setting first:

| Terminal     | Setting                                                       |
| ------------ | ------------------------------------------------------------- |
| Terminal.app | Settings > Profiles > Keyboard > Use Option as Meta key       |
| iTerm2       | Settings > Profiles > Keys > Left Option key > Esc+           |
| Ghostty      | Add `macos-option-as-alt = true` to the Ghostty configuration |

Then run `/reload` in Pi.

### Agent names

Each key under `agents` is an agent name. You use it in `/omps run <name> <task>`.

- Start with a lower-case letter (`a` to `z`).
- Continue with lower-case letters, digits or hyphens.
- Use at most 64 characters.
- No name has a special meaning.

Valid: `reader`, `code-review`, `x9-review`. Invalid: `Reader`, `1reader`, `read_er`.

### Agent fields

| Field        | Required | Type          | Allowed values                                            | What it does                                                        |
| ------------ | -------- | ------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| `persona`    | yes      | text          | Path to a file inside the mapping file's folder           | Appends the file to the child's system prompt.                      |
| `tools`      | yes      | list of text  | Exact tool names. `[]` means no tools.                    | Sets the only tools the child may call.                             |
| `thinking`   | yes      | text          | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` | Sets the child's thinking level.                                    |
| `model`      | no       | text          | `provider/id`, for example `my-provider/my-model`         | Selects the child's model. Without it, the child uses the parent's. |
| `skills`     | no       | list of paths | Paths to skill files                                      | Loads these skills into the child.                                  |
| `extensions` | no       | list of paths | Paths to extension files or folders                       | Loads these extensions into the child.                              |

Any other field is rejected. The child loads nothing else from your Pi set-up: no other extensions, skills, prompt templates or themes.

### If a field is missing

| Missing field                   | What happens                                                                                       | What to do                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `model` only                    | The child uses the parent's current model. It keeps its own `thinking` value.                      | Add `model: provider/id` if this agent needs a fixed model.  |
| `thinking` only                 | `/omps list` and `/omps run` reject the mapping. The child does not start, even if `model` is set. | Add a valid `thinking` level.                                |
| Both `model` and `thinking`     | The missing `thinking` level blocks the mapping. No model is chosen and no child starts.           | Add `thinking`; leave `model` out to use the parent's model. |
| `persona`                       | `/omps list` and `/omps run` report `agents.<name>.persona: required path`.                        | Add a path to a persona file.                                |
| Persona file named by `persona` | `/omps list` and `/omps run` report `agents.<name>.persona: cannot read <path>`.                   | Create the file or correct its path.                         |

A name under `agents` does not create a persona file. OMPS checks the file each time you list or start an agent.
An invalid mapping blocks launches until you fix it. See [Common errors and fixes](#common-errors-and-fixes).

### `tools`

Write each tool by its exact name. Wildcards and patterns such as `*`, `read*` or `mcp__server__*` are rejected.
A name must start with a letter or digit. It can then contain letters, digits, `_`, `.` and `-`.

Pi's built-in tools:

| Name          | Purpose                                                       | Changes files |
| ------------- | ------------------------------------------------------------- | ------------- |
| `read`        | Read text files and supported images                          | no            |
| `grep`        | Search file contents                                          | no            |
| `find`        | Find paths with glob patterns                                 | no            |
| `ls`          | List folder contents                                          | no            |
| `edit`        | Replace exact text in an existing file                        | yes           |
| `write`       | Create or overwrite a file                                    | yes           |
| `bash`        | Run shell commands                                            | yes           |
| `powershell`  | Run PowerShell commands on Windows                            | yes           |
| `tool_search` | Find tools that are not shown to the model, such as MCP tools | no            |
| `codemode`    | Run JavaScript that calls the other approved tools            | no            |

`/omps list` marks an agent with `edit`, `write`, `bash` or `powershell` as `write-capable`.
`codemode` and `tool_search` can only call tools that are also on the list.

MCP tools come from an MCP server (a separate program that gives Pi extra tools). Their names have this form:

```text
mcp__<server>__<tool>
```

`<server>` is the server's name in Pi's `mcp.json`. `<tool>` is the tool's own name.

Pi 1.0 and newer change every character other than a letter, a digit or `_` to `_` in the full name. Hyphens become underscores. Pi 0.99 and earlier kept hyphens.

| Server in `mcp.json` | Tool on the server   | Name on Pi 1.0 and newer            |
| -------------------- | -------------------- | ----------------------------------- |
| `context7`           | `resolve-library-id` | `mcp__context7__resolve_library_id` |
| `context7-mcp`       | `query-docs`         | `mcp__context7_mcp__query_docs`     |
| `paper-search`       | `search_arxiv`       | `mcp__paper_search__search_arxiv`   |

For a server called `context7`:

```yaml
tools:
  - read
  - tool_search
  - mcp__context7__resolve_library_id
  - mcp__context7__query_docs
```

- Add `tool_search` when the agent must find deferred MCP tools (tools Pi does not show to the model until it searches for them).
- Listing an MCP tool does not set up its server. Configure the server in Pi first, for example with `pi mcp add`, and check it with `pi mcp list`.
- The old tool name `mcp` no longer exists. Use the native `mcp__<server>__<tool>` names.
- After a Pi update from 0.99 to 1.0, change the hyphens in your MCP tool names to underscores. If you do not, runs fail with `tool "..." is not registered`.
- A tool from an extension needs its explicit `extensions` entry.
- Approving the exact `omps` tool loads OMPS's managed delegator. It can select targets with their own tool permissions.
- Approving `todo` requires the real todo extension too. OMPS seeds only the child's normal-mode list.
- Approving `memory` requires the real OMMS extension; its whole tool includes write and portability modes.

Before the task is sent, OMPS checks that every listed tool exists in the child. A missing tool stops the run before the model sees the task.

### `thinking`

`thinking` is required for every agent. The child never takes the parent's thinking level.
OMPS passes the value to Pi as `--thinking`. Pi limits it to what the selected model supports.

### `model`

Write the model as `provider/id`, the same form Pi uses. Run `pi --list-models` to see the names Pi knows.

- Without `model`, the child uses the parent's current model. If the parent has no selected model, Pi uses its normal startup default in the child.
- The model must be known to the child and have configured credentials. If not, the run fails before the task is sent.
- OMPS does not choose another model when this check fails.
- A model from a custom provider needs the extension that registers it. Add that extension to `extensions`.

### `skills` and `extensions`

A skill is a `SKILL.md` instruction file that Pi can load. An extension is TypeScript code that adds tools, commands or model providers to Pi.

| Rule                       | `skills`                                | `extensions`                            |
| -------------------------- | --------------------------------------- | --------------------------------------- |
| Path must be               | an existing file                        | an existing file or folder              |
| `~/` at start              | resolves from your home                 | resolves from your home                 |
| Relative path              | resolves from the mapping file's folder | resolves from the mapping file's folder |
| Absolute path              | allowed                                 | allowed                                 |
| Outside the mapping folder | allowed                                 | allowed                                 |

The containment rule applies to personas only.
For `/skill:om-pi-subagents`, map the installed package's `skills/om-pi-subagents/SKILL.md` explicitly into a child.
Use the folder shown by `pi list`. Loading a skill grants no tools.
See [nested results and local todos](USAGE.md#nested-results-and-local-todos) for portable mapping examples.

### Optional Memory and Todo for a mapped agent

New mappings have both capabilities off. A parent's extensions never pass automatically to a child.
Keep `tools`, `extensions` and `skills` explicit. Existing mappings remain effective.

1. Install the optional package separately if you want it in a child.
2. Run `/omps-settings` and choose **Agent capabilities**.
3. Choose an existing agent, then Memory or Todo.
4. Choose **Enable** and enter the installed package folder or its published Pi extension entry.
5. Read the proposed list changes and confirm them.

The helper reads published package metadata without running its extension. It adds the exact
`memory` or `todo` tool and that package's declared Pi extension. For Memory, choose
**Enable with shipped skill** to add `omms-memory` explicitly. A missing package leaves YAML
unchanged. The helper never installs it or edits the sibling's configuration.

**Off** means no recognised sibling entry, mapped skill or matching tool approval.
**On (configured)** means an extension and exact tool are mapped; check the sibling separately
for backend health. **Partial** means a tool, extension or skill is missing or duplicated.
Correct an unrecognised wrapper in YAML; the helper will not guess which custom code to remove.
Choose **Disable** to remove recognised sibling entries, its skill and exact tool together.
This stops memory recall/capture hooks or child todo bootstrap on the next launch. Active
children retain their snapshot. The parent's tools and OpenSpec tasks stay unchanged.

Approving `memory` permits every mode of that tool, including writes and portability.
Only give this permission to a child that needs it. See [optional child capabilities](USAGE.md#optional-child-capabilities)
for a complete agent example and a verified-result handoff.

### Complete example

This file maps three agents: a read-only reviewer, a writer and a documentation researcher.

```yaml
version: 1
agents:
  reviewer:
    persona: ./om-pi-subagents/personas/reviewer.md
    tools: [read, grep, find, ls]
    thinking: medium

  writer:
    persona: ./om-pi-subagents/personas/writer.md
    tools: [read, grep, find, ls, edit, write]
    model: my-provider/my-model # replace with a name from `pi --list-models`
    thinking: low

  docs-researcher:
    persona: ./om-pi-subagents/personas/docs-researcher.md
    tools:
      - read
      - tool_search
      - mcp__context7__resolve_library_id
      - mcp__context7__query_docs
    thinking: low
    skills:
      - ~/.pi/agent/skills/citations/SKILL.md
```

Each persona file must exist before `/omps list` succeeds. `/omps list` then shows:

```text
reviewer: 4 tools (read-only)
writer: 6 tools (write-capable); model my-provider/my-model
docs-researcher: 4 tools (read-only)
```

### YAML features OMPS rejects

- Duplicate keys, including two agents with the same name.
- Aliases and anchors (`&name`, `*name`).
- Custom tags such as `!custom`.
- A mapping file larger than 262,144 bytes.

## When changes apply

OMPS reads the mapping file and every persona again each time you run `/omps list` or `/omps run`.
The `omps` tool's `list` and `run` actions do the same.

- Edits to the mapping file or a persona apply at the next `list` or `run`. You do not need `/reload`.
- A run that already started keeps the settings and persona text it started with.
- `/omps`, `/omps status` and `/omps cancel` do not read the mapping file.
- If the file is invalid, `list` and `run` show the error. No run starts until you fix the file. OMPS never falls back to older settings.

Run `/reload` after you install, update or remove the package. Changes to the agent files do not need it.

## Common errors and fixes

Errors appear in Pi as `OMPS: <field>: <problem>`. The field shows the place in the mapping file, for example `agents.reader.tools`.
OMPS reports the first problem it finds. Fix it, then run `/omps list` again.

| Message (or part of it)                                                  | Cause                                                            | Fix                                                                                                      |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `No personas mapped.`                                                    | No mapping file, or `agents: {}`                                 | Create the mapping file. See [Set up your first agent](#set-up-your-first-agent).                        |
| `version: required`                                                      | No `version` key. An empty mapping file also gives this.         | Add `version: 1` as the first line.                                                                      |
| `version: unsupported ...; expected 1`                                   | `version` is not the number 1                                    | Write `version: 1` without quotes.                                                                       |
| `agents: required mapping (use {} for no agents)`                        | `agents` is missing or is not a mapping                          | Add `agents:` with agents under it, or `agents: {}`.                                                     |
| `<key>: unknown field`                                                   | A top-level key other than `version`, `agents`, `limits` or `ui` | Remove the key or correct its spelling.                                                                  |
| `ui.<field>: unknown field`                                              | A key under `ui` other than the four supported fields            | Use `maxVisibleAgents`, `fleetView`, `toggleKey` or `inspectKey`.                                        |
| `ui.maxVisibleAgents: must be a safe integer from 1 to 256`              | The value is zero, too large, fractional or not a number         | Write a whole number from 1 to 256.                                                                      |
| `ui.toggleKey: must be a ... Pi key specification ... or "off"`          | A misspelt or uppercase key, for example `Alt+O`                 | Write the key in lowercase, such as `alt+o`, or `off`.                                                   |
| `ui.fleetView: must be "expanded", "collapsed" or "off"`                 | Another word, or a capital letter                                | Write `expanded`, `collapsed` or `off`.                                                                  |
| `ui.<key>: ... unsafe ... same as Tab`                                   | `tab` or `ctrl+i`                                                | Choose another key; legacy terminals send one byte for both.                                             |
| `ui.inspectKey: duplicate of ui.toggleKey`                               | Both shortcuts use the same key                                  | Give each shortcut its own key, or set one to `off`.                                                     |
| `agents.<name>.<field>: unknown field`                                   | A misspelt or unsupported agent field, such as `toolz`           | Use only the fields in [Agent fields](#agent-fields).                                                    |
| `invalid name; use [a-z][a-z0-9-]{0,63}`                                 | Capital letter, underscore, leading digit or too long            | Rename the agent. See [Agent names](#agent-names).                                                       |
| `agents.<name>: must be a mapping`                                       | The agent has no fields under it                                 | Indent its fields under the name.                                                                        |
| `persona: required path`                                                 | No `persona` field, or it is empty                               | Add `persona: ./om-pi-subagents/personas/<name>.md`.                                                     |
| `persona: cannot read <path>`                                            | The persona file does not exist                                  | Create the file, or correct the path relative to the mapping folder.                                     |
| `resolves outside the extension directory`                               | The path or a symbolic link leads outside the mapping folder     | Move the persona into the mapping file's folder.                                                         |
| `cannot read <path> as a file`                                           | The path is a folder, or you have no read permission             | Point to a file. Check its permissions.                                                                  |
| `<path> is empty`                                                        | The persona has only spaces or blank lines                       | Write the persona text.                                                                                  |
| `has frontmatter; put settings in om-pi-subagents.yaml`                  | The persona starts with `---`                                    | Remove the block at the top. Move its settings to the mapping file.                                      |
| `larger than 262144 bytes`                                               | The persona or mapping file is over 256 KiB                      | Make the file shorter.                                                                                   |
| `tools: required (use [] for no tools)`                                  | No `tools` field                                                 | Add `tools: [...]`, or `tools: []`.                                                                      |
| `tools: must be a list of tool names`                                    | `tools` is not a list                                            | Write it as `[read, grep]` or as a `-` list.                                                             |
| `is not an exact tool name (no wildcards or selectors)`                  | A wildcard, space, colon or empty name                           | Write each tool's exact name.                                                                            |
| `thinking: required; set one of off, minimal, ...`                       | No `thinking` field                                              | Add `thinking: off` or another level.                                                                    |
| `thinking: must be one of off, minimal, ...`                             | Unknown level, a number or an empty value                        | Use one of the listed levels.                                                                            |
| `model: must be a non-empty string`                                      | `model` is empty, a number or a list                             | Write `provider/id`, or remove the field.                                                                |
| `skills: must be a list of paths`, `extensions: must be a list of paths` | The value is not a list                                          | Write the paths as a list.                                                                               |
| `skills[0]: cannot read <path>`, `extensions[0]: cannot read <path>`     | The path does not exist. For skills, a folder also gives this.   | Correct the path. Point a skill to its `SKILL.md` file.                                                  |
| `malformed YAML (...)`                                                   | YAML syntax error, such as a missing bracket                     | Fix the line named in the message.                                                                       |
| `duplicate key`                                                          | The same key appears twice, often an agent name                  | Rename or remove the second one.                                                                         |
| `aliases are not allowed`                                                | The file uses `&` anchors or `*` aliases                         | Write each value out in full.                                                                            |
| `custom tag ... is not allowed`                                          | The file uses a tag such as `!custom`                            | Remove the tag.                                                                                          |
| `top level must be a mapping`                                            | The file is a list or a single value                             | Start with `version: 1` and `agents:`.                                                                   |
| `unknown agent "<name>"; mapped agents: ...`                             | The name in `/omps run` is not in the mapping file               | Use a name that `/omps list` shows.                                                                      |
| `the task cannot start with a slash`                                     | The task starts with `/`                                         | Reword the task.                                                                                         |
| `child is not ready: tool "<name>" is not registered`                    | A listed tool does not exist in the child                        | Check the exact name. For MCP tools, configure the server in Pi. For extension tools, add the extension. |
| `model ... is not in the model registry`                                 | The child does not know the model                                | Correct `model`, or add the provider extension.                                                          |
| `model ... has no configured authentication`                             | The model has no credentials                                     | Log in to the provider or set its key in Pi.                                                             |
| `permission violation: <tool> is not approved`                           | The model called a tool that is not on the list                  | Add the tool if the agent needs it. Otherwise tighten the persona.                                       |

## Security

- Personas and extensions are trusted input. An extension runs as code in the child with your permissions.
- The child guard blocks any tool call whose name is not on the agent's list. The run then fails.
- The guard checks tool names only. It is not an operating-system sandbox (a boundary the operating system enforces).
- A tool name does not prove what the tool does. Only list tools you trust.
- Agents with `edit`, `write`, `bash` or `powershell` can change files with your permissions. Start them in a folder that is safe to change.
- Personas, tasks and outputs can contain sensitive text. Run folders are private to your user account, and OMPS never deletes them.
