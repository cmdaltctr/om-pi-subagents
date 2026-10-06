# Design

## Context

See [proposal.md](proposal.md) for motivation and scope.

OMPSS 0.3.0 launches native Pi children over RPC. `src/runs.ts` owns direct-run state; `src/observation*.ts` retains validated descendant evidence. `src/notify.ts` also owns a separate panel through `src/panel.ts`. `src/tree-card.ts` renders one tree per launch, and `src/inspector.ts` reads selected saved tasks and output. Display settings currently live outside registry YAML.

The reference uses in-process SDK sessions. Its fleet and activity widget deliberately exclude nested children. Its viewer reads a live session object, which OMPSS cannot borrow across a process boundary.

The inspected siblings are `om-pi-todo` 0.2.0 and `om-memory-system` 4.8.0. Todo replays `pi-todo-session` entries and owns its tasks, reminders, OpenSpec binding and widget. OMMS exposes `memory`, recalls through `before_agent_start`, captures at `agent_settled`, and scopes operations from `ctx.cwd`. Its store already supports separate processes using the same project.

## Goals / Non-Goals

**Goals:**

- Keep persistent OMPSS content to one row until the operator asks for detail.
- Derive presentation from authoritative run state and validated observation evidence.
- Give descendants the same inspection path as direct agents, without granting ancestor control.
- Keep sibling compatibility at mapped tool, skill and lifecycle boundaries.
- Make configuration ownership clear and test every changed boundary against real Pi behaviour.

**Non-Goals:**

- Replace child processes with SDK sessions or change how a run becomes completed.
- Mirror complete child conversations, expose hidden thinking or relay arbitrary tool results.
- Share todo reducers, memory clients, preference caches or databases between extensions.
- Add queueing, scheduling, workflow scripts, steering, automatic task completion or a memory-save button.
- Reorganise the test tree, install sibling extensions automatically or change operator mappings during this proposal.

## Decisions

### 1. Use one session fleet and one descendant modal

Remove the continuously expanded above-editor OMPSS panel. The only persistent widget is a below-editor fleet strip.

With five active direct children, its collapsed content is one row:

```text
Agents: 5 active | 3 observed descendants | Alt+O list | Alt+I inspect
```

Counts distinguish direct active runs from observed descendants. Starting, running and stopping roots count as active. Incomplete descendant evidence has a visible marker; the count never claims to be a complete process census.

The expanded strip has a summary, at most `ui.maxVisibleAgents` root rows, and at most one navigation/overflow row. The default is five roots, so the maximum is seven content rows. A small terminal lowers the effective row budget to at most one third of its height. If that cannot fit a selectable row and navigation, keep the compact strip and offer inspection. Selection scrolls through every active root rather than dropping rows from the model.

```text
Agents: 5 active | Alt+O collapse | Alt+I inspect
  reader    Map the API       running   12s   reading
> builder   Update validation running   18s   editing | 3 descendants
  reviewer  Review changes    starting   1s
Arrows select | Enter inspect | Esc collapse
```

Root order is launch order with run id as a stable tie-breaker. Selection follows run identity when rows change. The strip lists active roots; after all work ends, it retains one compact summary of the latest terminal root. Completed nodes remain available in the modal throughout the retained session history.

Fleet navigation captures arrows only when the fleet is expanded, the prompt is empty and the host editor owns focus. Typing returns input to the editor. Keys belonging to another dialog or overlay pass through. Escape collapses the fleet without cancelling work.

The modal has a tree pane and a selected-detail pane at usable widths. A narrow terminal uses a tree screen and an Enter-opened detail screen. It shows roots and all retained descendants in parent-first order. Left/Right folds or unfolds branches; Up/Down selects a node; Enter opens details. Page keys scroll detail text, and Escape returns to the previous view or closes the modal. The editor draft and the fleet's previous expansion state survive closure.

Fullscreen supports row clicks. Regular mode always has the keyboard path and makes no mouse promise. A selected child finishing does not close the modal. Resize keeps the selection by run id.

**Alternative:** keep the old panel and add FleetView beside it. Rejected because it duplicates active state and consumes the space this change is meant to recover.

### 2. Keep launch acknowledgements small

Tool and slash-command launches continue to have a transcript acknowledgement. Render one bounded row for a launch, containing the agent, short identity and launch state. Native tool expansion can reveal acknowledgement text, but does not create another live descendant tree.

Retain a compact renderer for historical `ompss-tree` entries. Unknown or unavailable historical evidence stays labelled; it must not reconstruct an active run. Final result delivery remains separate and keeps its existing model-facing content and saved-output location.

**Alternative:** use Pi's global expansion state for the fleet. Rejected because Ctrl+O also expands unrelated tools and todo rows.

### 3. Use portable independent shortcuts

Proposed defaults are Alt+O for the fleet and Alt+I for the modal. `/ompss fleet` and `/ompss inspect` remain available when shortcuts are disabled or unavailable.

Registration itself reads no files. The UI settings loader runs asynchronously at interactive session start and registers the selected shortcuts before Pi binds its editor shortcuts. This ordering must be proved by the real-host acceptance test on the pinned host and current Pi. Shortcut changes require `/reload`; settings displays the saved and active bindings until reload. Display-bound changes repaint immediately.

Use Pi's public shortcut registration and keybinding interfaces. Refuse a key occupied by an effective built-in action, with guidance to select another key. Ctrl+O becomes eligible only if the operator independently remaps Pi's `app.tools.expand`; OMPSS never edits Pi's keybinding file. Refuse Ctrl+I because the inspected current parser matches the same Tab byte as both Tab and Ctrl+I. Reject duplicate fleet/inspect keys. `off` disables either shortcut.

The default keys do not overlap todo's inspected default, Ctrl+Shift+T. Surface Pi's normal diagnostics for a custom collision with another extension. Document that operators must assign distinct custom keys; do not inspect sibling preference files to guess their bindings.

Use the public focused-component accessor when handling fleet arrows. Do not copy the reference's read of Pi's private `focusedComponent` field. Key release events must not perform an action twice.

**Alternative:** intercept Ctrl+O and Ctrl+I through a global input listener. Rejected because it bypasses Pi's conflict rules and can consume Tab or another extension's input.

### 4. Make YAML the settings authority

Add an optional `ui` mapping to version-one registry YAML:

```yaml
version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
ui:
  maxVisibleAgents: 5
  toggleKey: alt+o
  inspectKey: alt+i
agents: {}
```

This is a schema example, not an operator file to be installed. Existing mappings and explicit per-agent thinking remain required where applicable.

`ui.maxVisibleAgents` accepts safe integers from one to 256. Its new default is five. Shortcut values are valid Pi key specifications or `off`, subject to conflict checks. Unknown UI fields and invalid values identify their YAML path. Existing YAML without `ui` stays valid. The fleet always starts collapsed; runtime expansion is session-local, not another persisted setting.

`/ompss-settings` uses native select/input/confirm dialogs for depth, concurrency, visible rows and the two shortcuts. It also has an Agent capabilities menu for the per-agent Memory and Todo switches described in decision 6. `/subagents-settings` delegates to the same handler. The menu shows the resolved registry path, effective values, value sources and any reload requirement.

Reuse private temporary files, per-destination locking, revision comparison and atomic replacement. Preserve comments, agent mappings and unrelated valid fields. Missing YAML requires confirmation before creating `version: 1` with `agents: {}`. Cancellation writes nothing for that edit.

For existing users, consult the legacy OMPSS display JSON only when YAML omits `ui.maxVisibleAgents`. Preserve its valid value and label the source in settings. Never write that JSON again. Offer a confirmed import that writes the effective value to YAML; it neither deletes nor rewrites the legacy file. YAML then wins. Malformed legacy data produces a diagnostic and uses the default; it cannot affect execution limits. This fallback applies only to the old visible-row field, not shortcuts or launch settings.

Fresh launches still validate the complete registry and never reuse invalid execution configuration. Existing admitted runs continue after settings changes. A bad registry blocks new launches while the retained UI remains usable for inspection and recovery.

**Alternative:** persist limits in YAML and new UI fields in another JSON. Rejected because the operator explicitly wants YAML and the slash command to manage the same settings.

### 5. Extend the existing observation path with limited display text

Add optional task summary and assistant-preview fields to the OMPSS-owned observation record. A task summary is a sanitised single-line label capped at 160 characters. A live preview is the most recent visible assistant text, capped at 4 KiB of UTF-8; it is not a complete transcript.

Read assistant text only from typed assistant text events for the submitted task. Do not keep raw RPC objects, user/system history, tool arguments/results, hidden thinking, stderr or authentication structures in presentation state. Each hop validates identity, sequence and byte bounds before retention. Keep the existing 16 KiB observation-record and 256-node safety bounds.

Coalesce preview publication to at most five updates per second per run. Lifecycle and tool events keep their current authoritative handling. A preview never proves completion or schedules a model request. Closing a modal does not stop observation. UI repaint timers stop when the relevant view or session ends.

The selected details include submitted task, known model, state, elapsed time, active tool names, provisional preview, and saved output when available. Retain the existing validated lazy reads and 64 KiB per-file limit. Failed/cancelled saved output remains partial. A stale preview stays explicitly provisional after a run ends; the saved result is the source for its final answer.

**Alternative:** relay a full session or read `events.jsonl`. Rejected because it broadens sensitive content, retention and cross-process coupling.

### 6. Keep memory and todo as independent capabilities

New agent mappings have neither sibling capability by default. OMPSS remains usable with both extensions absent. Existing explicit `tools`/`extensions`/`skills` mappings remain authoritative; this change does not silently disable them.

An operator can enable either capability later through `/ompss-settings`:

```text
Agent capabilities > researcher
  Memory (OMMS): Off
  Todo:          Off
```

These are settings helpers over the existing per-agent lists, not new YAML permission flags or an integration database. `Off` means the recognised sibling extension resources, its tool approval and shipped skill are absent. `On (configured)` means the sibling entry and exact tool are mapped; it does not assert backend health. A tool-only, extension-only or ambiguous mapping is labelled `Partial` with correction guidance, never falsely shown as disabled.

Enablement selects an existing mapped agent. The operator confirms an installed package folder or entry path; published package metadata supplies recognisable extension and optional skill paths. Ambiguous resources require an explicit choice. Validate canonical paths and the complete proposed registry without running an extension factory, starting a process, making a model request or probing memory storage. A missing dependency leaves YAML unchanged and gives installation guidance.

Before confirmation, show the selected agent, destination and exact list changes. An enabled capability adds the exact `memory` or `todo` name and the selected real extension resource; its shipped skill can be included explicitly. Avoid duplicate equivalent entries. Save the related list changes in one atomic, revision-checked YAML replacement. Preserve the persona, model, thinking, other tools/resources and other agents. There is no all-agents switch or inherited child capability.

Disabling removes that agent's exact tool approval and recognised sibling extension/skill paths together. Removing only `memory` from tools would leave OMMS recall/capture hooks active, so it is insufficient for an Off state. Custom wrappers or resources with unclear ownership require operator clarification rather than guessed deletion. Repeated enable or disable requests make no duplicate or unrelated changes.

The helpers never install/uninstall packages, change sibling preferences, modify parent tools or rewrite Pi settings. New launches read the edited mapping afresh without an OMPSS reload. Admitted children keep their captured resources and tool permissions until they end. The selected descendant target always follows its own mapping.

When the parent already uses these extensions and the selected child has the relevant capability enabled, use this flow:

```text
Parent searches memory and owns the plan
        |
        v
Parent delegates a bounded task with relevant verified context
        |
        v
Child uses its own todos and optional approved memory tools
        |
        v
Parent verifies the result, updates its task, and records useful knowledge
```

OMPSS supplies this guidance in its shipped skill and guides. It does not execute memory calls or change todos from a display event, result notification or settings action.

**Todo:** keep the existing mapped real extension, exact `todo` approval and child-local normal-mode seed. The parent retains normal or OpenSpec mode. Do not introduce task counters by parsing todo result objects or reading its store. Isolate the existing `pi-todo-session` seed in `src/todo-bootstrap.ts` and cover it with real-extension compatibility tests. This is the one existing replay-contract seam, not a licence to depend on todo internals.

**Memory:** load the installed OMMS Pi entry only when the operator maps it, directly or through the confirmed settings helper. Require exact `memory` approval for model calls. Map its shipped `omms-memory` skill explicitly when wanted. The enable dialog must explain that approval covers the whole tool, including its write and portability modes. Do not add a separate memory configuration block, force child memory on, import an OMMS client, or fabricate memory records from results.

OMMS retains its own recall and capture lifecycle. A child launched in the same project uses that project's store; a different cwd uses OMMS's own existing scoping. Worktree-to-project aliases stay OMMS's responsibility. Tool registration is not proof that the backend is connected, so the UI makes no such claim.

Managed children set OMMS's existing `OMMS_DISABLE_WEB_AUTOSTART=1` and `OMMS_DISABLE_AUTO_BACKFILL=1` process flags. They keep ordinary recall, manual tool use and configured settled capture. This avoids every explicitly memory-enabled child becoming a history importer or login-item controller. Parent flags/configuration remain untouched. The flag contract belongs in the compatibility tests; no OMMS source changes are required.

OMMS may capture an enabled child's settled work before OMPSS has confirmed its exit and cleanup. Such capture is ordinary session evidence, not a verified project decision. OMPSS introduces no additional auto-save path. A memory backend error stays a memory error; registration failures still obey the existing readiness gate.

Use no runtime dependency on either sibling. Compatibility tests exercise published entry points with disposable configuration, fake providers and synthetic stores. Report missing optional fixtures as a test gap rather than an implied pass. Run load-order and sibling-absence checks. Record tested package/host versions.

**Alternatives:** share todo's reducer or OMMS's database/client, or add a common orchestration bus. Rejected because normal sibling updates would then change OMPSS's internal assumptions.

### 7. Separate presentation from result delivery

Build a pure fleet projection over `RunManager` snapshots and the retained observation tree. Keep session-local expansion, selection and scroll offsets in the presentation controller. It owns the fleet widget and modal lifetime. `src/notify.ts` keeps terminal result delivery and delivery records; it stops owning a second widget-state map.

Suggested responsibility split:

| Surface                      | Responsibility                                                    |
| ---------------------------- | ----------------------------------------------------------------- |
| Fleet projection             | Pure row ordering, counts, selection identity and display budgets |
| Fleet widget/controller      | Pi widget lifetime, focus and view toggling                       |
| Existing viewer/inspector    | Selected descendant details, modal layout and bounded reads       |
| Observation relay/validation | Limited task and assistant display text with lineage checks       |
| Configuration/settings       | YAML UI settings, confirmed per-agent list edits and migration    |
| Todo bootstrap               | Existing narrow child-normal-mode seed                            |
| Notifier                     | Saved-result delivery, never task or memory mutation              |

Each surface has one owner. Remove obsolete panel and live-tree paths only after replacement tests prove the same supervision and delivery boundaries. Keep files below about 500 lines and do not extract generic sibling adapters without a second concrete use.

### 8. Deliver public guidance and the installed skill with the implementation

Update `README.md`, `docs/SETUP.md`, `docs/INSTALL.md`, `docs/USAGE.md` and `docs/UNINSTALL.md` alongside their affected task groups. Keep documented fields, commands, defaults, migration and removal behaviour aligned with the implemented extension. Use the existing docs tests and real fake-model examples instead of inventing another documentation runner.

Keep ADR-007 and `docs/adr/ADR_README.md` current as the implementation lands. Record the resulting fleet/modal, YAML and sibling decisions. Preserve accepted earlier ADR text; accept ADR-007 only after verification findings are resolved.

Update the repository-owned `skills/om-pi-subagents/SKILL.md`, including its routing frontmatter and instructions. The installed package must deliver these revised instructions through the existing `files` and `pi.skills` declarations, with `/skill:om-pi-subagents` discovery. Relative guide links must resolve inside the packed installation. No separate manual skill copy or automatic child skill permission is added.

Extend the existing skill evaluation fixtures with test-backed fleet and capability scenarios. Verify packaging and real command expansion from a disposable packed-package installation with synthetic settings and the fake model. Retain explicit child skill loading and exact-tool approval tests; model-driven evaluation accuracy remains unclaimed until those trials run.

## Risks / Trade-offs

- **Shortcut ambiguity:** legacy terminals merge Ctrl+I and Tab. Use independent defaults, reject unsafe keys and retain command access.
- **Sibling custom-key collision:** Pi resolves extension conflicts. Surface its diagnostic and document distinct bindings rather than depending on sibling settings.
- **Live preview privacy:** visible answers can contain sensitive text. Keep previews bounded, sanitised and provisional; exclude raw tool/system content.
- **Large trees:** observation already retains at most 256 nodes. Distinguish retained hidden rows from missing evidence and never imply a complete census.
- **Memory cost:** child OMMS can load embeddings or make capture calls. Make mapping opt-in and recommend parent-only memory for leaf work that needs no independent recall.
- **Optional package drift:** test published resource metadata, the small bootstrap and OMMS flag/lifecycle seams against real packages. Normal runtime remains independent of those packages when absent.
- **Incomplete capability mappings:** an extension can run hooks without exposing its tool. Show a Partial state and remove both tool/resource entries only after clear operator confirmation.
- **Preference downgrade:** an older OMPSS rejects a new `ui` section. Preserve an operator-approved pre-edit backup outside the live destination before any downgrade.

## Migration Plan

1. Implement in this change's sibling worktree after approval; keep the main checkout read-only.
2. Add tests for the one-row default and replacement modal before removing the old presentation paths.
3. Keep version-one YAML valid without `ui`; read the old visible-row preference only as a labelled fallback.
4. Make confirmed settings saves target YAML and offer explicit legacy-value import. Preserve existing explicit sibling mappings; unmapped capabilities remain off until a per-agent edit is confirmed.
5. Update the public guides, ADR-007/index and bundled `skills/om-pi-subagents/SKILL.md` together. Verify the revised skill from a disposable packed installation.
6. Validate normal mode, OpenSpec mode, sibling load order, RPC and both interactive terminal modes.
7. Verify the implementation and strict OpenSpec validation before archiving or publishing.

No real operator settings or stores are changed during planning or tests. Rollback requires the previous package and a compatible operator YAML without `ui`; restore the approved backup instead of editing live settings automatically.

## Verification Evidence and Acceptance

The reference's `fleet-list`, `fleet-wiring`, `agent-widget` and `conversation-viewer` suites passed 147 tests on its pinned Pi 0.84.2. A synthetic component demonstration exercised seven roots, overflow, keyboard selection and a conversation overlay. It did not run a live provider or demonstrate this new UI in a real terminal.

The proposed implementation must prove:

- Five active roots consume one persistent OMPSS content row by default.
- Expansion respects its row/terminal-height budget and makes every active root reachable.
- A nested child and great-grandchild stay selectable through the live modal while unrelated agents continue.
- Enter/closing/resizing preserve selection, the editor draft and the correct owner.
- Ctrl+O and Tab keep their native behaviour; todo's default shortcut and widget survive in either load order.
- YAML and settings use the same fields, preserve edits and leave admitted runs untouched.
- Both siblings are optional and off in new mappings; settings can enable them later without another code change.
- Capability switches save coherent per-agent lists, report partial/missing resources and leave admitted children and parent extensions unchanged.
- Real approved children use local todo state and the expected memory project.
- UI failures, stale callbacks, previews and memory failures cannot manufacture a completed run.
- Public guides and ADR-007/index match the implementation, and a packed installation discovers the updated skill with working guide links and unchanged child permission boundaries.

Use the existing disposable Pi, fake-model, todo and interactive-viewer fixtures. Add failing tests for changed safeguards and prove them by deliberate breaks in a scratch copy. Run focused tests first. Full CI needs explicit permission because it runs the entire suite; clean-clone CI additionally needs a requested commit. Do not claim either gate passed while it remains unrun.
