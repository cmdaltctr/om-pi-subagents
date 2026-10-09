# Tasks

## 1. Add and verify built-in prompt guidance

- [x] 1.1 Extend `test/index.test.ts` to inspect registered prompt guidelines and cover proactive selection, simple-task exclusions, user restrictions, fresh discovery, approved tools, safe folders, admission refusals and result assessment. Verify the focused tests fail on the current registration because the guidelines are missing.
- [x] 1.2 Add `test/delegation-guidance.e2e.test.ts` with the existing isolated real-Pi and fake-model fixtures. Inspect first-request system/developer text with skills disabled and an ordinary user prompt; assert the request declares `omps`, contains no injected user guidance and produces no tool execution or extra model request. Use a verified pinned CLI through `OMPS_PI_BIN`, recording its version and asking before any installation. Verify the test fails on current code without depending on scripted delegation or matching words outside prompt messages.
- [x] 1.3 Add concise static `promptGuidelines` to `src/index.ts` and align the description and snippet without changing the action schema or lifecycle hooks. Verify tasks 1.1 and 1.2 pass using `bun run test test/index.test.ts test/delegation-guidance.e2e.test.ts` and that registration still reads no registry/persona/run files, creates no service and starts no process.
- [x] 1.4 Extend the focused real-Pi suite to cover a second request, inactive `omps`, replacement prompts and no automatic startup child/model request. Extend `test/child-launch.test.ts` to check guideline presence for approved delegators and absence for unapproved children. Verify each case with the local endpoint, distinguish version-specific hidden declarations from inactive tools, and preserve independent registration tests when Pi is unavailable.
- [x] 1.5 Remove the new guidelines in a disposable source copy and rerun the registration and first-request checks. Verify they fail for missing policy text, then rerun the unchanged feature checkout and record passing results. Keep deliberate breaks outside working files.
- [x] 1.6 Update README and `docs/USAGE.md` to explain proactive delegation, user control, simple-task handling, default-prompt scope, model-choice limits and `/reload` for existing sessions. Verify the text matches the new spec and the focused documentation tests pass without changing example markers.

## 2. Align the shipped operational skill

- [x] 2.1 Add a focused check for the shipped skill's proactive task-selection guidance and routing description in the existing packaging/defaults tests. Verify it fails before the skill edit and does not rely solely on a generic word such as `delegation`.
- [x] 2.2 Revise `skills/om-pi-subagents/SKILL.md` to match the built-in policy while preserving detailed operations and existing permissions. Verify the focused check passes, packaged references resolve, and no personal path, agent or model is introduced.
- [x] 2.3 Break the skill's new task-selection guidance in a disposable copy and verify the focused check fails. Rerun the unchanged checkout's `test/defaults.test.ts` and relevant documentation tests to confirm the final skill remains valid.

## 3. Verify integration and record limits

- [x] 3.1 Run the relevant parent, child-contract, permission, startup and nesting regression tests with the pinned host. Verify exact `omps` approval, unchanged action semantics, fresh limits, ownership, result delivery and cleanup still pass; record any skipped CLI cases explicitly.
- [x] 3.2 Ask permission for a real-model comparison using synthetic read-only work, the same selected model and substantial/simple ordinary requests. Record observed discovery, delegation and exclusions in ignored `docs/local-docs/`; if permission or a provider is unavailable, record `NOT RUN` and make no claim about real-model compliance.
- [x] 3.3 Run the repository CI gate after obtaining approval for its full suite, perform the available first-party security scan, and run `openspec validate add-proactive-delegation-guidance --strict`. Verify all required checks pass and review the final diff. Report macOS/Linux results separately; run `bun run ci:clean` after an authorised commit.
- [x] 3.4 Run the OpenSpec verification workflow against this change and resolve its findings. Verify all requirements and tasks have evidence, then mark ADR-018 Accepted and update its index entry. Keep the change active until the separate archive workflow is authorised.
