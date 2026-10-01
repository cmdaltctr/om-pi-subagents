# How to install

This guide loads a local copy of OMPSS into Pi. See [usage](USAGE.md) after installation.

## Before you start

You need Pi and Bun. This project is tested with Pi 0.99.1.
Development checks use Bun 1.4.2 and Node.js 22.12 or newer.

Pi supplies its host packages. OMPSS installs `yaml` as its runtime dependency.
Keep `bunfig.toml` beside `package.json` so Bun leaves host peers out of `node_modules`.

## Install a local copy

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

## Add an agent

1. Follow the persona and YAML examples in [usage](USAGE.md).
2. Run `/reload`.
3. Run `/ompss list` to check the agent name and allowed tools.

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

1. Check that `index.ts` is inside `~/.pi/agent/extensions/ompss/`.
2. Run `/reload`.
3. Read any extension-loading error before retrying.

### Host-package warnings appear

1. Check that Pi host packages remain peer dependencies in `package.json`.
2. Restore `peer = false` in `bunfig.toml` if it was changed.
3. Install again from the lockfile in a fresh checkout.

### The registry is empty or invalid

1. Check the exact field named in the error.
2. Edit `~/.pi/agent/om-pi-subagents.yaml` using the supported fields in [usage](USAGE.md).
3. Run `/ompss list` again.

A missing or empty mapping file means no agents. Invalid settings block new launches until corrected.
