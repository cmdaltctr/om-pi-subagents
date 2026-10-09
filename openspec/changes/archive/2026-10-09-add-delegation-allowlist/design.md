# Design

## Context

`buildSnapshot` in `src/config.ts` accepts the agent fields `persona`, `tools`, `model`, `thinking`, `skills` and `extensions`. It rejects unknown fields, so `delegates` is a new allowed field.
`createService().run` in `src/service.ts` refreshes the registry, checks the target name and depth, and then calls `manager.start`. A child runtime receives its `ChildLineage` (`branch`) from `OMPS_POLICY` through `src/managed-child.ts` and `readChildPolicy` in `src/protocol.ts`.
Lineage holds the registry path, depth, maximum depth, root session and run ids. It does not hold the running agent's name, so a child cannot find its own mapping today.
Depth already follows a captured-plus-fresh rule: the smaller of the inherited and fresh ceilings applies.
Settings writes use `document.setIn` for single fields, so an unknown-to-settings field such as `delegates` survives edits.

## Goals / Non-Goals

**Goals:**

- Enforce a per-agent target list at launch time, in code.
- Make every delegator name its targets, so no agent can quietly launch any mapped agent.
- Stop the built-in guidance from prompting unrequested review or audit work.
- Use the same captured-plus-fresh rule as depth, so a running branch can be narrowed but never widened.
- Give the child model and the operator a clear refusal and a clear listing.

**Non-Goals:**

- No limit on root launches. The operator and the root model keep full access.
- No wildcard, pattern or deny-list syntax.
- No editing of `delegates` in `/omps-settings`. The operator edits YAML.
- No transitive limits. Each agent's own list governs its own launches.

## Decisions

### 1. Field shape: `delegates: [name, ...]` on the agent mapping

```yaml
a-build:
  persona: ./personas/a-build.md
  tools: [read, edit, write, bash, omps]
  thinking: high
  delegates: [a-writer]
```

This matches the existing list fields (`tools`, `skills`). The name says what it controls.
Alternatives: a top-level `delegation:` map (splits one agent's settings across the file), or tool selectors such as `omps:a-writer` (breaks the exact-tool-name rule).

### 2. `delegates` is required with `omps`

An agent that approves `omps` must declare `delegates`. A missing list fails validation at `agents.<name>.delegates` with: "add delegates: [...] listing the agents this agent may launch, or remove omps".
The maintainer chose this over default-allow. Default-allow kept a silent gap: forgetting the field let an agent launch every mapped agent, including reviewers.
This breaks mappings that approve `omps` without the list. The error names the field, and the release notes carry a `BREAKING CHANGE:` footer.

### 3. Strict validation, errors only

- Not a list, or an entry that is not a valid agent name: error.
- Empty list: error with guidance to remove `omps`. An empty list would approve a tool that can do nothing.
- Entry not mapped in the same file: error. Cross-agent checks run after all snapshots are built.
- `delegates` without `omps` in `tools`: error. The registry has no warning channel, and a silent no-op hides a mistake.
- An agent may list itself, which today's behaviour already allows.

Removing a mapped agent that another agent lists now fails the whole registry. This matches "a bad registry must never silently reuse old settings" and the error names the field to fix.

### 4. Lineage carries `agent` and optional `delegates`

`service.run` adds the target's name and frozen `delegates` list to the `Nesting` it builds. The list is absent only for agents that do not approve `omps`, which cannot delegate anyway. `parseLineage` validates both. A marked child with a missing or malformed `agent` fails readiness, as malformed depth does now.
`Nesting` (the saved launch record) keeps `agent` optional, because run records saved by earlier versions lack it and the inspector still reads them. `ChildLineage` (what a live child receives) requires it, and the supervisor always sets it from the launched agent snapshot.
Alternative: pass the name in a separate environment variable. Rejected because lineage is already the validated, saved launch contract.

### 5. Enforcement in `service.run`, before spawning

After the fresh refresh and target-name check, a child runtime computes the allowed set:

- captured list from `branch.delegates`;
- fresh list from `snapshot.agents.get(branch.agent)?.delegates`;
- if the fresh registry no longer maps `branch.agent`, refuse all launches.

The target must be in both sets. The refusal is a thrown `Error`, which the `omps` tool already returns to the child model. Example text:
`a-build cannot launch "a-review": agents.a-build.delegates allows a-writer.`
The check runs before depth so the operator sees the more specific reason.

### 6. Listings

- Root full form: `delegation-capable (targets: a-writer)`.
- Root compact form: `delegation-capable: a-writer`.
- Child form: filter to the allowed set, so the child model sees only what it may start.

### 7. Guidance wording

The 0.9.0 guidance in `src/index.ts` says "proactively delegate suitable bounded investigation or review". The new text keeps proactive investigation and adds: "Delegate review, audit or security work only when the user asks for it."
OMPS ships no agent names, so the rule names the kind of work, not an agent. The skill, README and usage guide repeat the same rule.

### 8. ADR number

ADR-018 (delegation guidance) is merged. This change uses ADR-019. ADR-019 records that it narrows part of ADR-018.

## Risks / Trade-offs

- Required lists break existing delegating mappings once. Mitigation: the error names the field and the fix, and docs show `delegates` in every delegation example.
- Guidance is advice to the model, not enforcement. A user request for review still reaches any reviewer the root can launch.
- Lineage grows by two fields. Old children launched before an upgrade lack `agent`; they already fail on version changes because parent and child run the same installed code.
- A typo in `delegates` blocks all launches until fixed. The error names the exact field, which the operator prefers to silent fallback.
- The allowlist limits only `omps` launches. A write-capable child can still run shell commands; OMPS remains a tool guard, not an operating-system sandbox.

## Open Questions

None.
