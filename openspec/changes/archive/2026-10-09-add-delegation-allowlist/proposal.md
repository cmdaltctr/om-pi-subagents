# Proposal

## Why

Approving the exact `omps` tool lets a child launch every mapped agent.
Operators cannot let a builder hand documentation to a writer without also letting it start reviews or security scans.
Persona text is the only limit today, and the model can ignore it.
OMPS already enforces tool names and depth at launch, so the target list needs the same treatment.
The built-in delegation guidance from 0.9.0 also tells every Pi session to delegate "investigation or review" on its own, so the model starts reviews nobody asked for.

## Changes

- Add a `delegates` list to an agent mapping in `config.yaml`. It names the agents that this agent may launch through `omps`. **BREAKING:** an agent that approves `omps` must declare `delegates`.
- Validate the list with the rest of the registry: each entry must be a mapped agent, the list must not be empty, and the agent must also approve `omps`.
- Carry the launching agent's name and captured `delegates` list in the child's lineage.
- Refuse a nested launch before spawning when the target is outside the captured list or the fresh list. The refusal names the agent, the target and the allowed targets.
- Show allowed targets in `/omps list` and in the `omps list` text that the model reads. Inside a restricted child, list only the targets it may launch.
- Reject a registry where an agent approves `omps` without `delegates`. The error tells the operator to add the list.
- Change the built-in guidance to delegate bounded investigation, and to delegate review, audit or security work only when the user asks.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `nested-subagents`: delegation approval requires a per-agent target allowlist, enforced at launch against captured and fresh configuration, and recorded in lineage evidence and listings.
- `delegation-guidance`: proactive delegation covers investigation; review, audit and security work wait for a user request.

## Impact

- Code: `src/config.ts` (field and cross-agent validation), `src/protocol.ts` (lineage fields and parsing), `src/service.ts` (launch check and listing), `src/index.ts` (guidance text), `src/runner.ts` or `src/runs.ts` only where lineage is passed through.
- Tests: `test/config.test.ts`, `test/config.invalid.test.ts`, `test/service.test.ts`, `test/startup.gate.test.ts`, `test/index.test.ts`, `test/defaults.test.ts`, `test/delegation-guidance.e2e.test.ts`, a real-Pi nested launch test, and every fixture that approves `omps`.
- Docs: `README.md`, `docs/USAGE.md`, `docs/SETUP.md`, `skills/om-pi-subagents/SKILL.md`, a new ADR in `docs/adr/` and its index row.
- Compatibility: breaking. A mapping that approves `omps` without `delegates` fails validation until the operator adds the list. Mappings without `omps` are unaffected. Settings edits already rewrite single fields, so they keep a `delegates` entry. Release notes need a `BREAKING CHANGE:` footer.
- No new dependencies.
