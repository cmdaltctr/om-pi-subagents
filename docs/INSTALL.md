# How to install

This guide installs OMPSS into Pi. After installation, [set up agents](SETUP.md), then see [usage](USAGE.md).

## Before you start

You need Pi and Bun. This project is tested with Pi 0.99.1.
Development checks use Bun 1.4.2 and Node.js 22.12 or newer.

Pi supplies its host packages. OMPSS installs `yaml` as its runtime dependency.
Keep `bunfig.toml` beside `package.json` so Bun leaves host peers out of `node_modules`.

## Install from npm

1. Run `pi install npm:om-pi-subagents`.
2. Start Pi, or run `/reload` in your existing session.
3. Run `/ompss list`.

Pi records the package in the `packages` list of `~/.pi/agent/settings.json`.
To install for one project only, add `-l` (`--local`). Pi then writes `.pi/settings.json` in that project.
Pi loads a project install only after you trust the project.

## Install a local copy

Use this for development only.

1. Copy the project into `~/.pi/agent/extensions/ompss/`.
2. Open a terminal in that directory.
3. Install its runtime dependency:

   ```sh
   bun install --production
   ```

4. Start Pi, or run `/reload` in your existing session.
5. Run `/ompss list`.

OMPSS ships no agents. A new installation answers `No personas mapped.`
Your mapping lives in `~/.pi/agent/om-pi-subagents.yaml`, outside the package.
Set `OMPSS_REGISTRY` to use another file.

You do not need `.pi-host/` to use the extension. Pi supplies those packages at runtime.

## Next step: add an agent

1. Follow [Set up agents](SETUP.md) to create the mapping file and a persona.
2. Run `/reload`.
3. Run `/ompss list` to check the agent name and allowed tools.
4. Run `/ompss` to see current-session status.

Each agent must declare a supported `thinking` value. Add it to older mappings before launching.
The `model` field stays optional. The parent panel shows active tools and retains a short final preview.
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
OMPSS has only the `latest` tag. It points at the newest stable release.
Run `npm view om-pi-subagents dist-tags` to see the current tags.

A plain `pi install npm:om-pi-subagents` already uses `latest`.
To return a pinned install to the newest version:

1. Run `pi install npm:om-pi-subagents@latest`.
2. Start Pi, or run `/reload`.

A tag is not pinned. `pi update npm:om-pi-subagents` follows the tag to each new release.

### Roll back to an older version

1. Run `npm view om-pi-subagents versions` to list published versions.
2. Run `pi install npm:om-pi-subagents@0.1.0`, using the version you want.
3. Start Pi, or run `/reload`.
4. Run `/ompss list`.

Pi replaces the old settings entry, so the rolled-back version stays pinned.
Version 0.1.0 accepts the `thinking` field, so a 0.2.0 mapping still loads.
Use `npm:om-pi-subagents@latest` to leave the rollback.

### Upgrade notes

Read [CHANGELOG.md](../CHANGELOG.md) before each upgrade.

**0.1.0 to 0.2.0 is a breaking change.** Every agent in the mapping must now set `thinking`.
Without it, OMPSS rejects the whole registry, and no run starts.
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
4. Run `/ompss list` and check that each agent appears.

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

### `/ompss` is missing

1. Run `pi list` and check that `om-pi-subagents` is there. For a local copy, check that `index.ts` is inside `~/.pi/agent/extensions/ompss/`.
2. Run `/reload`.
3. Read any extension-loading error before retrying.

### Host-package warnings appear

1. Check that Pi host packages remain peer dependencies in `package.json`.
2. Restore `peer = false` in `bunfig.toml` if it was changed.
3. Install again from the lockfile in a fresh checkout.

### The registry is empty or invalid

1. Check the exact field named in the error.
2. Edit `~/.pi/agent/om-pi-subagents.yaml` using the supported fields in [Set up agents](SETUP.md).
   For a missing `thinking` field, add `off`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`.
3. Run `/ompss list` again.

A missing mapping file means no agents. An empty file is rejected with `version: required`. Invalid settings block new launches until corrected.
