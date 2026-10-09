# Install

You need Pi and Bun. After installing, [set up agents](SETUP.md), then [run them](USAGE.md).

## From npm

1. Run `pi install npm:om-pi-subagents`.
2. Start Pi, or run `/reload`.
3. Run `/omps list`. A new install answers `No personas mapped.`

Add `-l` to install for one project only. Pi loads a project install after you trust the project.
Lines such as `npm warn install-scripts` come from your other Pi packages. OMPS has one runtime dependency, `yaml`, and it has no install script.

## From a local copy (development)

1. Copy the project to `~/.pi/agent/extensions/omps/`.
2. Run `bun install --production` in that folder.
3. Start Pi, or run `/reload`.
4. Run `/omps list`.

Keep `bunfig.toml` beside `package.json`, and keep all source modules together. To get `/skill:om-pi-subagents` from a checkout, run `pi install ./path/to/checkout`. Copying `src/index.ts` alone loads no skill.

Your mapping lives in `~/.pi/agent/omps/config.yaml`, outside the package. Set `OMPS_REGISTRY` to use another file.

## Update, pin or roll back

Start Pi or run `/reload` after each change.

| You want to             | Run                                                  |
| ----------------------- | ---------------------------------------------------- |
| Find the install folder | `pi list`, then read `version` in its `package.json` |
| See the newest version  | `npm view om-pi-subagents version`                   |
| Update                  | `pi update npm:om-pi-subagents`                      |
| Pin a version           | `pi install npm:om-pi-subagents@<version>`           |
| Follow `latest` again   | `pi install npm:om-pi-subagents@latest`              |
| See dist-tags           | `npm view om-pi-subagents dist-tags`                 |
| List all versions       | `npm view om-pi-subagents versions`                  |

`pi update` skips a pinned package. `pi update --extensions` updates all Pi packages. `pi update` with no target updates Pi only.

To roll back, run the pin command with the older version. Pi then keeps that version pinned. Before you do:

1. Stop every active subtree.
2. Remove `limits` from your mapping. Older versions reject it.
3. Keep your saved run files. Older versions cannot resume nested runs.

Read [CHANGELOG.md](../CHANGELOG.md) before each upgrade.

**0.2.0 breaking change.** Every agent needs a `thinking` value: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`. Without it OMPS rejects the whole file and no run starts.

## Move settings into the OMPS folder

The default registry is now `<agent-dir>/omps/config.yaml`, with personas in `omps/personas/`.
While only the old default file exists, OMPS blocks listing, launches and settings saves. OMPS never moves your files. An explicit `OMPS_REGISTRY` still works.

1. Run `/omps` in every parent session. Cancel each run with `/omps cancel <run-id>`.
2. Run `/omps status <run-id>` to confirm cleanup, then close the sessions.
3. Copy `om-pi-subagents.yaml` and `om-pi-subagents/personas/` to a private backup outside the agent directory.
4. Run this script. It stops if any destination exists.

<!-- migration-test: settings -->

```sh
set -eu
umask 077
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
source="$agent_dir/om-pi-subagents.yaml"
old_personas="$agent_dir/om-pi-subagents/personas"
destination="$agent_dir/omps/config.yaml"
personas="$agent_dir/omps/personas"
if [ ! -f "$source" ] || [ -L "$source" ] || [ ! -d "$old_personas" ] || [ -L "$old_personas" ]; then
  printf '%s\n' 'Check the old registry and persona folder before moving settings.' >&2
  exit 1
fi
if [ -L "$agent_dir/omps" ] || [ -L "$personas" ] || [ -e "$destination" ] || [ -L "$destination" ]; then
  printf '%s\n' 'Destination exists or is a symbolic link. Stop and compare settings.' >&2
  exit 1
fi
for file in "$old_personas"/*.md; do
  [ -e "$file" ] || [ -L "$file" ] || continue
  name="${file##*/}"
  if [ -e "$personas/$name" ] || [ -L "$personas/$name" ]; then
    printf '%s\n' "Persona already exists: $personas/$name. Stop and compare both files." >&2
    exit 1
  fi
done
mkdir -p "$personas"
for file in "$old_personas"/*.md; do
  [ -e "$file" ] || [ -L "$file" ] || continue
  mv "$file" "$personas/"
done
mv "$source" "$destination"
```

5. In `omps/config.yaml`, change each `persona: ./om-pi-subagents/personas/<name>.md` to `persona: ./personas/<name>.md`.
6. Check relative `skills` and `extensions` paths. They resolve from the YAML folder.
7. Start a fresh Pi session and run `/omps list`.

To undo, stop all sessions and install the previous version. Check that the old registry destination is absent, then restore the backup to the old paths and keep its file mode. Stop and compare anything that already exists. Or set `OMPS_REGISTRY=<agent-dir>/om-pi-subagents.yaml` to select the restored mapping with the current version; its persona paths resolve from the old YAML folder.

## Migrate from OMPSS to OMPS

The runtime namespace changed. Migration is manual.

1. Cancel active runs with `/ompss cancel <run-id>`. Confirm with `/ompss status <run-id>`.
2. Quit all affected Pi sessions.
3. Back up your registry, personas, Pi settings and old run folders to a private folder. Include the file that `OMPSS_REGISTRY` selected, project `.pi/settings.json`, launcher configuration and any direct-copy extension folder.
4. Apply the table below to YAML, personas, shells, launchers and CI. Update command references inside persona instructions.

| Old                                                  | New                       |
| ---------------------------------------------------- | ------------------------- |
| `ompss` in `tools` lists                             | `omps`                    |
| `/ompss`, `/ompss-settings`                          | `/omps`, `/omps-settings` |
| `OMPSS_REGISTRY`, `OMPSS_PI_BIN` and other `OMPSS_*` | `OMPS_*`                  |
| `extensions/ompss/`                                  | `extensions/omps/`        |
| `ompss/runs/`                                        | `omps/runs/`              |

Keep the `npm:om-pi-subagents` package entry, the skill name and `/subagents-settings`. Old variable names are ignored. OMPS refuses an old child marker. An old tool approval cannot enable `omps`.

To move a direct-copy install, run this once the destination is absent:

<!-- migration-test: extension -->

```sh
set -eu
umask 077
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
source="$agent_dir/extensions/ompss"
destination="$agent_dir/extensions/omps"
if [ ! -d "$source" ] || [ -L "$source" ]; then
  printf '%s\n' 'Check the old direct-copy folder before moving it.' >&2
  exit 1
fi
if [ -e "$destination" ] || [ -L "$destination" ]; then
  printf '%s\n' 'Destination exists. Stop and compare both extension folders.' >&2
  exit 1
fi
mv "$source" "$destination"
```

Then update explicit extension paths in your Pi settings.

Saved runs may stay where they are. To move them, run this once the destination is absent:

<!-- migration-test: runs -->

```sh
set -eu
umask 077
agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
source="$agent_dir/ompss/runs"
destination="$agent_dir/omps/runs"
if [ ! -d "$source" ] || [ -L "$source" ] || [ -L "$agent_dir/omps" ]; then
  printf '%s\n' 'Check the source and destination paths before moving runs.' >&2
  exit 1
fi
if [ -e "$destination" ] || [ -L "$destination" ]; then
  printf '%s\n' 'Destination exists. Stop and compare both run histories.' >&2
  exit 1
fi
mkdir -p "$agent_dir/omps"
mv "$source" "$destination"
```

Moved runs cannot resume. Never merge overlapping session or run ids.

Finish: install the new release, start a fresh Pi session and run `/omps list`. Restart every affected session, because parents and children on different versions cannot talk.
To roll back, restore the backup and the previous version, then move folders back only if the old paths are free.

## Development

See [MAINTAINING.md](https://github.com/cmdaltctr/om-pi-subagents/blob/main/docs/MAINTAINING.md).

## Problems

**`/omps` is missing.**

1. Run `pi list` and look for `om-pi-subagents`. For a local copy, check `~/.pi/agent/extensions/omps/src/index.ts`.
2. Run `/reload`.
3. Read any extension-loading error.

**Host-package warnings.** Pi host packages must stay peer dependencies. Restore `peer = false` in `bunfig.toml` if you changed it.

**Registry empty or invalid.**

1. Read the field named in the error.
2. Fix `~/.pi/agent/omps/config.yaml`. See [Set up agents](SETUP.md).
3. Run `/omps list`.

A missing file means no agents. An empty file fails with `version: required`. Invalid settings block launches until you fix them.
