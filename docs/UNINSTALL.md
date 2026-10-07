# How to uninstall

This guide unloads the extension while preserving its run files.

## Stop active runs

1. Run `/omps` to show current-session status.
2. Cancel each active direct run with `/omps cancel <run-id>` to stop its owned subtree.
3. Check its final state with `/omps status <run-id>`.

Quit Pi if you cannot issue commands. Shutdown stops children and waits for their cleanup.
The run panel and status entry clear when the session ends. Open inspectors close and pending detail reads stop.
Investigate any cleanup error before removing the extension.

## Remove the package

1. Run `pi remove npm:om-pi-subagents`. For a local copy, move `~/.pi/agent/extensions/omps/` outside Pi's extensions directory.
2. Start Pi again, or run `/reload`.
3. Check that Pi no longer offers `omps`, `/omps`, `/omps-settings`, `/subagents-settings` or `/skill:om-pi-subagents`.

Remove explicit child references to the package's skill or managed resources before deleting a local package folder.
Other packages, including `om-pi-todo`, remain installed. Their task histories and preferences stay untouched.

## What remains

Older `ompss/runs/` evidence also remains untouched. Preserve it if you need historical output.
See [manual migration and rollback](INSTALL.md#migrate-from-ompss-to-omps) before moving either run history.
Stop all old sessions and confirm their descendant cleanup first. Never overwrite an existing destination.

| Item                                    | What happens                                                                                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.pi/agent/omps/`                     | Your `config.yaml`, `personas/` and saved `runs/` remain for a later installation.                                                                                                              |
| Parent Pi session history               | Existing tool calls and result messages remain.                                                                                                                                                 |
| Development checkout                    | Remains unchanged, including its local tools and ignored host packages.                                                                                                                         |
| `<config-dir>/pi-subagents/config.json` | Legacy visible-agent preferences remain. Absolute `XDG_CONFIG_HOME` selects the config directory, otherwise `~/.config`. Current versions read this file only as a fallback and never write it. |

Saved evidence remains in `~/.pi/agent/omps/runs/`. OMPS never deletes those directories automatically.
Review their contents before any optional cleanup; they can contain sensitive text.
Remove a directory only after confirming its processes have stopped and its output is no longer needed.

## Remove your own files (optional)

`pi remove` leaves the whole `omps/` folder. Review the settings, personas and saved runs before removing it.

1. Check the selected registry, including any `OMPS_REGISTRY` override.
2. Check which persona paths it uses: `grep persona: ~/.pi/agent/omps/config.yaml`.
3. Confirm that all run processes have stopped and their saved output is no longer needed.
4. Check that no other tool needs the files in `~/.pi/agent/omps/`.
5. Remove that folder only after approval: `rm -r ~/.pi/agent/omps/`.

Keep it if you plan to reinstall or need saved evidence. An overridden registry elsewhere remains separate.
If you have not migrated, the old registry and persona folder also remain; inspect them before any cleanup.
The legacy display preference is separate. Remove only `<config-dir>/pi-subagents/config.json` if you no longer need it; a registry `ui.maxVisibleAgents` value supersedes it.
Leave todo preferences and Pi's `settings.json` unchanged.

## Reinstall later

1. Follow [installation](INSTALL.md).
2. Check that each mapped agent declares a supported `thinking` value.
3. Run `/reload` and `/omps list`.
