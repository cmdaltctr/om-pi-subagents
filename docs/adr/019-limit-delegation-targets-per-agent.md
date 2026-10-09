# ADR-019: Limit delegation targets per agent

- **Date:** 2026-10-09
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

Approving the exact `omps` tool lets a child launch every mapped agent. An operator cannot let a builder hand documentation to a writer without also letting it start reviews or security scans. Persona text is the only limit, and the model can ignore it.

OMPS already enforces tool names and depth at launch. Depth follows a captured-plus-fresh rule: a running branch keeps the ceiling it started with, and fresh YAML can only lower it.

ADR-018 added delegation guidance that told the model to delegate "investigation or review" on its own. That wording led sessions to start reviews that nobody asked for.

## Decision

1. **Add `delegates` to an agent mapping.** It lists the agents that agent may launch through `omps`. It is required whenever `tools` includes `omps`.
2. **Validate with the registry.** The list must be non-empty, every entry must be a mapped agent, and `delegates` without `omps` is an error. A bad registry blocks launches, as other registry errors do.
3. **Enforce at launch.** `service.run` refuses a nested launch before it starts a process, unless the target is in both the list captured when the child started and the list in freshly read YAML. The root session has no limit.
4. **Carry the agent name in lineage.** A child cannot otherwise find its own mapping. The saved launch record also stores the agent and its captured list.
5. **Show targets in listings.** The root listing names each agent's targets. Inside a restricted child, `omps list` shows only what it may start.
6. **Narrow ADR-018's wording.** The built-in guidance delegates bounded investigation proactively. It delegates review, audit or security work only when the user asks.

The required list was chosen over a default of "any mapped agent". A default-allow rule left a silent gap: forgetting the field let an agent launch every mapped agent, including reviewers.

## Consequences

### Positive

- An operator can name exactly which agents a delegator may start. The model cannot override it.
- A running branch can be narrowed by editing YAML, but never widened.
- The guidance no longer prompts for review work nobody asked for.

### Negative

- Breaking change. A mapping that approves `omps` without `delegates` fails validation until the operator adds the list. The release needs a `BREAKING CHANGE:` footer.
- Removing a mapped agent that another agent lists fails the whole registry. The error names the field to fix.
- The list limits `omps` launches only. A write-capable child can still run shell commands. OMPS remains a tool guard, not an operating-system sandbox.
- Guidance is advice to the model. It does not stop a model from launching a reviewer that the root session may launch.

## Alternatives considered

- **Default to any mapped agent when `delegates` is absent.** Rejected for the silent gap above.
- **A top-level `delegation:` map.** Rejected because it splits one agent's settings across the file.
- **Tool selectors such as `omps:writer`.** Rejected because they break the exact-tool-name rule.
- **Wildcards or deny-lists.** Not needed for the stated requirement.
