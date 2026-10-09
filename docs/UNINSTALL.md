# Uninstall

Removing the package keeps your files. Delete them yourself if you want them gone.

## Remove the package

1. Run `/omps`. Cancel each active run with `/omps cancel <run-id>`, which stops its subtree.
2. Run `/omps status <run-id>` to confirm the final state. If you cannot type commands, quit Pi. Quitting stops all children.
3. Run `pi remove npm:om-pi-subagents`. For a local copy, move `~/.pi/agent/extensions/omps/` out of Pi's extensions folder.
4. Run `/reload`.
5. Check that `omps`, `/omps`, `/omps-settings` and `/skill:om-pi-subagents` are gone.

Remove child mappings that point at the package skill. Other packages, including `om-pi-todo`, stay installed.

## What stays

| Item                                    | Note                                                                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `~/.pi/agent/omps/`                     | Your `config.yaml`, `personas/` and `runs/`.                                                                                       |
| `~/.pi/agent/omps/runs/`                | Saved evidence. OMPS never deletes it. It can hold sensitive text.                                                                 |
| Pi session history                      | Past tool calls and results.                                                                                                       |
| `<config-dir>/pi-subagents/config.json` | Old visible-agent preference. Current versions only read it. `<config-dir>` is `$XDG_CONFIG_HOME` when absolute, else `~/.config`. |

Older run history also stays. See [manual migration and rollback](INSTALL.md#migrate-from-ompss-to-omps) before you move it.

## Remove your own files (optional)

1. Check which registry you use, including any `OMPS_REGISTRY` override.
2. List the persona paths it uses: `grep persona: ~/.pi/agent/omps/config.yaml`.
3. Confirm that no run is active and you no longer need the saved output.
4. Run `rm -r ~/.pi/agent/omps/`.

A registry elsewhere stays. An unmigrated old registry and persona folder also stay. Leave todo preferences and Pi's `settings.json` alone.

## Reinstall

1. Follow [Install](INSTALL.md).
2. Check that each agent has a `thinking` value.
3. Run `/reload`, then `/omps list`.
