# ADR-014: Detect capability packages from the Pi package list

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

Enabling Memory or Todo asks the operator for an installed package path.
Pi already records personal packages in `<agentDir>/settings.json`.
Here, `agentDir` means the Pi agent directory, normally `~/.pi/agent`.
`PI_CODING_AGENT_DIR` can select another directory.

Detection must preserve explicit child permissions and the existing confirmed YAML save.
Reading a package's metadata must leave its executable extension unloaded.
Pinned Pi 0.99.1 confirms the source forms and managed install paths recorded in [TDR-009](../tdr/009-confirm-pi-0-99-1-package-layout.md).
Verification confirmed all twelve specified scenarios. Full CI and committed-tree CI passed; the latter used two workers after parallel runs hit existing timing failures. Real Pi dialogs covered Memory and Todo using disposable settings. The real OMMS runtime smoke test was skipped because OMMS was unavailable.

## Decision

Read the personal `packages` list. This gives detection an operator-configured set of candidates.
Accept string entries and objects with a string `source`.
Resolve matching `npm:` names to `<agentDir>/npm/node_modules/<name>`, removing version, range or tag suffixes.
Resolve relative local paths against `agentDir`; validate absolute local paths directly.
Use the existing `published()` validator to check the package name and its declared extension.
Compare resolved package roots to remove duplicates, including symbolic links to the same folder.

Offer valid candidates regardless of parent `autoload` or resource filters.
Those settings choose what the parent loads. The operator separately confirms the child's exact resources.
One valid root skips the path prompt. Several distinct roots require an explicit choice.
If detection finds nothing usable, show installation guidance and offer the manual path prompt.
OMPS installs nothing. Cancelling selection or the fallback leaves the mapping unchanged.

Keep manual entry for unlisted checkouts, project-only packages and legacy global npm installs.
Detection skips sources beginning with `~`, `file://`, git sources and URLs.
For those sources, the operator supplies an absolute installed folder or published extension entry path.
Missing, unreadable or invalid settings use the same fallback. Skip a failing candidate and continue checking later entries.

Read metadata and inspect filesystem paths only. Detection never imports, executes or loads the sibling extension.
This avoids extension side effects during discovery. Future launches still load confirmed resources through the existing readiness checks.
Keep the change summary, whole-tool Memory warning and atomic save with conflict checks.
The YAML format, parent settings and admitted children stay unchanged.

## Consequences

### Positive

- A single valid listed package removes the need to find and type its path.
- Detection and manual selection share package validation without executing extension code.

### Negative

- Pi's managed install layout needs rechecking when the pinned host changes.
- Project-only, legacy global and unsupported sources require a manual installed path.

### Neutral

- Detection adds no dependency or package-management operation. Parent resource filters do not limit an explicitly approved child mapping.
- Implementation and tests are tracked in `src/capabilities.ts`, `src/settings.ts`, `test/settings.test.ts`, `test/capability-settings.e2e.test.ts` and `test/fixtures/pi-rpc.ts`. The fixture clears inherited child mode and isolates the registry so root commands register during real Pi tests.
- Planning paths are `openspec/changes/archive/2026-10-08-auto-detect-capability-packages/.openspec.yaml`, `openspec/changes/archive/2026-10-08-auto-detect-capability-packages/proposal.md`, `openspec/changes/archive/2026-10-08-auto-detect-capability-packages/design.md`, `openspec/changes/archive/2026-10-08-auto-detect-capability-packages/tasks.md` and `openspec/changes/archive/2026-10-08-auto-detect-capability-packages/specs/omps-command-interface/spec.md`.
- Record paths are `docs/adr/014-detect-capability-packages-from-the-pi-package-list.md`, `docs/tdr/009-confirm-pi-0-99-1-package-layout.md`, `docs/adr/ADR_README.md` and `docs/tdr/TDR_README.md`.
- Public instructions change in `docs/USAGE.md`, `README.md` and `skills/om-pi-subagents/SKILL.md`.

## Alternatives Considered

| Option                                             | Rejected because                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Scan the whole `node_modules` folder               | Offers packages absent from Pi's configured list and broadens discovery beyond the approved scope. |
| Always ask for a path                              | Keeps the error-prone manual step for packages Pi already lists.                                   |
| Use Pi's package manager for discovery             | Its resolution can install missing packages and invoke package-manager commands.                   |
| Import the sibling extension to find its resources | Runs trusted executable code before the operator confirms the mapping.                             |
| Apply parent loading filters to detection          | Prevents a separate child mapping from using an installed package the parent leaves disabled.      |

## References

- [Proposal](../../openspec/changes/archive/2026-10-08-auto-detect-capability-packages/proposal.md)
- [Design](../../openspec/changes/archive/2026-10-08-auto-detect-capability-packages/design.md)
- [Tasks](../../openspec/changes/archive/2026-10-08-auto-detect-capability-packages/tasks.md)
- [Spec delta](../../openspec/changes/archive/2026-10-08-auto-detect-capability-packages/specs/omps-command-interface/spec.md)
- [TDR-009: Pi 0.99.1 package layout](../tdr/009-confirm-pi-0-99-1-package-layout.md)
- [ADR-007: Independent sibling capabilities](007-use-a-compact-fleet-with-independent-sibling-capabilities.md)
- [Capability validation and detection](../../src/capabilities.ts)
- [Settings flow](../../src/settings.ts)
