# Proposal

## Why

OMPS exposes a launch tool and an optional operational skill, but gives the parent model no instruction to delegate suitable work proactively. Users must keep reminding the model to use subagents; short built-in guidance should be available from the first model request.

## What Changes

- Add concise delegation rules to the registered `omps` tool through Pi's `promptGuidelines` metadata. With `omps` active and Pi's default system prompt, the rules are available automatically without a skill invocation or user reminder.
- Direct the model to discover mapped agents before substantial work with separable investigation or review, choose a suitable permitted target, and delegate useful bounded work proactively.
- Keep simple tasks local. Honour explicit user instructions to avoid delegation, use only discovered mappings, respect capacity and depth limits, verify safe working folders, and assess returned results.
- Align the tool description, shipped skill routing description and operational guidance with this policy.
- Document the scope and limits in README and `docs/USAGE.md`, including the fact that prompt guidance does not guarantee any model's choices.
- Add registration and real-Pi prompt tests. Check what reaches the model before its first response, independently of scripted tool calls.
- Record the prompt-metadata approach in a Proposed architecture decision record.

This change adds guidance. It introduces no automatic process launch at session start, agent scheduler, forced delegation quota, YAML field or permission change.

## Capabilities

### New Capabilities

- `delegation-guidance`: Automatically supplied, task-aware instructions for proactive use of mapped subagents, with explicit safety boundaries and accurate public guidance.

### Modified Capabilities

None. Existing command, operational-skill, nesting, ownership and cleanup requirements remain unchanged. The new capability defines additional guidance while preserving those contracts.

## Impact

- `src/index.ts`: registered tool description and static prompt guidelines; runtime creation stays lazy.
- `skills/om-pi-subagents/SKILL.md`: task-selection guidance and routing description; detailed operations remain in the skill.
- `test/index.test.ts`: assertions for registered guidance and side-effect-free registration.
- A focused real-Pi test using `test/fixtures/pi-rpc.ts` and `test/fixtures/fake-model.ts`: inspect captured model requests with synthetic settings and no personal instructions.
- `README.md`, `docs/USAGE.md` and `docs/adr/`: describe automatic guidance, host prompt limitations and the chosen boundary.
- No new dependencies, host-version bump, changes to the tool schema, operator settings, persona mappings or sibling extensions.

The separately approved rule in the operator's global `AGENTS.md` is an immediate local workaround. It is outside the package and is not a dependency of this change.
