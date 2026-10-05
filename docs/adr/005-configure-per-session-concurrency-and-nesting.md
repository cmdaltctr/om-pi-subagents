# ADR-005: Configure per-session concurrency and nesting

- **Date:** 2026-10-04
- **Status:** Accepted (implemented and verified)
- **Deciders:** Project maintainer

## Context

OMPSS currently reserves one direct child slot per parent session. It disables its own extension in children.
The maintainer requires several direct children and nested delegation, with both limits in the operator's existing YAML.
The root counts as depth zero. A maximum depth of three includes great-grandchildren.

Each run already has its own supervisor, private files and owner. These boundaries can support several direct runs.
The display currently tracks one run, so it needs separate state for each active run.
A delegated parent must remain alive long enough to use its children's results.

The optional `om-pi-todo` extension separates tasks by session and uses a different widget key.
Its global OpenSpec preference can leave a fresh child without a change binding.
Its task reminders use Pi's pre-settlement continuation boundary, which OMPSS must preserve.

## Decision

Add optional `limits.maxConcurrentRuns` and `limits.maxDepth` to version-one `om-pi-subagents.yaml`.
Defaults remain one direct child and maximum depth one. Accept safe integers without another fixed feature ceiling.
Maximum depth zero disables launches.

Count active direct children for each immediate parent. Reserve capacity synchronously before spawning.
Each delegating child uses a local OMPSS runtime through an explicitly loaded managed entry point.
The child's mapping must approve the exact `ompss` tool. Keep ambient resources disabled.

Pass validated lineage and the branch's depth ceiling through the parent-created policy.
Every nested launch reads fresh YAML. Its effective depth ceiling is the smaller of the inherited and current limits.
Fresh concurrency applies per session; a larger YAML depth applies to newly started branches.
Persist lineage and effective limits with launch evidence.

A delegated parent waits asynchronously at pre-settlement for its direct runs and terminal delivery attempts.
Deliver results with Pi's existing custom follow-up path so the parent can use them before final settlement.
Cancellation and shutdown close admission and stop owned descendants, including separate process groups.
Unconfirmed descendant cleanup fails ancestor outcomes and blocks further launches.

Keep one parent widget with display state keyed by run id. Show bounded active summaries and overflow counts.
When the session becomes idle, retain the most recently ended run's safe preview.
This replaces ADR-004's single-current-run display choice after implementation; its safety rules remain in force.

Keep `om-pi-todo` optional and explicitly mapped. A narrow child bootstrap seeds only the child's normal-mode session entry.
The parent keeps its own tasks, OpenSpec binding and preferences. Subagent completion never completes a parent todo automatically.
Preserve ADR-002's refusal of non-RPC user prompts; todo reminders and OMPSS custom result messages need no broad exception.
Test against a real pinned todo package rather than a copied or mocked implementation.

## Consequences

### Positive

- Operators set capacity and depth in the same file as their personas.
- Local run tables preserve ownership without a new cross-process broker.
- Parent todo tracking remains usable while several subagents work.
- Existing mappings retain their current limits until the operator opts in.

### Negative

- Per-parent branching can multiply process and provider load. Four children through depth three can create 84 descendants.
- Settlement waiting adds cancellation and delayed-delivery races that need direct tests.
- The todo bootstrap depends on that package's persisted normal-mode entry contract.
- Concurrent write-capable personas can modify the same working files.

### Neutral

- OMPSS still supplies no operating-system sandbox or machine-wide resource limit.
- Todo remains an optional operator-selected extension and a development-only compatibility test dependency.
- Status and cancellation remain scoped to a caller's direct owned runs.
- Public behaviour guides change with implementation, after this proposal is approved.

## Alternatives Considered

| Option                                            | Rejected because                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A fixed larger child count                        | Leaves capacity hard-coded and gives the operator no depth setting.                            |
| A root-wide shared capacity broker                | Counts grandchildren against the root, which differs from the requested per-session behaviour. |
| Load every parent extension in children           | Grants ambient executable resources outside explicit persona mappings.                         |
| Finish the delegated parent immediately           | Can terminate descendants before their results reach the parent.                               |
| Copy parent todos or inherit its OpenSpec binding | Mixes task ownership and can let parallel children change the same linked checklist.           |
| Add todo as a runtime dependency                  | Makes an optional extension mandatory and duplicates responsibility for its loading.           |

## References

- [OpenSpec proposal](../../openspec/changes/archive/2026-10-05-configure-parallel-nested-subagents/proposal.md)
- [Technical design](../../openspec/changes/archive/2026-10-05-configure-parallel-nested-subagents/design.md)
- [Run admission](../../runs.ts)
- [Child launch plan](../../runner.ts)
- [Child guard](../../child-guard.ts)
- [Multi-run display](../../panel.ts)
- [Approved delegator runtime](../../managed-child.ts)
- [Child todo bootstrap](../../todo-bootstrap.ts)
- [ADR-002: Refuse child prompts that do not come from the parent](./002-refuse-child-prompts-that-do-not-come-from-the-parent.md)
- [ADR-004: Show child progress in a parent-owned widget](./004-show-child-progress-in-a-parent-owned-widget.md)
- [om-pi-todo](https://github.com/cmdaltctr/om-pi-todo), source inspected at commit `724639841803b9a5d586db975c0c58d6a9fdb96f`
- [Pi extension lifecycle](https://github.com/earendil-works/pi/blob/v0.99.1/packages/coding-agent/docs/extensions.md)
