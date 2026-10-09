# ADR-018: Supply delegation guidance through tool metadata

- **Date:** 2026-10-09
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

OMPS registers a model-callable tool with a short description and prompt snippet. Its optional operational skill explains how to delegate, but the model must choose to read it. Users have to remind the parent to use mapped subagents for substantial work with separable investigation or review.

Pi provides `promptGuidelines` on registered tools. Its default prompt includes these for active tools. The pinned Pi 0.99.1 host and installed Pi 1.1.0 expose this field. The project requires registration to read no file and start no process. Fresh registry checks and configured limits belong to existing operations.

An instruction can encourage a model to delegate. It cannot prove that the model will comply on every request. Tests must separate instruction delivery from scripted tool selection.

## Decision

Attach concise static delegation rules to the existing `omps` tool through `promptGuidelines`. Keep the rules in `src/index.ts`, beside the tool registration, without another prompt hook or configuration source.

The rules direct the model to discover mapped agents for substantial separable tasks and delegate suitable bounded investigation or review proactively. They retain simple-task exclusions and explicit user control. Tool approvals, safe folders, admission refusals and result assessment remain part of the policy.

Keep the detailed operational skill and align its routing description and task-selection section. Explain default-prompt scope and model-choice limits in README and the usage guide.

Test the registered metadata and the first request through a real Pi process with an isolated local model endpoint. Disable skills and omit personal context files. Removing the guidelines in a disposable copy must make those checks fail. Record permission-approved real-model observations separately.

OMPS will preserve host choices to deactivate tools, hide their declarations or replace the default prompt. This decision adds no startup launch, scheduler, roster injection, permission or operator-file edit.

## Consequences

### Positive

- Delegation guidance is available before the first model response under Pi's default prompt.
- Registration stays passive and requires no registry or persona content.
- Existing approved children share tool metadata through their managed registration, without loading ambient resources.
- Prompt tests can prove the rules reached the model independently of its tool choices.

### Negative

- A model can still ignore the rules or choose an unsuitable task split.
- Replacement prompts and host-hidden tool declarations can omit the guidance.
- Increased useful delegation can increase provider usage; existing limits remain important.

### Neutral

- Operator YAML, personas, run evidence and sibling configuration remain unchanged.
- Existing sessions need a normal reload or restart to pick up changed metadata.
- The operator's separately approved global `AGENTS.md` rule remains outside the package and is not edited by updates.

## Alternatives Considered

| Option                                        | Rejected Because                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Keep guidance only in the operational skill   | The model can skip the skill and miss when to delegate.                                              |
| Add a `before_agent_start` prompt hook        | It duplicates host prompt handling and adds lifecycle, activation and replacement-prompt complexity. |
| Inject the mapped-agent roster at startup     | It adds file access and catalogue freshness concerns without being needed for the short policy.      |
| Start an agent automatically for each task    | It changes execution authority and cost, including for simple tasks or explicit user restrictions.   |
| Require a user-edited global instruction file | It makes package behaviour depend on a machine-local workaround.                                     |

## References

- [OpenSpec proposal](../../openspec/changes/archive/2026-10-09-add-proactive-delegation-guidance/proposal.md)
- [Design](../../openspec/changes/archive/2026-10-09-add-proactive-delegation-guidance/design.md)
- [Delegation guidance spec delta](../../openspec/changes/archive/2026-10-09-add-proactive-delegation-guidance/specs/delegation-guidance/spec.md)
- [Tool registration](../../src/index.ts)
- [Operational skill](../../skills/om-pi-subagents/SKILL.md)
- [Pi extension documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [ADR-005: Configure per-session concurrency and nesting](005-configure-per-session-concurrency-and-nesting.md)
- [ADR-017: Launch agents directly from an at-mention](017-launch-agents-directly-from-an-at-mention.md)
