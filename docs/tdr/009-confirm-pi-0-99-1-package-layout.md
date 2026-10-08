# TDR-009: Confirm the Pi 0.99.1 package layout

- **Date:** 2026-10-08
- **Status:** Proposed
- **Deciders:** Project maintainer
- **Tags:** pi | packages | detection

## Context

OMPS needs installed Memory and Todo paths without executing Pi's package manager.
The host under `.pi-host/` reports `@earendil-works/pi-coding-agent` version **0.99.1**.
Its compiled source confirms the layout below. The OMPS change still needs verification.

## Decision

Use these pinned-source findings for metadata-only detection:

| Finding                                                                | Pi 0.99.1 evidence                                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Personal settings use `<agentDir>/settings.json`                       | `FileSettingsStorage` in `dist/core/settings-manager.js`.                                                |
| Managed personal npm packages use `<agentDir>/npm/node_modules/<name>` | `getNpmInstallRoot()` and `getManagedNpmInstallPath()` in `dist/core/package-manager.js`.                |
| `packages` accepts strings and objects with a string `source`          | `PackageSource` in `dist/core/settings-manager.d.ts`; `getPackageSourceString()` in the package manager. |
| Relative personal local sources resolve against `agentDir`             | `getBaseDirForScope("user")` and `resolvePathFromBase()` in the package manager.                         |
| Pi can fall back to a legacy global npm installation                   | `getNpmInstallPath()` calls `getLegacyGlobalNpmInstallPath()` when the managed user path is absent.      |

For example, personal settings can list:

```json
{
	"packages": [
		"npm:om-memory-system@latest",
		{ "source": "npm:om-pi-todo", "autoload": false, "extensions": [] },
		"../local/om-memory-system"
	]
}
```

OMPS checks the managed npm folders and resolves that local path from `agentDir`.
It validates candidates despite parent `autoload` or resource filters because the child mapping needs its own confirmation.
OMPS leaves Pi's legacy global lookup to the manual path fallback; that lookup can run package-manager commands.
Project `.pi/settings.json`, `~` sources, `file://`, git sources and URLs also need manual installed paths.
This limited detection policy belongs to OMPS; Pi supports additional sources.

## Consequences

### Positive

- Detection uses a layout checked against the pinned host without invoking its package manager.

### Negative

- A host layout change can cause detection to offer the manual fallback.

### Neutral

- The findings describe Pi 0.99.1. Both records remain Proposed until the OMPS change passes verification.

## Alternatives Considered

| Option                                                   | Rejected because                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| Assume all personal npm packages use the global npm root | Pi prefers its managed agent-directory installation.               |
| Call Pi's full package resolver                          | It can install missing packages and run commands during discovery. |

## How to Recognise / Handle This Again

A manual prompt for a listed, installed package means detection found no valid candidate.

1. Check `PI_CODING_AGENT_DIR`; otherwise use `~/.pi/agent`.
2. Read that directory's `settings.json` and check the relevant `packages` source.
3. Check the managed package folder and its declared `pi.extensions` entry in `package.json`.
4. Use `pi list` to locate a project-only or legacy global installation.
5. Supply the absolute installed package folder or published extension entry in `/omps-settings`.
6. Review the exact resources and destination before confirming.
7. Recheck the named Pi source methods after a host upgrade.

## Revisit Triggers

Recheck when the pinned Pi version changes, managed npm storage moves or `PackageSource` gains a new form.

## References

- [Pinned host package version](../../.pi-host/node_modules/@earendil-works/pi-coding-agent/package.json)
- [Pi package manager](../../.pi-host/node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js)
- [Pi settings types](../../.pi-host/node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.d.ts)
- [Pi settings storage](../../.pi-host/node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js)
- [ADR-014: Detection policy](../adr/014-detect-capability-packages-from-the-pi-package-list.md)
- [Change design](../../openspec/changes/archive/2026-10-08-auto-detect-capability-packages/design.md)
