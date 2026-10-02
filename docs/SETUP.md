# Set up your agents

OMPSS runs agents. An agent is a name in one YAML file, a persona file, a list of allowed tools and a thinking level.
You can also give it a model, skills and extensions. OMPSS ships no agents, so you create each one yourself.

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
├── om-pi-subagents.yaml          # the mapping file
├── personas/                     # persona files (any folder inside ~/.pi/agent/ works)
│   ├── reader.md
│   └── reviewer.md
├── mcp.json                      # Pi's own MCP server list, if you use MCP tools
└── ompss/
    └── runs/<session-id>/<run-id>/   # one private folder per run, written by OMPSS
```

Rules for these locations:

- OMPSS reads the mapping file from `~/.pi/agent/om-pi-subagents.yaml`.
- If you do not have this file, OMPSS has no agents. `/ompss list` answers `No personas mapped.`
- Persona paths are relative to the folder that holds the mapping file.
- A persona must stay inside that folder after symbolic links are resolved. A path or link that leads outside it is rejected.
- The package contains no mapping file and no personas. Package updates do not write to your agent directory.

Two environment variables change these locations:

| Variable              | Effect                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `OMPSS_REGISTRY`      | Full path of the mapping file to use instead. Persona paths then resolve from that file's folder.                  |
| `PI_CODING_AGENT_DIR` | Replaces `~/.pi/agent` as the agent directory. The default mapping file and the `ompss/runs/` folder move with it. |

Set either variable before you start Pi.

## Set up your first agent

This procedure makes an agent called `reader`. It reads files and answers questions about them.

1. Install OMPSS. See [How to install](INSTALL.md).
2. Run `/reload` in Pi.
3. Open a terminal.
4. Make the personas folder:

   ```sh
   mkdir -p ~/.pi/agent/personas
   ```

5. Write the persona file:

   ```sh
   cat > ~/.pi/agent/personas/reader.md <<'EOF'
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
       persona: ./personas/reader.md
       tools: [read, grep, find, ls]
       thinking: off
   EOF
   ```

7. In Pi, run `/ompss list`. The answer is:

   ```text
   reader: tools [read, grep, find, ls]
   ```

8. Start a run:

   ```text
   /ompss run reader Summarise the README
   ```

   The answer gives the run id and the run folder:

   ```text
   Started run <run-id> (reader) in the background.
   Files: <agent-dir>/ompss/runs/<session-id>/<run-id>
   Check it with "ompss status <run-id>". The result arrives as a follow-up message.
   ```

9. Wait for the result. It arrives as a new message in the parent conversation.

The run uses the parent's working directory and the parent's model. To see progress, run `/ompss` or `/ompss status <run-id>`.
See [How to use](USAGE.md) for the panel, run states and cancellation.

If step 7 shows an error, find the message in [Common errors and fixes](#common-errors-and-fixes).

## Write a persona

A persona is plain Markdown text. OMPSS adds it to the end of the child Pi's system prompt (the standing instructions the model reads before the task).
Pi keeps its own system prompt and tool descriptions. Your persona comes after them.
The task you give in `/ompss run` reaches the child as a separate message.

### What happens to the file

1. OMPSS reads the persona when you run `/ompss list` or `/ompss run`.
2. At launch, OMPSS saves a copy as `persona.md` in the run folder.
3. The child receives that copy through Pi's `--append-system-prompt` option.

A run uses the text that existed when it started. Edits after that point apply to the next run only.

### Rules the file must follow

- Read as UTF-8 text.
- Maximum size is 262,144 bytes (256 KiB).
- It must contain text other than spaces and blank lines.
- It must not start with `---`. OMPSS treats that as frontmatter (a settings block) and rejects it. Put all settings in the mapping file.
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

A read-only code reviewer, saved as `~/.pi/agent/personas/reviewer.md`:

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

| Key       | Required | Value                                                            |
| --------- | -------- | ---------------------------------------------------------------- |
| `version` | yes      | The number `1`. The text `'1'` and other numbers are rejected.   |
| `agents`  | yes      | A mapping of agent names to settings. Use `agents: {}` for none. |

No other top-level key is allowed.

### Agent names

Each key under `agents` is an agent name. You use it in `/ompss run <name> <task>`.

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

`/ompss list` marks an agent with `edit`, `write`, `bash` or `powershell` as `write-capable`.
`codemode` and `tool_search` can only call tools that are also on the list.

MCP tools come from an MCP server (a separate program that gives Pi extra tools). Their names have this form:

```text
mcp__<server>__<tool>
```

`<server>` is the server's name in Pi's `mcp.json`. `<tool>` is the tool's own name. For a server called `context7`:

```yaml
tools:
  - read
  - tool_search
  - mcp__context7__resolve-library-id
  - mcp__context7__query-docs
```

- Add `tool_search` when the agent must find deferred MCP tools (tools Pi does not show to the model until it searches for them).
- Listing an MCP tool does not set up its server. Configure the server in Pi first, for example with `pi mcp add`, and check it with `pi mcp list`.
- The old tool name `mcp` no longer exists. Use the native `mcp__<server>__<tool>` names.
- A tool from an extension needs that extension in `extensions`, because the child loads no other extensions.

Before the task is sent, OMPSS checks that every listed tool exists in the child. A missing tool stops the run before the model sees the task.

### `thinking`

`thinking` is required for every agent. The child never takes the parent's thinking level.
OMPSS passes the value to Pi as `--thinking`. Pi limits it to what the selected model supports.

### `model`

Write the model as `provider/id`, the same form Pi uses. Run `pi --list-models` to see the names Pi knows.

- Without `model`, the child uses the parent's current model.
- The model must be known to the child and have configured credentials. If not, the run fails before the task is sent.
- OMPSS does not choose another model when this check fails.
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

### Complete example

This file maps three agents: a read-only reviewer, a writer and a documentation researcher.

```yaml
version: 1
agents:
  reviewer:
    persona: ./personas/reviewer.md
    tools: [read, grep, find, ls]
    thinking: medium

  writer:
    persona: ./personas/writer.md
    tools: [read, grep, find, ls, edit, write]
    model: my-provider/my-model # replace with a name from `pi --list-models`
    thinking: low

  docs-researcher:
    persona: ./personas/docs-researcher.md
    tools:
      - read
      - tool_search
      - mcp__context7__resolve-library-id
      - mcp__context7__query-docs
    thinking: low
    skills:
      - ~/.pi/agent/skills/citations/SKILL.md
```

Each persona file must exist before `/ompss list` succeeds. `/ompss list` then shows:

```text
reviewer: tools [read, grep, find, ls]
writer: tools [read, grep, find, ls, edit, write]; model my-provider/my-model; write-capable
docs-researcher: tools [read, tool_search, mcp__context7__resolve-library-id, mcp__context7__query-docs]
```

### YAML features OMPSS rejects

- Duplicate keys, including two agents with the same name.
- Aliases and anchors (`&name`, `*name`).
- Custom tags such as `!custom`.
- A mapping file larger than 262,144 bytes.

## When changes apply

OMPSS reads the mapping file and every persona again each time you run `/ompss list` or `/ompss run`.
The `ompss` tool's `list` and `run` actions do the same.

- Edits to the mapping file or a persona apply at the next `list` or `run`. You do not need `/reload`.
- A run that already started keeps the settings and persona text it started with.
- `/ompss`, `/ompss status` and `/ompss cancel` do not read the mapping file.
- If the file is invalid, `list` and `run` show the error. No run starts until you fix the file. OMPSS never falls back to older settings.

Run `/reload` after you install, update or remove the package. Changes to the agent files do not need it.

## Common errors and fixes

Errors appear in Pi as `OMPSS: <field>: <problem>`. The field shows the place in the mapping file, for example `agents.reader.tools`.
OMPSS reports the first problem it finds. Fix it, then run `/ompss list` again.

| Message (or part of it)                                                  | Cause                                                          | Fix                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `No personas mapped.`                                                    | No mapping file, or `agents: {}`                               | Create the mapping file. See [Set up your first agent](#set-up-your-first-agent).                        |
| `version: required`                                                      | No `version` key. An empty mapping file also gives this.       | Add `version: 1` as the first line.                                                                      |
| `version: unsupported ...; expected 1`                                   | `version` is not the number 1                                  | Write `version: 1` without quotes.                                                                       |
| `agents: required mapping (use {} for no agents)`                        | `agents` is missing or is not a mapping                        | Add `agents:` with agents under it, or `agents: {}`.                                                     |
| `<key>: unknown field`                                                   | A top-level key other than `version` or `agents`               | Remove the key or correct its spelling.                                                                  |
| `agents.<name>.<field>: unknown field`                                   | A misspelt or unsupported agent field, such as `toolz`         | Use only the fields in [Agent fields](#agent-fields).                                                    |
| `invalid name; use [a-z][a-z0-9-]{0,63}`                                 | Capital letter, underscore, leading digit or too long          | Rename the agent. See [Agent names](#agent-names).                                                       |
| `agents.<name>: must be a mapping`                                       | The agent has no fields under it                               | Indent its fields under the name.                                                                        |
| `persona: required path`                                                 | No `persona` field, or it is empty                             | Add `persona: ./personas/<name>.md`.                                                                     |
| `persona: cannot read <path>`                                            | The persona file does not exist                                | Create the file, or correct the path relative to the mapping folder.                                     |
| `resolves outside the extension directory`                               | The path or a symbolic link leads outside the mapping folder   | Move the persona into the mapping file's folder.                                                         |
| `cannot read <path> as a file`                                           | The path is a folder, or you have no read permission           | Point to a file. Check its permissions.                                                                  |
| `<path> is empty`                                                        | The persona has only spaces or blank lines                     | Write the persona text.                                                                                  |
| `has frontmatter; put settings in om-pi-subagents.yaml`                  | The persona starts with `---`                                  | Remove the block at the top. Move its settings to the mapping file.                                      |
| `larger than 262144 bytes`                                               | The persona or mapping file is over 256 KiB                    | Make the file shorter.                                                                                   |
| `tools: required (use [] for no tools)`                                  | No `tools` field                                               | Add `tools: [...]`, or `tools: []`.                                                                      |
| `tools: must be a list of tool names`                                    | `tools` is not a list                                          | Write it as `[read, grep]` or as a `-` list.                                                             |
| `is not an exact tool name (no wildcards or selectors)`                  | A wildcard, space, colon or empty name                         | Write each tool's exact name.                                                                            |
| `thinking: required; set one of off, minimal, ...`                       | No `thinking` field                                            | Add `thinking: off` or another level.                                                                    |
| `thinking: must be one of off, minimal, ...`                             | Unknown level, a number or an empty value                      | Use one of the listed levels.                                                                            |
| `model: must be a non-empty string`                                      | `model` is empty, a number or a list                           | Write `provider/id`, or remove the field.                                                                |
| `skills: must be a list of paths`, `extensions: must be a list of paths` | The value is not a list                                        | Write the paths as a list.                                                                               |
| `skills[0]: cannot read <path>`, `extensions[0]: cannot read <path>`     | The path does not exist. For skills, a folder also gives this. | Correct the path. Point a skill to its `SKILL.md` file.                                                  |
| `malformed YAML (...)`                                                   | YAML syntax error, such as a missing bracket                   | Fix the line named in the message.                                                                       |
| `duplicate key`                                                          | The same key appears twice, often an agent name                | Rename or remove the second one.                                                                         |
| `aliases are not allowed`                                                | The file uses `&` anchors or `*` aliases                       | Write each value out in full.                                                                            |
| `custom tag ... is not allowed`                                          | The file uses a tag such as `!custom`                          | Remove the tag.                                                                                          |
| `top level must be a mapping`                                            | The file is a list or a single value                           | Start with `version: 1` and `agents:`.                                                                   |
| `unknown agent "<name>"; mapped agents: ...`                             | The name in `/ompss run` is not in the mapping file            | Use a name that `/ompss list` shows.                                                                     |
| `the task cannot start with a slash`                                     | The task starts with `/`                                       | Reword the task.                                                                                         |
| `child is not ready: tool "<name>" is not registered`                    | A listed tool does not exist in the child                      | Check the exact name. For MCP tools, configure the server in Pi. For extension tools, add the extension. |
| `model ... is not in the model registry`                                 | The child does not know the model                              | Correct `model`, or add the provider extension.                                                          |
| `model ... has no configured authentication`                             | The model has no credentials                                   | Log in to the provider or set its key in Pi.                                                             |
| `permission violation: <tool> is not approved`                           | The model called a tool that is not on the list                | Add the tool if the agent needs it. Otherwise tighten the persona.                                       |

## Security

- Personas and extensions are trusted input. An extension runs as code in the child with your permissions.
- The child guard blocks any tool call whose name is not on the agent's list. The run then fails.
- The guard checks tool names only. It is not an operating-system sandbox (a boundary the operating system enforces).
- A tool name does not prove what the tool does. Only list tools you trust.
- Agents with `edit`, `write`, `bash` or `powershell` can change files with your permissions. Start them in a folder that is safe to change.
- Personas, tasks and outputs can contain sensitive text. Run folders are private to your user account, and OMPSS never deletes them.
