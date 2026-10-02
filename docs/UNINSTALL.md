# How to uninstall

This guide unloads the extension while preserving its run files.

## Stop active runs

1. Run `/ompss` to show current-session status.
2. Cancel each active run with `/ompss cancel <run-id>`.
3. Check its final state with `/ompss status <run-id>`.

Quit Pi if you cannot issue commands. Shutdown stops children and waits for their cleanup.
The run panel and status entry clear when the session ends.
Investigate any cleanup error before removing the extension.

## Remove the package

1. Run `pi remove npm:om-pi-subagents`. For a local copy, move `~/.pi/agent/extensions/ompss/` outside Pi's extensions directory.
2. Start Pi again, or run `/reload`.
3. Check that Pi no longer offers the `ompss` tool or `/ompss` command.

## What remains

| Item                               | What happens                                                            |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `~/.pi/agent/ompss/runs/`          | Saved tasks, personas, events and answers remain.                       |
| Parent Pi session history          | Existing tool calls and result messages remain.                         |
| `~/.pi/agent/om-pi-subagents.yaml` | Your mapping remains for a later installation.                          |
| `~/.pi/agent/om-pi-subagents/`     | Your persona files remain. See the next section to remove them.         |
| Development checkout               | Remains unchanged, including its local tools and ignored host packages. |

OMPSS never deletes saved run directories automatically.
Review their contents before any optional cleanup; they can contain sensitive text.
Remove a directory only after confirming its processes have stopped and its output is no longer needed.

## Remove your own files (optional)

`pi remove` does not delete the mapping file or the persona folder. You created them, so you remove them.

1. Check which folder your `persona:` lines use: `grep persona: ~/.pi/agent/om-pi-subagents.yaml`.
2. If the paths start with `./om-pi-subagents/personas/`, the folder to remove is `~/.pi/agent/om-pi-subagents/`.
   If you used another path, remove that folder instead.
3. Check that no other tool uses the folder.
4. Remove the folder: `rm -r ~/.pi/agent/om-pi-subagents/`.
5. Remove the mapping file: `rm ~/.pi/agent/om-pi-subagents.yaml`.

Skip steps 4 and 5 if you plan to reinstall.

## Reinstall later

1. Follow [installation](INSTALL.md).
2. Check that each mapped agent declares a supported `thinking` value.
3. Run `/reload` and `/ompss list`.
