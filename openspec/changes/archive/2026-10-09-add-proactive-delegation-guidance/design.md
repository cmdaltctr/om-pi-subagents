# Design

## Context

See [proposal.md](proposal.md) for the motivation and [the spec delta](specs/delegation-guidance/spec.md) for the contract.

`src/index.ts` registers `omps` with a description and `promptSnippet`. Its session-start handler sets up autocomplete, shortcuts and interface state. It supplies no parent delegation policy. The operational skill describes discovery and launch safety after the model chooses to load it.

Pi's tool metadata includes `promptGuidelines`; its default prompt incorporates these for active tools. The pinned Pi 0.99.1 declarations and installed Pi 1.1.0 declarations expose this field. Replacement prompts can omit the guidelines. Hidden-declaration handling differs: Pi 0.99.1 retains guidelines while hiding declarations; Pi 1.1.0 can omit both. Tests and documentation must distinguish inactive tools from host-hidden declarations.

Existing specs require side-effect-free registration, exact child approval, fresh launch validation and separate result delivery. The change must preserve all of these. `test/index.test.ts` already captures registered tools and spies on process creation. Real-Pi fixtures use disposable settings and a local model endpoint that records request bodies.

## Goals / Non-Goals

**Goals:**

- Attach a small, portable policy to the existing tool and make it available before the model's first response.
- Keep instruction presence independently testable from any model's decision to call a tool.
- Cover useful delegation and the cases where local work or refusal handling is appropriate.

**Non-Goals:**

- No launch at startup, mandatory agent count, scheduler or prompt-triggered retry loop.
- No dynamic persona catalogue, reading the registry during registration or embedding persona content in a prompt.
- No new settings, dependencies, permission system, child-resource loading or result-settlement mechanism.
- No override of replacement prompts, inactive tools or another tool's host-controlled prompt handling.
- No automatic editing of operator `AGENTS.md`; the approved local workaround is separate from package behaviour.

## Decisions

### Use static tool prompt guidelines

Add a short `promptGuidelines` array directly to the existing `omps` registration in `src/index.ts`. Keep the policy around 200 words and the tool's action schema unchanged. Adjust its description and one-line snippet only where necessary to explain proactive delegation.

The guidelines will cover:

- For substantial tasks with separable work, call `omps list` and proactively delegate a suitable bounded investigation or review. Give a clear task and expected result.
- Keep simple requests local and honour explicit requests to avoid subagents.
- Select only freshly listed mappings with suitable approved tools. Check current-session `status` before more launches. Report missing, invalid or unsuitable mappings without inventing agents or changing settings.
- Verify the working folder, avoid shared-file conflicts between parallel writers and respect admission limits, inherited depth ceilings and cleanup refusals. Follow recovery guidance without repeated launch attempts or unauthorised limit changes.
- Wait for the separate result before relying on findings, assess its evidence and retain partial or failed labels. The parent owns its final answer and task updates. Continue independent work while waiting.

The host supplies these rules when it includes the active tool's guidance. OMPS adds no prompt hook, startup message or per-session policy cache. An approved delegating child receives the same metadata through its existing managed tool registration; a child without exact `omps` approval gains nothing.

**Alternatives:** A skill-only policy retains the current discovery gap. A `before_agent_start` hook duplicates the host's prompt mechanism and needs additional handling for inactive tools, prompt replacement and reload. Injecting a roster adds file reads and stale-catalogue concerns. A scheduler would change execution authority and cost.

### Keep task selection separate from operational detail

Add a short task-selection section to `skills/om-pi-subagents/SKILL.md` and revise its routing description to mention proactive delegation for substantial separable work. Preserve its existing discovery, permissions, limits, result, cleanup and sibling-capability guidance.

README and `docs/USAGE.md` will explain when guidance is present, how the model selects work, user control, and prompt limitations. Explicit `/omps` and at-mention launches remain unchanged. No installation or removal procedure needs a change.

### Test prompt transport rather than simulated judgement

Extend `test/index.test.ts` to capture the registered guidelines and assert each policy obligation. Keep the existing action-schema, lazy-service and no-process tests. Check that registering the new policy causes no registry, persona or run-file access and adds no new lifecycle hook.

Add a focused `test/delegation-guidance.e2e.test.ts` using `startPi` with the real extension loaded and the fixture's existing `--no-skills` isolation. Use `mcp: false` and disposable agent/home directories, without global `AGENTS.md` or live operator YAML. The fake model returns plain text and starts no subagent.

Inspect the first captured request's system/developer prompt text, rather than searching the entire JSON body. Assert the expected delegation and safety rules there before any tool result exists, that the request declares `omps`, and that only one model request occurred. Check that the user message contains only the ordinary prompt and no tool execution occurred. `test/memory.e2e.test.ts` provides an existing pattern for separating system and user message content.

Send a second ordinary prompt and check continued presence without duplicated policy text. Use a disposable test extension to deactivate `omps` and verify the host omits its guidance; also cover a replacement system prompt without forcing the rules back in. Extend the existing first-request checks in `test/child-launch.test.ts` for approved and unapproved delegation mappings. An unapproved child must receive neither the tool nor these guidelines; an approved delegator uses the managed registration and the same default-prompt policy.

The new worktree initially has no `.pi-host/`. Use an explicit `OMPS_PI_BIN` pointing to a verified pinned host for reproducible tests and record its version. Ask before any dependency or host installation. The fixture's fallback to a CLI on PATH checks executability, so it alone does not establish the tested host version.

The request parser must handle the selected host's message-content format. Tests must not pass merely because a tool declaration, user message or fake-model script contains the expected words. Remove the guidelines in a disposable source copy and confirm both registration and first-request checks fail for the intended reason.

Keep scripted discovery/run/result tests labelled as transport tests. A fake model programmed to delegate proves no change in real-model judgement. With operator permission, compare substantial and simple ordinary requests on the same selected real model before and after the change. Record what it does, including missed delegation, without turning variable model behaviour into a deterministic CI claim.

### Record the architecture boundary

Create ADR-018 with Proposed status and an index entry during planning. It records why prompt metadata owns the short policy and why OMPS keeps startup and execution separate. Accept it only after implementation verification.

## Risks / Trade-offs

- **The model ignores guidance:** keep rules short and explicit; record permission-approved real-model observations separately from prompt tests.
- **Guidance encourages unnecessary delegation:** include simple-task exclusions, explicit user control and no launch quota.
- **Another host component hides tool guidance or replaces the prompt:** respect that component and document the scope. The global `AGENTS.md` rule remains an operator-controlled workaround.
- **Tests pass because scripted calls contain the policy words:** inspect prompt-message content and prove failure after removing the implementation in a disposable copy.
- **More delegation increases provider usage or conflicting writes:** preserve existing limits and include working-folder and parallel-write checks in the policy.
- **CLI tests are skipped because Pi is missing:** keep registration tests enabled and report the missing verification. Run the real-Pi checks on macOS and Linux before claiming prompt transport is verified there.

## Migration Plan

1. Ship the policy with the normal package update after approval and verification.
2. Tell existing sessions to use `/reload`, or start a new session, to load changed tool metadata.
3. Keep operator YAML, mapped personas, run evidence and sibling settings unchanged.
4. Roll back by loading the previous package version or removing the new metadata in a normal revert.

The separately added global rule remains operator-owned. Package updates and rollback must not change it.
