# ADR-016: Fold result messages and bind Ctrl+Shift+E

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer

## Context

A finished run delivers an `omps-result` message with up to 4000 characters of answer text.
Long answers fill the transcript. The operator requested Ctrl+Shift+E to expand results.
Pi already supplies `app.tools.expand`, Ctrl+O by default, and passes its expansion state to message renderers.
OMPS must preserve that action, saved output and model-facing messages.

## Decision

Register a renderer for `omps-result`. Fold long answers by default, keeping the heading, files line and `Result:` label.
Keep every `Error:` line and `PARTIAL OUTPUT` note visible. Show eight other result lines before the hidden-line hint.
Eight is an initial display choice; the operator supplied no line count. Count lines before terminal wrapping.
Short answers and unexpected message shapes stay whole, without a hint.

Add `ui.resultKey`, default `ctrl+shift+e`, with the existing key validation and conflict checks.
The operator requested this binding, and Pi leaves it free by default.
Fleet and inspection shortcuts retain their `off` defaults. Management navigation remains Down/Up.
An operator can remap the result key or choose `off`; saved key edits apply after `/reload`.

Keep one session flag, `resultsExpanded`, outside the lazy run runtime.
Render full text when `expanded || resultsExpanded`, where `expanded` belongs to Pi.
Each action toggles its own state. Both must be false to collapse a result.
The session flag reaches every retained result and new result; an enabled host state also expands new results.
The result shortcut leaves unrelated tool output unchanged. Reset the flag and detach the redraw hook at shutdown.

Capture the public terminal UI through an empty `ctx.ui.setWidget` factory.
On a result toggle, call `tui.invalidate()` before `tui.requestRender()`.
The live result component reads the session flag on each render. Ordinary fleet paints retain their existing route.

Ctrl+Shift+E needs extended-key reporting through kitty CSI-u or xterm `modifyOtherKeys`.
Without confirmed kitty support, warn that support is unverified and keep a conflict-free binding active.
OMPS cannot reliably confirm that a terminal honours `modifyOtherKeys`. Raw Ctrl+E keeps Pi's line-end action.
An effective Pi conflict disables the OMPS key and names the owning action.
Hints name the active result key and always include Pi's current expansion key as a fallback.
If `keyHint` is unavailable, use `expand with the host expansion key`.

Only the terminal display changes. Delivery, the 4000-character answer limit, `output.md` and delivery records retain their behaviour.
JSON, print and RPC result content stays unchanged.

## Consequences

### Positive

- Long answers take less transcript space, with a visible route to the hidden text.
- Failed results keep their error and partial-output warning visible.
- One session flag lets historical results respond before any new run creates the runtime.

### Negative

- Extended-key reporting varies by terminal. Operators can use the host key or select another free result key.
- The two independent states require both actions to be off before a result folds.
- A long unbroken line can still occupy many screen rows. Regular-mode scrollback needs real-host checks.

### Neutral

The parent checked this inventory against all changed files.
Focused checks passed for rendering, configuration, settings and public guides. The native result suite passed 12 tests on macOS for each of Pi 0.99.1 and 1.0.4.

| File                                                                                               | Consequence                                                                                       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/result-render.ts`                                                                             | Adds the eight-line limit and pure fold helper.                                                   |
| `src/result-message.ts`                                                                            | Owns live result rendering, hints, the session flag and the empty-widget redraw hook.             |
| `src/index.ts`                                                                                     | Registers the renderer and connects session start, shortcut dispatch and shutdown.                |
| `src/config.ts`                                                                                    | Adds `resultKey` defaults, declarations, validation and duplicate checks.                         |
| `src/ui-settings.ts`                                                                               | Includes the result key in cached presentation defaults.                                          |
| `src/shortcuts.ts`                                                                                 | Resolves active result bindings, Pi conflicts and terminal-support guidance.                      |
| `src/settings.ts`                                                                                  | Adds Result shortcut to the confirmed YAML edit flow and saved/active key display.                |
| `test/result-render.test.ts`                                                                       | Covers the limit, hidden count, short answers and retained warnings.                              |
| `test/result-message.test.ts`                                                                      | Covers retained components, independent states, hints, defensive rendering and hook disposal.     |
| `test/config.result-key.test.ts`                                                                   | Covers defaults, explicit keys, unsafe values and normalised duplicates.                          |
| `test/settings.result-key.test.ts`                                                                 | Covers the menu, confirmed saves, cancellation and validation.                                    |
| `test/index.test.ts`                                                                               | Checks renderer registration and host expansion.                                                  |
| `test/notify.test.ts`                                                                              | Checks unchanged model-facing content and the separate delivery contract.                         |
| `test/shortcuts.result-key.test.ts`                                                                | Covers result dispatch, conflicts, unverified support, extended sequences and raw Ctrl+E.         |
| `test/fixtures/interactive-shortcuts.mjs`                                                          | Updates native-host expectations for the newly active result shortcut.                            |
| `test/shortcuts.test.ts`                                                                           | Updates existing view-key fixtures for the additional result field and optional callback.         |
| `test/ui-settings.test.ts`                                                                         | Covers result defaults, retained cache values and exclusion of legacy result-key settings.        |
| `test/config.test.ts`                                                                              | Updates complete UI snapshots with the omitted result-key default.                                |
| `test/registry-store.test.ts`                                                                      | Includes the result key in immutable configuration snapshots.                                     |
| `test/settings.test.ts`                                                                            | Adds message-renderer registration to the harness and updates UI snapshots.                       |
| `test/settings-persistence.test.ts`                                                                | Includes the result key in saved UI snapshots.                                                    |
| `test/fixtures/todo-viewer.mjs`                                                                    | Exposes and checks the message-renderer API in the native todo compatibility fixture.             |
| `test/inspect.command.test.ts`                                                                     | Adds message-renderer registration to the existing command harness.                               |
| `test/result-message.e2e.test.ts`                                                                  | Checks native Pi dispatch, painted frames, provider content, saved output and disposable mutants. |
| `test/fixtures/result-message-host.mjs`                                                            | Runs real parent and child sessions with an isolated fake provider and terminal device.           |
| `docs/adr/016-fold-result-messages-and-bind-ctrl-shift-e.md`                                       | Records the accepted display and key decisions.                                                   |
| `docs/tdr/011-redraw-result-messages-and-preserve-legacy-ctrl-e.md`                                | Records redraw evidence, terminal limits and host-version distinctions.                           |
| `docs/adr/ADR_README.md`                                                                           | Indexes the accepted architecture decision.                                                       |
| `docs/tdr/TDR_README.md`                                                                           | Indexes the accepted platform finding.                                                            |
| `openspec/specs/result-message-display/spec.md`                                                    | Stores the synced result-display contract for future changes.                                     |
| `docs/USAGE.md`                                                                                    | Explains folding, independent toggles, warnings and Result shortcut settings.                     |
| `docs/SETUP.md`                                                                                    | Documents `ui.resultKey`, reload and terminal reporting.                                          |
| `README.md`                                                                                        | Adds the result behaviour and setting while preserving executable example markers.                |
| `skills/om-pi-subagents/SKILL.md`                                                                  | Guides operators and agents through folded result handoff.                                        |
| `openspec/changes/archive/2026-10-08-collapse-result-message/.openspec.yaml`                       | Identifies the change schema and creation date.                                                   |
| `openspec/changes/archive/2026-10-08-collapse-result-message/proposal.md`                          | Defines the approved change scope.                                                                |
| `openspec/changes/archive/2026-10-08-collapse-result-message/design.md`                            | Records independent states and the supported redraw route.                                        |
| `openspec/changes/archive/2026-10-08-collapse-result-message/tasks.md`                             | Tracks implementation and checks separately from this record.                                     |
| `openspec/changes/archive/2026-10-08-collapse-result-message/specs/result-message-display/spec.md` | Defines the revised display and terminal-support contract.                                        |

The parent verified the test and fixture paths, checked the full git diff inventory and ran both native-host versions.
Linux and physical terminal input remain outside the local evidence.
Recheck both record indexes after rebasing on `integration/settings-inspector`; retain every row and resolve number collisions.

## Alternatives Considered

| Option                                            | Rejected Because                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| Show every answer in full                         | Long results continue to fill the transcript.                                |
| Offer only the host expansion key                 | Leaves the requested result-only binding unavailable.                        |
| Bind raw Ctrl+E                                   | Takes Pi's editor line-end key.                                              |
| Disable the binding whenever kitty is unconfirmed | Rejects supported `modifyOtherKeys` input without proof of terminal failure. |
| Store expansion per message                       | Adds retained state and complicates toggling every result together.          |
| Make either key clear both states                 | Couples OMPS display state to the host's unrelated tool-output state.        |

## References

- [Approved design](../../openspec/changes/archive/2026-10-08-collapse-result-message/design.md)
- [Display requirements](../../openspec/changes/archive/2026-10-08-collapse-result-message/specs/result-message-display/spec.md)
- [Tasks](../../openspec/changes/archive/2026-10-08-collapse-result-message/tasks.md)
- [TDR-011](../tdr/011-redraw-result-messages-and-preserve-legacy-ctrl-e.md)
- [Result renderer](../../src/result-message.ts)
- [Fold helper](../../src/result-render.ts)
- [Unchanged notifier](../../src/notify.ts)
- [Pi extension contracts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/core/extensions/types.ts)
