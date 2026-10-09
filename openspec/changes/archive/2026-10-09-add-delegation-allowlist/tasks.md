# Tasks

## 1. Configuration

- [x] 1.1 Write failing tests in `test/config.test.ts` and `test/config.invalid.test.ts`: valid `delegates` is frozen on the snapshot; an agent without `omps` needs no `delegates`; `omps` without `delegates`, non-list, invalid name, empty list, unmapped entry and `delegates` without `omps` each fail at `agents.<name>.delegates` with the documented message. Confirm they fail for the intended reason.
- [x] 1.2 Add `delegates` to `AGENT_FIELDS` and `AgentSnapshot` in `src/config.ts`. Require it when `omps` is approved. Validate shape per agent and cross-agent references after all snapshots are built. Make 1.1 pass.
- [x] 1.3 Add `delegates` to every test fixture, README example and shipped example that approves `omps`. Run the affected test files and confirm they pass.

## 2. Lineage

- [x] 2.1 Write failing tests for `parseLineage` in `src/protocol.ts`: `agent` is required and must be a valid name; `delegates` is present only when the agent approves `omps`, and must then be a list of valid names. Add a `test/startup.gate.test.ts` case where malformed `agent` fails readiness before the task reaches the model.
- [x] 2.2 Add `agent` and optional `delegates` to `Nesting`, set them in `service.run`, and validate them in `parseLineage`. Make 2.1 pass and confirm saved run evidence records both.

## 3. Launch enforcement

- [x] 3.1 Write failing tests in `test/service.test.ts`: allowed target starts; disallowed target throws before `manager.start` with agent, target and allowed list; fresh narrowing refuses; fresh widening does not widen a captured list; unmapped delegating agent refuses all launches; root launches ignore every list.
- [x] 3.2 Implement the captured-plus-fresh check in `service.run` before the depth check. Make 3.1 pass.
- [x] 3.3 Add a real-Pi nested test, reusing existing fixtures, where a child with `delegates: [<writer>]` is refused a second target and allowed the listed one. Skip it when Pi is missing.

## 4. Listings

- [x] 4.1 Write failing tests for root full and compact listing text and for a restricted child's filtered `omps list`.
- [x] 4.2 Update `describeAgent` and `listForms` in `src/service.ts`. Make 4.1 pass.

## 5. Delegation guidance

- [x] 5.1 Write failing tests in `test/index.test.ts`, `test/defaults.test.ts` and `test/delegation-guidance.e2e.test.ts`: the guidance says to proactively delegate bounded investigation, no longer says "investigation or review", and says to delegate review, audit or security work only when the user asks. Confirm they fail for the intended reason.
- [x] 5.2 Update the `promptGuidelines` text in `src/index.ts`, the skill description and body in `skills/om-pi-subagents/SKILL.md`, `README.md` and `docs/USAGE.md`. Make 5.1 pass.

## 6. Mutation checks

- [x] 6.1 In a disposable copy outside the checkout, remove the launch check, the required-list check, the cross-agent validation, the child list filter and the review-only-on-request guidance one at a time. Confirm the matching tests fail. Record evidence in ignored `docs/local-docs/`.

## 7. Documentation

- [x] 7.1 Write `docs/adr/019-limit-delegation-targets-per-agent.md` with Proposed status and add its index row in `docs/adr/ADR_README.md`. Record that it narrows ADR-018's review wording.
- [x] 7.2 Update `README.md`, `docs/USAGE.md` and `docs/SETUP.md`: the `delegates` field, that it is required with `omps`, an upgrade note for existing mappings, validation errors, captured-plus-fresh behaviour and a YAML example. Keep README example markers intact.
- [x] 7.3 Update `skills/om-pi-subagents/SKILL.md` to explain allowed targets and refusals.
- [x] 7.4 Run `test/docs.test.ts` and `test/docs.e2e.test.ts` and fix any drift.

## 8. Verification

- [x] 8.1 Run `bun run ci`. Fix every failure.
- [x] 8.2 Run `openspec validate add-delegation-allowlist --strict`.
- [x] 8.3 After verification passes, set ADR-019 to Accepted.
- [x] 8.4 Use a squash-merge title with `!` (for example `feat!: require delegation target lists`) and a `BREAKING CHANGE:` footer so Release Please bumps the version correctly.
