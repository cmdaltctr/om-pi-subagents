# Architecture Decision Records

This directory records significant architectural decisions made during development.

## Index

| [001](./001-keep-the-agent-mapping-outside-the-package.md)                      | Keep the agent mapping outside the package and ship no agents   | 2026-10-01 | Accepted (partly superseded by 010) |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------- | ----------------------------------- |
| [002](./002-refuse-child-prompts-that-do-not-come-from-the-parent.md)           | Refuse child prompts that do not come from the parent           | 2026-10-01 | Accepted                            |
| [003](./003-release-through-release-please-and-staged-trusted-publishing.md)    | Release through Release Please and staged trusted publishing    | 2026-10-01 | Proposed                            |
| [004](./004-show-child-progress-in-a-parent-owned-widget.md)                    | Show child progress in a parent-owned widget                    | 2026-10-01 | Accepted (partly superseded by 005) |
| [005](./005-configure-per-session-concurrency-and-nesting.md)                   | Configure per-session concurrency and nesting                   | 2026-10-04 | Accepted                            |
| [006](./006-add-read-only-native-agent-trees.md)                                | Add read-only native agent trees and operator settings          | 2026-10-05 | Accepted                            |
| [007](./007-use-a-compact-fleet-with-independent-sibling-capabilities.md)       | Use a compact fleet with independent sibling capabilities       | 2026-10-06 | Accepted (partly superseded by 009) |
| [008](./008-use-the-omps-runtime-namespace.md)                                  | Use the OMPS runtime namespace                                  | 2026-10-07 | Accepted (partly superseded by 010) |
| [009](./009-port-the-tintin-agent-tree-and-show-it-by-default.md)               | Port the tintin agent tree and show it by default               | 2026-10-07 | Accepted                            |
| [010](./010-keep-operator-files-in-the-omps-folder.md)                          | Keep operator files in the OMPS folder                          | 2026-10-07 | Accepted                            |
| [011](./011-adopt-guarded-app-merges-for-release-pull-requests.md)              | Adopt guarded App merges for release pull requests              | 2026-10-07 | Accepted                            |
| [012](./012-separate-management-navigation-and-use-single-column-inspection.md) | Separate management navigation and use single-column inspection | 2026-10-07 | Accepted                            |

## Convention

Each ADR follows this template:

- **Context**: the problem, constraints and forces in play
- **Decision**: what was chosen and why
- **Consequences**: positive, negative and neutral outcomes
- **Alternatives Considered**: options rejected
- **References**: links to relevant files or documentation

ADRs are immutable once the status is "Accepted". A superseded decision gets a "Superseded by ADR-00X" note.

For platform findings and workarounds, see the [technical decision records](../tdr/TDR_README.md).

## Creating a new ADR

1. Copy an existing ADR.
2. Number it in sequence with three digits.
3. Set the status to "Proposed".
4. Add a row to the index table.
