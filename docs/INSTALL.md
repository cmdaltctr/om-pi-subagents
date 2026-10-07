# How to install

This guide installs OMPS into Pi. After installation, [set up agents](SETUP.md), then see [usage](USAGE.md).

## Before you start

You need Pi and Bun. Native viewer tests cover Pi 0.99.1 and 1.0.4 in regular and fullscreen modes.
Development checks use Bun 1.4.2 and Node.js 22.12 or newer.

Pi supplies its host packages, including `@earendil-works/pi-tui`. OMPS installs `yaml` as its runtime dependency.
Keep `bunfig.toml` beside `package.json` so Bun leaves host peers out of `node_modules`.

## Install from npm

1. Run `pi install npm:om-pi-subagents`.
2. Start Pi, or run `/reload` in your existing session.
3. Run `/omps list`.

Pi records the package in the `packages` list of `~/.pi/agent/settings.json`.
To install for one project only, add `-l` (`--local`). Pi then writes `.pi/settings.json` in that project.
Pi loads a project install only after you trust the project.

**`npm warn install-scripts` lines are harmless.** npm 11.5 and newer skip dependency install
scripts until you approve them, and repeat the reminder on every install or update.
Any packages npm lists come from your other Pi packages, not from OMPS.
OMPS has one runtime dependency, `yaml`, which has no install script.
OMPS works with those scripts skipped. To stop the reminder, deny the listed packages
in Pi's shared package folder, normally `~/.pi/agent/npm/`:

```sh
cd ~/.pi/agent/npm && npm install-scripts deny <package-name>
```

The denial covers that folder only. It changes no other project.

## Install a local copy

Use this for development only.

1. Copy the project into `~/.pi/agent/extensions/omps/`.
2. Open a terminal in that directory.
3. Install its runtime dependency:

   ```sh
   bun install --production
   ```

4. Start Pi, or run `/reload` in your existing session.
5. Run `/omps list`.

OMPS ships no agents. A new installation answers `No personas mapped.`
Your mapping lives in `~/.pi/agent/omps/config.yaml`, outside the package.
Set `OMPS_REGISTRY` to use another file.

You do not need `.pi-host/` to use the extension. Pi supplies those packages at runtime.
Keep the package's source modules together when copying it; the viewer and settings modules are required imports.
After loading, use `/omps inspect` for retained runs and `/omps-settings` for operator preferences.

## Packaged skill and optional todo

A package install exposes `/skill:om-pi-subagents` when Pi skill commands are enabled.
For a local checkout, load it as a package with `pi install ./path/to/checkout` to discover the skill.
Copying only `src/index.ts` as an extension does not register package skills.
Use the installed package's skill path for explicit child loading. See [usage](USAGE.md#nested-results-and-local-todos).

`om-pi-todo` stays optional. Install it separately if needed, then explicitly map its extension and approve `todo`.
The child uses a local normal-mode list; parent tasks and global preferences remain unchanged.
Existing YAML with omitted `limits` keeps one direct child and maximum depth one.

## Next step: add an agent

1. Follow [Set up agents](SETUP.md) to create the mapping file and a persona.
2. Run `/reload`.
3. Run `/omps list` to check the agent name and allowed tools.
4. Run `/omps` to see current-session status.

Each agent must declare a supported `thinking` value. Add it to older mappings before launching.
The `model` field stays optional. The `● Agents` tree above the editor shows each running agent; press Down in an empty prompt to select an agent. Inspection shows live tools and saved results.
To run an agent, see [usage](USAGE.md).

## Update, pin or choose a version

These commands change the Pi package list. After each change, start Pi or run `/reload` in an open session.

### Check the installed version

1. Run `pi list`.
2. Find `npm:om-pi-subagents`. The line below it shows the install folder.
3. Read the `version` field in `package.json` inside that folder.

For a personal install, the folder is normally `~/.pi/agent/npm/node_modules/om-pi-subagents/`:

```sh
grep '"version"' ~/.pi/agent/npm/node_modules/om-pi-subagents/package.json
```

To see the newest published version, run `npm view om-pi-subagents version`.

### Update to the newest version

1. Run `pi update npm:om-pi-subagents`.
2. Start Pi, or run `/reload`.

`pi update --extensions` updates all your Pi packages. `pi update` with no target updates Pi itself, and no packages.

### Pin a version

A pinned install stays on one exact version.

1. Run `pi install npm:om-pi-subagents@0.2.0`.
2. Start Pi, or run `/reload`.

Pi saves `npm:om-pi-subagents@0.2.0` in your settings. `pi update` skips a pinned package and does not report an update for it.
To move a pinned install, run `pi install` again with the new version.

### Use a dist-tag

A dist-tag is a name on npm that points at one version, for example `latest`.
OMPS has only the `latest` tag. It points at the newest stable release.
Run `npm view om-pi-subagents dist-tags` to see the current tags.

A plain `pi install npm:om-pi-subagents` already uses `latest`.
To return a pinned install to the newest version:

1. Run `pi install npm:om-pi-subagents@latest`.
2. Start Pi, or run `/reload`.

A tag is not pinned. `pi update npm:om-pi-subagents` follows the tag to each new release.

### Roll back to an older version

Stop every active subtree before rollback. Older parsers reject `limits`, so remove that section from their mapping.
Keep your saved run files; older versions cannot resume nested runs.

1. Run `npm view om-pi-subagents versions` to list published versions.
2. Run `pi install npm:om-pi-subagents@0.1.0`, using the version you want.
3. Start Pi, or run `/reload`.
4. Run `/omps list`.

Pi replaces the old settings entry, so the rolled-back version stays pinned.
Version 0.1.0 accepts the `thinking` field, so a 0.2.0 mapping still loads.
Use `npm:om-pi-subagents@latest` to leave the rollback.

### Upgrade notes

Read [CHANGELOG.md](../CHANGELOG.md) before each upgrade.

**Moving settings into `omps/` is a breaking change.** The default is now
`<agent-dir>/omps/config.yaml`, with personas conventionally in `omps/personas/`.
When only the old default file exists, OMPS blocks listing, launches and settings saves.
Follow [Move settings into the OMPS folder](#move-settings-into-the-omps-folder).
An explicit `OMPS_REGISTRY` override remains supported, including the old filename.

The versioned examples below describe historical paths used before this move.

**0.1.0 to 0.2.0 is a breaking change.** Every agent in the mapping must now set `thinking`.
Without it, OMPS rejects the whole registry, and no run starts.
Allowed values are `off`, `minimal`, `low`, `medium`, `high`, `xhigh` and `max`.

Before, in 0.1.0:

```yaml
version: 1
agents:
  reader:
    persona: ./om-pi-subagents/personas/reader.md
    tools: [read, grep, find, ls]
```

After, for 0.2.0:

```yaml
version: 1
agents:
  reader:
    persona: ./om-pi-subagents/personas/reader.md
    tools: [read, grep, find, ls]
    thinking: off
```

1. Add `thinking` to each agent in `~/.pi/agent/om-pi-subagents.yaml`.
2. Run `pi update npm:om-pi-subagents`.
3. Start Pi, or run `/reload`.
4. Run `/omps list` and check that each agent appears.

## Move settings into the OMPS folder

This manual procedure moves the default registry and its conventional persona folder.
OMPS never moves, copies or rewrites these files. If you use a custom registry or persona folder,
check its paths and adapt the procedure first. Record the installed version with `pi list` before upgrading.

### Stop and back up settings

1. Run `/omps` in every parent session to find active runs.
2. Cancel each owned subtree with `/omps cancel <run-id>`.
3. Confirm cleanup with `/omps status <run-id>` before closing all affected Pi sessions.
4. Resolve any cleanup failure before moving files.
5. Create a private backup outside the agent directory:

   ```sh
   set -eu
   umask 077
   agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
   backup_dir="$HOME/omps-backup-$(date +%Y%m%d-%H%M%S)"
   mkdir -m 700 "$backup_dir"
   cp -p "$agent_dir/om-pi-subagents.yaml" "$backup_dir/registry.yaml"
   cp -Rp "$agent_dir/om-pi-subagents/personas" "$backup_dir/personas"
   ```

6. Compare the backup with the originals before continuing.

Keep the backup private. It contains your persona instructions and operator settings.
Saved runs stay in `omps/runs/`; this procedure leaves their content and ownership unchanged.

### Move and edit the mapping

Stop if the new registry exists, including a symbolic link, or if a persona filename collides.
Compare both copies before proceeding. The script checks every name before moving any file.

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

1. Edit `omps/config.yaml` in your selected agent directory.
2. Change each `persona: ./om-pi-subagents/personas/<name>.md` to `persona: ./personas/<name>.md`.
3. Check relative `skills` and `extensions` paths, which also resolve from the YAML folder.
4. Update those paths or use their existing absolute paths.
5. Remove an old `OMPS_REGISTRY` override if you want the new default.
6. Install the updated package, then start a fresh Pi session.
7. Run `/omps list` and check that every agent appears.
8. Run one small task and check its saved result.

Persona paths into `omps/runs/` are refused, including symbolic links.
Keep trusted persona instructions in `omps/personas/`.
Retain the backup until you confirm the new installation works. Ask before deleting it or any empty old folder.

### Roll back the settings move

1. Stop new sessions and confirm cleanup of every descendant.
2. Install the version recorded before upgrading.
3. Check that the old registry destination is absent, including symbolic links.
4. If it exists, stop and compare it with the backup.
5. Restore the backed-up registry to `<agent-dir>/om-pi-subagents.yaml`, preserving its file mode.
6. Check that the old persona folder is empty before restoring its backed-up files.
7. Stop and compare any colliding persona filenames before copying.
8. Restore the previous environment overrides, then restart Pi and check its agent list.

Keep the new registry, personas and run evidence until you decide what to preserve.
An explicit `OMPS_REGISTRY=<agent-dir>/om-pi-subagents.yaml` can also select the restored old mapping
with the current version. Its persona paths still resolve from the old YAML folder.
Restoring the backup restores the previous bytes. It cannot resume tasks or restore former session ownership.

## Migrate from OMPSS to OMPS

This release changes the runtime namespace. Migration is manual; installation never rewrites operator files or saved sessions.

### Stop and back up first

1. Use the old `/ompss` command to find active direct runs in every old parent session.
2. Cancel each owned subtree with `/ompss cancel <run-id>`.
3. Confirm cleanup through `/ompss status <run-id>` before closing those sessions.
4. Resolve any cleanup failure before continuing. Quit all affected Pi sessions.
5. Set `agent_dir` to `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}` in your terminal.
6. Create a private backup outside the agent directory, with mode `0700`.
7. Copy your selected registry, persona folder, affected Pi settings and old run folders into that backup.
8. Preserve file modes and verify the copies before changing the originals.

Back up the file selected by `OMPSS_REGISTRY` if you used an override. Include project `.pi/settings.json`,
launcher configuration and any direct-copy extension folder that will move. Keep backups private because
personas, tasks, saved output and Pi settings can contain sensitive text.

### Update operator configuration

| Old interface                                       | New interface                  |
| --------------------------------------------------- | ------------------------------ |
| Exact `ompss` delegation tool approval              | Exact `omps` approval          |
| `/ompss`, `/ompss-settings`                         | `/omps`, `/omps-settings`      |
| `OMPSS_REGISTRY`, `OMPSS_PI_BIN`                    | `OMPS_REGISTRY`, `OMPS_PI_BIN` |
| Other `OMPSS_*` launcher, process or test variables | Matching `OMPS_*` names        |
| `extensions/ompss/` direct-copy folder              | `extensions/omps/`             |
| `ompss/runs/` saved evidence                        | `omps/runs/` for new work      |

1. Replace only exact `ompss` entries in the relevant YAML `tools` lists with `omps`.
2. Update command references in your persona instructions and agent prompts.
3. Rename configured environment variables in shells, launchers and CI settings.
4. Keep `npm:om-pi-subagents` package entries unchanged.
5. Keep the shipped `om-pi-subagents` skill name unchanged. For current registry paths, also follow [Move settings into the OMPS folder](#move-settings-into-the-omps-folder).
6. Keep `/subagents-settings` if you use that generic alias.

The independent `<config-dir>/pi-subagents/config.json` display fallback also stays in place.
A valid visible-agent value remains effective while YAML omits `ui.maxVisibleAgents`.
After restart, use `/omps-settings` to confirm its import into YAML if desired.
Neither the import nor the rename changes todo preferences or memory data.

Old environment names are ignored for configuration. An old child marker is refused.
Old delegation approval cannot enable `omps`; unavailable approved tools fail readiness before task submission.
Restart every affected session after updating. Mixed-version parents and children cannot share the new protocol.

### Move a direct-copy installation, if used

Run this only after backup and confirmed cleanup. The destination must be absent, including symbolic links.
If it exists, stop and compare both copies. Keep both histories until you decide what to preserve.

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

Update explicit extension paths in global/project Pi settings and mapped resources after the move.
A path such as `extensions/ompss/src/index.ts` becomes `extensions/omps/src/index.ts`.
Package installations and the shipped skill name need no folder rename.

### Move saved runs, if wanted

New work never discovers or moves `ompss/runs/`. Leaving it untouched is supported.
For a manual same-filesystem move, run this only after backup and confirmed cleanup:

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

Do not merge overlapping session or run IDs. If both roots exist, compare them before transferring any session directory.
Keep every evidence file byte-for-byte intact. `status.json`, configuration snapshots and logs can retain original
absolute paths and old names. Moving folders preserves files; it cannot resume tasks or transfer ownership.
The new inspector does not reconstruct arbitrary former sessions. Old transcript identifiers have no compatibility renderer.

### Check the migrated installation

1. Install the renamed release after editing operator configuration.
2. Start a fresh Pi session.
3. Run `/omps list` and check exact tool approvals.
4. Run `/omps` and `/omps-settings`.
5. Run one disposable nested task if you configured delegation.
6. Compare moved evidence bytes with the backup before retiring any copy.

### Roll back the namespace change

1. Stop new parent sessions and confirm cleanup of all their children.
2. Restore the backed-up operator registry, persona instructions and affected Pi settings.
3. Restore the previous package version and environment names.
4. Move directories back only when the old destinations are absent, including symbolic links.
5. If either destination exists, stop and preserve both histories before comparing them.
6. Keep newly created OMPS evidence separate and leave historical file content unchanged.
7. Restart Pi with the restored version and check its commands before launching work.

Rollback never requires approving an already published npm version again.

## Set up development tools

Run these commands from a development checkout:

```sh
bun install
bun run setup:host
bun run ci
```

Host setup downloads Pi 0.99.1 and typebox 1.3.27 into ignored `.pi-host/`.
It uses Bun. Vite is a direct development dependency because automatic peer
installation is disabled for the whole project.

The gate checks formatting, lint, types and tests in that order.
After committing a change, run `bun run ci:clean` to check a fresh clone of HEAD.
See [AGENTS.md](../AGENTS.md) for commands and module boundaries.

## Installation problems

### `/omps` is missing

1. Run `pi list` and check that `om-pi-subagents` is there. For a local copy, check that `src/index.ts` is inside `~/.pi/agent/extensions/omps/`.
2. Run `/reload`.
3. Read any extension-loading error before retrying.

### Host-package warnings appear

1. Check that Pi host packages remain peer dependencies in `package.json`.
2. Restore `peer = false` in `bunfig.toml` if it was changed.
3. Install again from the lockfile in a fresh checkout.

### The registry is empty or invalid

1. Check the exact field named in the error.
2. Edit `~/.pi/agent/omps/config.yaml` using the supported fields in [Set up agents](SETUP.md).
   For a missing `thinking` field, add `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`.
3. Run `/omps list` again.

A missing mapping file means no agents. An empty file is rejected with `version: required`. Invalid settings block new launches until corrected.
