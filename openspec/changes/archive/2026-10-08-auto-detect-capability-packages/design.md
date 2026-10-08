# Design

## Context

`showCapabilities` in `src/settings.ts` asks for a package path through `ctx.ui.input`. `selectPublishedPackage` in `src/capabilities.ts` then calls `published()`. That function walks up from the path to a `package.json`, checks the package name, checks one `pi.extensions` entry inside the package, and finds the optional shipped skill.

Pi records installed packages in `<agentDir>/settings.json` under `packages`. An entry is a string such as `npm:om-memory-system`, or an object with a `source` field and resource filters. On this machine npm packages sit in `<agentDir>/npm/node_modules/<name>`. Pinned Pi 0.99.1 confirms this managed install layout in `dist/core/package-manager.js`. Pi also supports legacy global installs; detection leaves those to manual fallback.

`resolveAgentDir()` in `src/registry-path.ts` already returns the agent directory and honours `PI_CODING_AGENT_DIR`.

## Goals / Non-Goals

**Goals:**

- Remove the typed path in the common case where Pi already lists the package.
- Reuse `published()` so detection and manual entry share one validation.
- Keep the manual path as a fallback.

**Non-Goals:**

- No package installation, update or removal.
- No scan of the whole `node_modules` folder or of project-level `.pi/settings.json`.
- No import or execution of a sibling extension.
- No change to the YAML format, launch checks or `capabilityEdit`.
- No support for `git:` or URL sources. Only `npm:` entries and local path entries are read.

## Decisions

### 1. Detect from Pi's package list, not from a directory scan

Read `<agentDir>/settings.json`, take `packages`, and keep entries whose source is `npm:<name>` where `<name>` equals the capability package name. Remove optional version, range or tag suffixes without damaging scoped package names. Resolve each to `<agentDir>/npm/node_modules/<name>`. Accept string entries and object entries with a string `source`.

Resolve relative local paths against `agentDir`, as Pi does. Pass absolute local paths directly to `published()`. Skip `~`, `file://`, git and URL sources; manual fallback remains available.

Detect validated listed packages regardless of `autoload` or resource filters. The operator explicitly enables the capability for a child; parent resource selections do not constrain this confirmed mapping.

Alternative: scan `node_modules` for the two names. This finds packages that Pi does not load, which would enable a capability the operator never installed through Pi. Rejected.

### 2. Validate with `published()`, expose a new `detectPublishedPackages`

Add `detectPublishedPackages(agentDir, capability): Promise<PublishedPackage[]>` in `src/capabilities.ts`. It returns validated packages with duplicate roots removed (compared after `realpath`). `selectPublishedPackage` stays as the manual path validator.

### 3. Selection rules in the settings flow

- One result: use it, then go to the existing change summary and confirmation.
- Several results: `ctx.ui.select` over the package roots.
- No result: show guidance naming the package and the install command, then offer the typed path prompt. A cancelled prompt leaves YAML unchanged.

The shipped-skill choice stays as it is. If the user picks "Enable with shipped skill" and the detected package has no skill, the existing error applies.

### 4. Read failures are quiet and safe

A missing, unreadable or invalid `settings.json` returns an empty list and falls through to the manual prompt. A bad entry is skipped. Catch validation failures per candidate so a failing filesystem check does not discard later valid packages. Detection never throws into the settings dialog. It never writes to Pi's settings.

### 5. Read-only metadata, no execution

Detection calls only `readFile`, `realpath` and `stat`, as `published()` does today. A test confirms that a detected package whose entry file throws on import still detects cleanly.

## Risks / Trade-offs

- Pi may move its install folder in a later release. Detection then returns nothing and the manual prompt still works.
- A project-scoped install is not found. The operator uses the manual path.
- Pi's `packages` entries could gain new forms. Unknown forms are skipped.
- Pi has no documented install layout, so the `npm/node_modules` path is an assumption. The first task confirms it against the pinned host before code is written.
