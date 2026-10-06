# Tasks

All implementation tasks are pending. Proposal approval is required before apply.
For every new safeguard test, confirm failure against a deliberate break in a disposable copy.

## 1. YAML settings and shortcuts

- [x] 1.1 Add failing configuration tests for optional `ui` fields, defaults, invalid keys/values, legacy precedence and invalid-registry launch blocking; verify the targeted configuration suites expose the missing behaviour before implementation.
- [x] 1.2 Implement cached YAML UI settings and the read-only legacy visible-row fallback; verify new tests plus `config`, `config.invalid` and `registry-store` suites pass without writes during registration or rendering.
- [x] 1.3 Implement `/ompss-settings`, its alias, confirmed YAML edits and explicit legacy import; verify settings, persistence and RPC tests cover comments, concurrent edits, cancelled dialogs, missing YAML and sibling-file protection.
- [x] 1.4 Register configured shortcuts at interactive session start without factory file access; verify real Pi tests on the pinned host and current Pi cover defaults, `off`, reload, duplicate keys, native conflicts, Tab and press/release handling.
- [x] 1.5 Update `README.md`, `docs/SETUP.md`, `docs/INSTALL.md`, `docs/USAGE.md` and `docs/UNINSTALL.md` for YAML/settings changes, migration and installation/removal behaviour; verify `test/docs.test.ts`, `test/docs.e2e.test.ts` and relevant settings examples match the implementation.
- [x] 1.6 Update `docs/adr/007-use-a-compact-fleet-with-independent-sibling-capabilities.md` and `docs/adr/ADR_README.md` as the design lands; verify they record fleet/modal choices, shortcut conflicts, YAML authority and sibling boundaries, remain Proposed until final verification, and leave accepted ADR text intact.

## 2. Bounded descendant display text

- [x] 2.1 Add failing observation tests for task labels, UTF-8 preview bounds, rate coalescing, terminal controls, older records, foreign identities and replay; verify each rejection or bound fails when its safeguard is deliberately removed.
- [x] 2.2 Extend OMPSS observation validation and relay with submitted-task summaries and provisional visible assistant previews; verify observation, transport, relay and supervisor tests preserve record/node bounds, authoritative state and result delivery.
- [x] 2.3 Exercise a root, child and great-grandchild with the fake-model RPC fixture; verify each selected preview belongs to its real run and survives out-of-order tool/lifecycle events without exposing raw results or thinking.
- [x] 2.4 Document preview limits, provisional status and privacy in the usage guide; verify documentation and fixtures agree on 160-character labels, 4 KiB previews and saved-output authority.

## 3. Compact fleet projection and widget

- [x] 3.1 Add failing pure projection tests for one-row collapse, launch-order roots, run-id selection, direct/descendant counts, incomplete evidence, overflow and terminal history; verify the tests fail against the existing multi-row presentation.
- [x] 3.2 Implement the fleet projection and below-editor widget with independent session-local expansion; verify five active roots use one persistent content row and default expansion stays within seven content rows and the terminal-height budget.
- [x] 3.3 Add editor-focus-aware navigation and scrolling through every active root; verify empty/non-empty drafts, unrelated dialogs, key release, Escape, resize and stale-session input using the real interactive host fixture.
- [x] 3.4 Add compact tool/slash launch acknowledgements and bounded historical-entry rendering; verify native Ctrl+O cannot create additional live trees and existing execution/entry-renderer tests preserve model-facing acknowledgements.
- [x] 3.5 Replace notifier-owned panel rendering only after the replacement tests pass; verify notify, result, persistence, sibling progress and cleanup suites retain delivery semantics and no duplicate persistent OMPSS widget remains.
- [x] 3.6 Update `README.md` and `docs/USAGE.md` examples for collapsed/expanded fleet behaviour; verify docs tests and disposable host renders match the stated space budgets, keeping local screenshot evidence free of personal data.

## 4. Unified descendant modal

- [x] 4.1 Add failing modal tests for parent-first trees, branch folding, all retained descendants, live updates, run-id selection and provisional previews; verify existing inspector behaviour fails the newly required cases.
- [x] 4.2 Adapt the existing viewer/inspector into one tree/detail modal with narrow-terminal fallback; verify keyboard access, fullscreen row clicks, output scrolling, terminal completion and resize on both supported host versions.
- [x] 4.3 Preserve selected-file validation, 64 KiB reads and stale-read cancellation; verify foreign ids, path escapes, missing/truncated files, partial output, session replacement and thrown render callbacks remain safe.
- [x] 4.4 Wire `/ompss fleet`, inspection shortcuts and fleet Enter to the same view controller; verify bare `/ompss` remains status, malformed forms perform no reads, RPC receives bounded text and headless modes create no terminal components.
- [x] 4.5 Update `docs/USAGE.md` inspection guidance for descendant selection, keyboard/fullscreen clicks, live previews and saved output; verify documented keys/commands match the real-host fixture and closing restores the draft without stopping agents.

## 5. Optional todo and memory coexistence

- [x] 5.1 Extend real todo parent/child/nesting/viewer tests for the new fleet and modal in normal and OpenSpec modes; verify sibling-local task ids, reminders, parent checkboxes, widget ownership and default shortcuts in either load order.
- [x] 5.2 Add an OMMS fixture using its published Pi entry, disposable configuration/store and fake local providers; verify manual search/add, scoped recall and configured capture without real credentials, production stores or provider requests.
- [x] 5.3 Add child-local OMMS maintenance opt-out flags and exact-memory permission tests; verify missing approval/tool readiness, parent environment isolation and disabled child web/history maintenance while normal memory operations remain available.
- [x] 5.4 Test concurrent same-project memory children, another-project cwd, parent load order, memory failures and sibling absence; verify true lifecycle outcomes remain independent and record exact tested package/host versions and any gaps.
- [x] 5.5 Keep first-party imports and package runtime dependencies independent of sibling internals; verify a boundary check fails when a sibling store/client import or task-result parser is deliberately added in a disposable copy.
- [x] 5.6 Add failing per-agent capability-settings tests for default Off, existing On mappings, Partial states, missing packages, cancelled edits, duplicate resources and conflicting saves; verify these fail against the current settings menu before implementation.
- [x] 5.7 Implement Memory/Todo settings helpers over the selected agent's tools/extensions/optional skills, using validated operator-selected published resources and one confirmed atomic save; verify exact edit previews, idempotence, comment preservation and no factory execution or package installation.
- [x] 5.8 Verify later enablement and complete disablement with real sibling fixtures; prove future launches follow the edit while active children, other agents, parent extensions and parent OpenSpec tasks stay unchanged, including removal of memory hooks and todo bootstrap on Off.
- [x] 5.9 Update `README.md`, `docs/SETUP.md` and `docs/USAGE.md` for default-off Memory/Todo controls, later enable/disable procedures, Partial-state recovery and verified-result handoff; verify examples use existing YAML lists, explain whole-tool memory permissions and require no new permission flags or sibling config.
- [x] 5.10 Update the repository-owned bundled skill at `skills/om-pi-subagents/SKILL.md`, including its routing description, fleet/modal commands, `/ompss-settings`, default-off per-agent controls and parent/child ownership; verify `test/skill.test.ts` checks portable frontmatter, shipped guide links and unchanged exact-tool boundaries.
- [x] 5.11 Verify the updated skill remains included by package `files` and `pi.skills`; use `test/release.test.ts`, `test/defaults.test.ts` and a disposable packed-package installation to prove `/skill:om-pi-subagents` is discovered and its revised content reaches the fake model, without manual skill copying or ambient child loading.
- [x] 5.12 Extend `test/fixtures/skill-evals/` and `test/skill-evals.test.ts` for compact fleet navigation, optional capability switches and ownership-safe handoff; verify scenario evidence references real passing tests and any unrun model-driven evaluations remain labelled unverified.

## 6. Integration acceptance and final verification

- [x] 6.1 Capture disposable fleet/modal examples with five roots and nested descendants in regular/fullscreen modes, narrow widths and both themes; verify space budgets, focus, live updates and sibling widgets without personal data.
- [ ] 6.2 Run relevant configuration, observation, UI, lifecycle, permission, todo and memory suites on macOS and Linux; verify no unconfirmed skips remain in required compatibility coverage and mutation evidence is recorded locally.
- [ ] 6.3 Obtain permission for the full suite, run `bun run ci` in the verified feature worktree and run `openspec validate redesign-compact-fleet --strict`; verify every required check passes and scan any implementation changes with available security tooling.
- [ ] 6.4 When the user requests a commit, run the clean-clone CI gate against committed HEAD; verify its result before a separately authorised push or PR.
- [ ] 6.5 Run the OpenSpec verify workflow against specs, design and tasks; verify public guides, ADR-007/index and the installed bundled skill all describe the implemented behaviour, then mark ADR-007 Accepted only after findings are resolved. Archive only after all implementation tasks and required verification are complete.
