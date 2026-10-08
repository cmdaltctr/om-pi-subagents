# Proposal

## Why

Enabling Memory or Todo in `/omps-settings` asks the operator to type the path of an installed package. Pi already lists both packages in its own settings, so the operator is asked for something OMPS can find. The typed path is easy to get wrong and hard to discover.

## What Changes

- When the operator enables Memory or Todo, OMPS looks for the matching package in Pi's package list before it asks for anything.
- OMPS reads the `packages` list in the Pi agent settings file, resolves each `npm:` entry to its installed folder, and checks the folder with the existing package validation.
- One valid match is used without a prompt. The confirmation dialog still shows the exact resources and destination before anything is saved.
- No match shows installation guidance and offers the manual path prompt as a fallback. OMPS installs nothing.
- Several valid matches ask the operator to choose one. OMPS never guesses.
- Detection reads package metadata only. It never imports, executes or loads the sibling extension.
- The manual path prompt stays for packages that Pi does not list, such as a local checkout.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `omps-command-interface`: the requirement "Confirm coherent capability edits" changes. Enabling now finds installed resources automatically and falls back to a typed path.

## Impact

- `src/capabilities.ts`: a new detection function that lists candidate packages from Pi settings and reuses `published()` for validation.
- `src/settings.ts`: `showCapabilities` calls detection before the path prompt.
- `src/registry-path.ts`: reused for the agent directory. No change expected.
- `test/settings.test.ts`, `test/capability-settings.e2e.test.ts`: new cases for one match, no match, several matches and a bad settings file.
- `docs/USAGE.md` and `README.md`: describe the new behaviour and the fallback.
- No new dependency. No change to YAML format, launch behaviour or child readiness checks.
