# How to uninstall

This guide unloads the extension while preserving its run files.

## Stop active runs

1. Run `/ompss status`.
2. Cancel each active run with `/ompss cancel <run-id>`.
3. Check its final state with `/ompss status <run-id>`.

Quit Pi if you cannot issue commands. Shutdown stops children and waits for their cleanup.
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
| `~/.pi/agent/om-pi-subagents.yaml` | Your mapping and personas remain for a later installation.              |
| Development checkout               | Remains unchanged, including its local tools and ignored host packages. |

OMPSS never deletes saved run directories automatically.
Review their contents before any optional cleanup; they can contain sensitive text.
Remove a directory only after confirming its processes have stopped and its output is no longer needed.

## Reinstall later

1. Follow [installation](INSTALL.md).
2. Run `/reload` and `/ompss list`.
