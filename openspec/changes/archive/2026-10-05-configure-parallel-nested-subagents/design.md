# Design

## Context

See [proposal.md](proposal.md) for the requested scope.

The current code has useful boundaries that this change must preserve:

- `config.ts` accepts only `version` and `agents`. It returns immutable persona snapshots and refreshes before each launch.
- `RunManager.start` reserves one owner slot synchronously. Its table already supports multiple entries and cancellation of all runs owned by a session.
- `runner.ts` disables ambient resources and adds approved extensions after the guard. `index.ts` refuses to register OMPSS in a marked child.
- `ResultJudge` waits for `agent_settled`. `supervisor.ts` then saves output, closes input and confirms process cleanup.
- `RunPanel` currently stores one run. A second start replaces its display; later events from the first are ignored.
- `om-pi-todo` stores tasks by session id and uses widget key `rpiv-todos`. OMPSS uses `ompss`, so the keys already differ.
- Todo mode comes from session entries or global preferences. A fresh RPC child can inherit an OpenSpec default without a binding.
- Todo reminders use `agent_before_settle` entries for a continuation. They do not send an extra user prompt.
- `package.json` currently declares only `pi.extensions`. Release tests require that exact manifest and allow no published skill files; both need focused updates to ship the requested skill.

Pi 0.99.1, pinned in `.pi-host/`, keeps a run active through pre-settlement handlers, but supplies no `ctx.signal` there. A held `turn_end` still receives the active abort signal. Disposable probes confirmed that RPC abort breaks a held `turn_end`, while waiting at `agent_before_settle` blocks abort completion. Its custom-message path queues follow-ups without invoking the `input` guard. User-message injection remains subject to that guard.

The existing `live-run-panel` spec promises a single current run. Its delta must explicitly change that display contract. The single-child statements in `AGENTS.md` and `openspec/config.yaml` describe today's code; implementation must update them with this change.

## Goals / Non-Goals

**Goals:**

- Enforce capacity before spawning, even when several tool calls arrive together.
- Give each parent a local run table and preserve immediate-parent ownership at every depth.
- Retain immutable launch evidence while reading fresh YAML for later launches.
- Keep nested results usable before the delegated parent reaches its final settlement.
- Test the real optional todo extension through normal and nested Pi processes.

**Non-Goals:**

- Queues, scheduled jobs, remote workers, automatic worktrees or provider fallback.
- A machine-wide or root-tree-wide process budget.
- Automatic copying of parent todos or OpenSpec bindings into children.
- Automatic completion of a parent todo when a subagent succeeds.
- Changing the existing startup or total run deadlines.
- An operating-system sandbox or protection from trusted executable extensions.

## Decisions

### 1. Put both limits in the existing operator YAML

Keep schema version `1` and accept this optional section:

```yaml
version: 1
limits:
  maxConcurrentRuns: 4
  maxDepth: 3
agents: {}
```

| Field                      | Valid values                  | Default when omitted | Meaning                                      |
| -------------------------- | ----------------------------- | -------------------- | -------------------------------------------- |
| `limits.maxConcurrentRuns` | Safe integers of at least `1` | `1`                  | Active direct children of one parent session |
| `limits.maxDepth`          | Safe integers of at least `0` | `1`                  | Greatest permitted depth from root depth `0` |

A safe integer is a whole number JavaScript can represent exactly. Reject unknown limit keys, null, lists, strings, booleans, fractions and unsafe integers. Omit the whole section, or individual fields, to use their defaults. A missing registry remains an empty mapping with default limits.

There is no additional fixed cap such as four children or three generations. Validate numerical representation rather than impose another product limit.

Replace the map-only configuration result with one immutable object containing limits and the agent registry. Each refresh must return a coherent snapshot that the caller keeps through validation and admission. Concurrent refreshes must not mix limits from one read with a persona from another. A failed read continues to block launches.

Apply a fresh concurrency limit on every admission. Lowering it does not cancel existing runs; new runs wait for capacity or fail immediately with useful guidance. Increasing it makes additional direct slots available on the next launch.

Rejecting rather than queueing excess runs preserves the existing action contract. The error names the configured limit and active run ids, with instructions to wait, cancel a run, or edit YAML.

### 2. Use one local runtime per immediate parent

Keep the root extension entry point and its lazy registration contract. Add a small managed child entry point loaded explicitly by the launcher when the target mapping includes `ompss`. Reuse runtime construction, tool registration, persistence and notification logic.

Keep the root entry point's ambient-child suppression. Do not load ambient user extensions, recursively rediscover packages or make every child a delegator. Load the managed entry before the task, including at the maximum depth, so an approved `ompss` tool passes readiness and returns a clear depth error when asked to launch further.

A child receives the same canonical registry path as its parent. `OMPSS_REGISTRY` and `PI_CODING_AGENT_DIR` overrides remain effective at every level. Model inheritance uses the immediate parent's selected model; each mapped persona retains its own thinking setting and resource list.

A root's four direct children occupy four root slots. Grandchildren occupy their respective child sessions' slots. A nested request cannot consume or cancel a sibling session's entries. Existing status and cancel operations remain scoped to direct runs owned by the caller.

A root broker or shared socket would add cross-process admission and notification paths without a tree-wide-budget requirement. Local tables match the requested per-session limit and reuse the existing ownership code.

### 3. Carry validated lineage and a depth ceiling

Extend the parent-created child policy with the registry path, current depth, permitted depth ceiling, root session id and immediate parent run id. Save the run's own id and nesting metadata with its configuration and status evidence.

For a root request, the proposed child depth is `1`. Each nested launch increments its parent's depth exactly once. Validate metadata before readiness; a marked child with missing or malformed metadata must fail closed rather than assume root depth `0`.

The branch keeps the depth ceiling captured when its ancestor started. For a later nested launch, use the smaller of that inherited ceiling and the freshly read YAML `maxDepth`. A lowered limit stops new launches deeper than it. Raising the file's limit affects newly started branches; it does not expand an already running branch's captured permission.

Concurrency remains a fresh per-session setting, not an inherited fixed quota. Every launch records both its fresh settings and the effective depth ceiling.

The user cannot override depth through task text or tool parameters. Keep exact-name tool enforcement. `ompss` approves delegation to operator-mapped personas with their own permissions; it does not automatically restrict a target to the delegator's tools. Mark this capability in agent listings and explain that delegating to a write-capable target can change files.

Treat mapped extension code and shell tools as trusted executable capabilities, as today. Metadata enforcement is a rule inside Pi, not a sandbox against executable code changing its environment.

### 4. Keep descendants alive until their parent can use their results

Add a child-only `turn_end` handler for sessions that can delegate. Wait on a completed final-answer turn (`message.role: assistant`, `message.stopReason: stop`) for owned supervisors and their result-delivery attempts. Skip tool-use turns so the model can launch several runs across turns. Use the active `ctx.signal`; abort must break the wait and cancel descendants. Shutdown and deadlines must also stop owned runs. Retain `agent_before_settle` for subtree shutdown on aborted or error outcomes after host retries, without waiting there. Keep todo's pre-settlement reminders and final `agent_settled` result judgement unchanged.

Track pending terminal deliveries separately from run completion. A manager slot can be released after confirmed cleanup, while the final-answer turn still waits for its notification attempt. Avoid the race where the last run becomes terminal before its saved answer reaches the parent.

Use the existing custom follow-up message path for nested results. Pi queues these messages while the `turn_end` handler waits. After the wait, Pi drains the queue and lets the parent model use the results before `agent_settled`. Do not create an unconditional continuation or poll the model.

Cancelled descendants keep the existing no-follow-up rule. An ordinary failed descendant delivers labelled partial output and leaves its parent free to explain the failure. A delivery failure stays separate from the descendant's completed state.

On abort, error, deadline or session shutdown, close admission first and cancel all owned direct runs. Their shutdown handlers cancel their children recursively. The existing outer process-tree watcher remains a fallback for abrupt child exits and descendants in separate process groups. Check macOS and Linux behaviour with real process evidence.

Extend token-correlated child evidence to report unconfirmed descendant cleanup. Propagate that condition through ancestor run outcomes. A parent with unresolved cleanup cannot be reported completed or admit new runs; extra capacity must never bypass this safeguard. Existing siblings can finish, while cancellation remains available.

### 5. Keep progress separated by run id

Keep one OMPSS widget per owning session. Store active display data by owner and run id, then tool-call id within each run. Display up to four active run summaries, prioritising active work; show the count of additional active runs. This display bound does not limit admission. `/ompss status` lists all direct owned runs.

When active work remains, finishing one run removes only its active tools and must not clear the status line or another run's summary. Once all displayed work has ended, keep the most recently ended run's terminal state and bounded saved preview. New starts reset the retained idle summary.

Use the existing bounded text sanitisation and preview limit. Delayed reads update only their matching run record and cannot replace active work or a newer terminal summary. Results still use independent per-run notification records.

Retain the existing `ompss` widget and status keys. Never clear all host widgets. Children do not relay their todo widgets into the root panel.

### 6. Support om-pi-todo through explicit child resources

Keep todo optional and preserve exact tool approval. A child that needs tasks must list `todo` in `tools` and the real todo extension entry in `extensions`. OMPSS does not discover it from a personal install path or copy its implementation.

Before the mapped todo extension handles `session_start`, seed the child's own session with its existing normal-mode entry, `pi-todo-session` with `{ mode: "normal" }`. Use a narrow compatibility bootstrap loaded before mapped extensions. Load this bootstrap when `todo` is approved, including leaf children that cannot delegate.

This gives the disposable child a local list when the global todo preference is OpenSpec. It changes neither global preferences nor the parent's branch. Leave the parent as sole owner of its linked OpenSpec task updates. In each child, approved `todo` calls create and update that child's tasks; a successful run never ticks a parent's checkbox by itself.

Preserve the guard's refusal of non-RPC user prompts. Todo's pre-settlement custom entries and OMPSS's result custom messages use their existing host paths and need no broad input exception.

Test both extension load orders in the root, the child's ordered bootstrap, parent normal and sync modes, simultaneous child lists and a grandchild list. Test a todo nudge followed by task correction; observing `agent_end` alone must never close a child before its continuation finishes.

Use a pinned real `om-pi-todo` package as a development-only integration dependency. Resolve its declared extension entry for fixtures. Obtain installation approval during implementation; no package install occurs during proposal work. Tests set disposable `HOME`, `XDG_CONFIG_HOME` and Pi agent directories, so they cannot read or change personal todo preferences.

The sibling source inspected for this plan is commit `724639841803b9a5d586db975c0c58d6a9fdb96f`, with manifest version `0.2.0`. Pin a released artifact matching the tested contract and record the test version. An explicit fixture override can test the sibling checkout without embedding its machine path.

### 7. Record and document the changed boundaries

Create [ADR-005](../../../docs/adr/005-configure-per-session-concurrency-and-nesting.md) as Proposed during planning. Its decision records per-session limits, local runtimes, depth propagation and optional todo loading. On verified implementation, mark it Accepted and note that it supersedes ADR-004's single-current-run display choice. Preserve ADR-002's parent-only user-prompt boundary.

During implementation, update the public guides and runnable README examples. Cover the limit table, depth diagram, effective changes on the next launch, inherited depth ceilings, capacity errors, nested permissions, local todos, result timing and subtree cancellation. Include how to invoke the packaged skill and how to map it explicitly into an isolated child. Preserve README example markers and the user's existing installation-guide edits.

The `nested-subagents` delta explicitly requires the ADR, public docs and skill. Treat them as acceptance criteria, not optional follow-up work.

### 8. Ship one repository-owned operational skill

Create `skills/om-pi-subagents/SKILL.md` after the runtime behaviour is implemented. Use matching directory and frontmatter names, `om-pi-subagents`, with a specific description for OMPSS configuration and delegation requests. Write short British English instructions and keep the body below 500 lines.

Declare `pi.skills: ["./skills"]` alongside the existing extension entry. Include only the intended skill resources in the package's `files` list. Leave tests, evaluation outputs and local reports out of the release. A package install exposes `/skill:om-pi-subagents` through Pi's normal skill discovery; no copy into a personal skills folder is required.

The skill guides the agent to list current mappings before choosing a target, inspect current-session status, use existing run ids and wait for separate result messages. It explains configured capacity, depth zero and inherited ceilings, working-directory safety, labelled partial output and descendant cancellation. It distinguishes parent OpenSpec tasks from child-local todos and preserves cleanup blocking.

Use package-relative references to the shipped setup and usage guides rather than duplicate detailed configuration tables. The skill must not invent agent names, choose a fixed model, create personas, edit live YAML without permission or promise unsupported fleet and scheduling commands.

Skill instructions grant no tools. A child receives the skill only when its mapping lists that skill path in `skills`; keep `--no-skills` and explicit resource loading intact. Loading the skill without `ompss` approval must not enable delegation.

Verify the published manifest and file list, frontmatter, relative references and real Pi command discovery. Test explicit skill loading in a delegating child and continued exclusion from an unconfigured child. Add evaluation fixtures for parallel and nested work, an empty mapping, failed cleanup and todo ownership, plus unrelated requests that should not select the skill. Record any model-driven evaluation separately from deterministic packaging checks; ask before paid or live-model runs.

## Risks / Trade-offs

- Process counts grow with branching and depth. Explain that four children at depth three can reach `4 + 16 + 64 = 84` active descendants. Operators set both values; no hidden global budget is added.
- Concurrent writers can change the same files. Keep explicit working directories and recommend separate safe worktrees for write-capable tasks.
- A parent can settle before a delayed delivery finishes. Wait for delivery attempts as well as supervisors, and test that race with held promises.
- Pi 0.99.1 supplies no abort signal at `agent_before_settle`. Wait at final-answer `turn_end` with its active signal and test cancellation while the handler is pending.
- Process-tree sampling can miss abruptly reparented grandchildren. Test separate groups, early exits and sampled descendants; treat uncertain cleanup as a failed run.
- The todo entry format is a compatibility contract owned by another package. Test the real pinned extension, including a global OpenSpec default, and fail visibly if the contract changes.
- Several extensions can request a pre-settlement continuation. Test the real todo nudge with nested result delivery, rather than replacing either hook with a stub.
- Skill instructions can drift from supported behaviour. Keep relative guide references and verify skill examples with the same fixtures used for public docs.

## Migration Plan

1. Obtain approval for this proposal.
2. Create the feature worktree before implementation.
3. Implement and verify with disposable configuration and credentials.
4. Reload the updated extension. Existing YAML retains concurrency `1` and depth `1`.
5. Let the operator add the desired `limits` section and approve delegating or todo tools per persona.
6. Keep the operator's live YAML untouched unless they explicitly ask to edit it.

For rollback, stop all run trees before loading the earlier extension. Remove the new `limits` section from any mapping used with the old parser, because it rejects unknown fields. Retain run evidence and private todo histories; restarting does not resume old children.
