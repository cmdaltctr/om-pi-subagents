# Tasks

## 1. Approved worktree and test prerequisites

- [x] 1.1 Create the feature worktree after proposal approval, verify its repository and branch, and preserve the existing `docs/INSTALL.md` edits; verify the initial diff contains only the intended planning files and user edits.
- [x] 1.2 Obtain permission to add a pinned real `om-pi-todo` development dependency, resolve its declared extension entry for fixtures and isolate `HOME`, `XDG_CONFIG_HOME` and Pi settings; verify the real package loads without a sibling-checkout path or personal settings.

## 2. Configurable limits and admission

- [x] 2.1 Add failing configuration and registry-store tests for omitted and partial limits, values beyond the examples, depth zero, malformed fields, failed refresh and overlapping snapshots; confirm failures on current code with focused test commands.
- [x] 2.2 Return coherent immutable configuration snapshots containing limits and personas, with safe-integer validation and defaults of one; verify the configuration tests pass and saved snapshots stay unchanged after refresh.
- [x] 2.3 Add failing run and service tests for five simultaneous launches under capacity four, active-state counting, fresh capacity changes, separate owners, cleanup blocking and launch-versus-shutdown races; confirm the intended failures before implementation.
- [x] 2.4 Replace single-slot admission with synchronous per-owner capacity checks and closed-admission state, keeping actionable limit errors and ownership checks; verify `runs.test.ts` and `service.test.ts` pass for both default and configured limits.

## 3. Approved nesting and launch evidence

- [x] 3.1 Add failing launch, readiness and guard tests for depth counting, leaf delegation errors, invalid lineage, inherited ceilings, registry overrides, model inheritance and absent delegation approval; confirm current code cannot satisfy them.
- [x] 3.2 Extend validated child policy and readiness with nesting metadata, pass the canonical registry path and load a managed OMPSS child entry only for approved `ompss`; verify focused launcher, startup and permission tests pass while ambient extensions remain disabled.
- [x] 3.3 Reuse the lazy runtime in delegating children and record lineage plus effective limits in private configuration and status files; verify persistence tests and a real child-to-grandchild launch show correct ownership, depth, model and resource snapshots.
- [x] 3.4 Add delegation-capable agent listing guidance and preserve target-specific tools; verify a mapped delegator can select an approved write-capable target while unapproved direct tools still fail.

## 4. Nested lifetime, delivery and cleanup

- [x] 4.1 Add failing gated tests for early parent settlement, delayed saved-output reads, per-run notification attempts, failed and cancelled descendants, cancellation during final-answer turn waiting and parallel launches across tool-use turns; verify each test fails for its intended lifecycle gap.
- [x] 4.2 Track delivery attempts separately and implement abort-aware waiting at final-answer `turn_end` with queued custom follow-ups, skipping tool-use turns and retaining final error or abort teardown at `agent_before_settle`; verify nested results reach the immediate parent before final settlement without extra prompts or unconditional continuations.
- [x] 4.3 Add failing cleanup tests for a great-grandchild, separate process groups, early parent exit, startup cleanup failure and uncertainty after an ordinary error or cancellation; confirm the tests detect surviving or unconfirmed descendants.
- [x] 4.4 Close admission during teardown, cancel owned subtrees and propagate token-correlated descendant cleanup failures through every result path; verify a cancelled subtree leaves siblings running and uncertain cleanup blocks further ancestor launches.

## 5. Parallel progress display

- [x] 5.1 Add failing panel and notifier tests for simultaneous runs, duplicate tool-call ids across runs, out-of-order completion, display overflow and delayed previews; confirm current single-run display fails those checks.
- [x] 5.2 Track display state by owner and run id, retain a bounded active view and latest idle summary, and keep per-run delivery records; verify `panel.test.ts`, `notify.test.ts` and session-binding tests pass, including sanitisation and failing UI callbacks.

## 6. Real om-pi-todo compatibility

- [x] 6.1 Add failing real-package tests for explicit child todo loading, absent tool approval, unavailable todo registration and a global OpenSpec default; verify failures expose the intended loading or mode problems without touching real preferences.
- [x] 6.2 Add the ordered child normal-mode bootstrap for approved `todo`, including non-delegating leaf children; verify real todo calls work and parent sync bindings, linked checkboxes and global preferences remain unchanged.
- [x] 6.3 Test both parent extension load orders, widget coexistence, sibling and grandchild task-id isolation, real reminder continuations and nested result delivery; verify the pinned real package succeeds and a copied or stub todo implementation is not used as proof.

## 7. Documentation, decision record and packaged skill

- [x] 7.1 Update README tool guidance and runnable examples plus `docs/SETUP.md`, `docs/INSTALL.md`, `docs/USAGE.md` and `docs/UNINSTALL.md`; verify doc tests cover configurable limits, depth examples, branch ceilings, explicit todo mapping, subtree cancellation, skill invocation and the 84-descendant load warning.
- [x] 7.2 Update `AGENTS.md` and `openspec/config.yaml` to describe configured per-session limits and approved nesting; verify obsolete single-child and no-nesting instructions are removed only where this change replaces them.
- [x] 7.3 Complete ADR-005 against the verified implementation, mark it Accepted and record the scoped supersession of ADR-004; verify its decision, consequences, index and links while ADR-002's input boundary remains intact.
- [x] 7.4 Add failing skill and release tests for frontmatter, package contents, relative guide references, real Pi discovery and explicit child loading; confirm current code fails because the packaged skill and `pi.skills` declaration are absent.
- [x] 7.5 Write `skills/om-pi-subagents/SKILL.md` with concise instructions for mapped-agent discovery, YAML limits, nesting, results, cancellation, cleanup and todo ownership; verify frontmatter and guide references pass and no assumed personas, models or personal paths are introduced.
- [x] 7.6 Declare the skill through `pi.skills` and the package file list, then update only the relevant release assertions; verify the package includes the intended skill, excludes evaluation fixtures and exposes `/skill:om-pi-subagents` in real Pi, including explicitly configured children without granting unapproved tools.
- [x] 7.7 Add skill evaluation fixtures for parallel and nested work, empty mappings, failed cleanup and todo ownership, with positive and unrelated trigger examples; verify supported examples through disposable fixtures and record any separately approved model evaluation with its evidence or remaining gaps.

## 8. Verification and archive

- [x] 8.1 Run focused real-Pi scenarios for capacity four, configurable depth above three, default compatibility, nested todo settlement and shutdown on macOS and Linux; verify saved output, exit status and process cleanup, and report missing platforms as gaps.
- [x] 8.2 Break admission, depth checks, task isolation, settlement waiting, cleanup propagation and skill packaging in disposable copies; verify the corresponding tests fail and keep all deliberate breaks outside committed files.
- [x] 8.3 Obtain approval for the full suite, run `bun run ci` and scan changed first-party code with Aikido when available; verify results and keep local scanner evidence in ignored `docs/local-docs/`.
- [x] 8.4 Run `openspec validate configure-parallel-nested-subagents --strict` and the `openspec-verify-change` workflow; verify every requirement and task against implementation and test evidence before marking the change complete.
- [x] 8.5 Archive with `openspec-archive-change`, update planning links in ADR-005 and commit the code, docs and archive together; run `bun run ci:clean` with installation approval and verify the fresh-clone gate before any permitted push.
