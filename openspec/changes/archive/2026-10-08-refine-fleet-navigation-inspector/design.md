# Design

## Context

See [proposal.md](proposal.md) for the requested scope.

Verified implementation facts:

- `src/config.ts` has four UI fields. `ui.fleetView: expanded` controls both widgets together.
- `src/fleet-view.ts` hard-codes Down/Up. Its focus check accepts any non-null focused component when no overlay exists.
- Pi 1.0.4 replaces the editor with its settings or extension selector and focuses that component. These selectors need no overlay. The current OMPS check therefore permits interception while settings owns input.
- `src/inspector.ts` uses side-by-side panes at 80 columns or wider. It has no theme input. `src/viewer.ts` ignores the theme supplied by `ctx.ui.custom()`.
- Inspector Up/Down select nodes. PageUp/PageDown scroll only when saved details exist, which prevents scrolling an otherwise available live preview.
- The inspector manually bounds a `ScrollView` child. The pinned host's `ScrollView.render()` returns content lines; layout state supplies its scroll offset. Keep one clear viewport boundary.
- `ObservationStore` already retains current tools, model, start/end times, task summaries and sanitised visible assistant text. It does not retain complete tool history or results.
- `DetailSelection` already invalidates stale reads. Selected evidence is restricted to validated `config.json` and `output.md`, capped at 64 KiB each.
- Pi 1.0.4 binds `tui.altScreen.previousPrompt` and `tui.altScreen.nextPrompt` to Ctrl+Shift+Up/Down. Existing OMPS policy protects effective Pi bindings.

Relevant contracts are the `live-run-panel` and `agent-tree-viewer` deltas. ADR-007 and ADR-009 preserve ownership, privacy and result boundaries.

## Goals / Non-Goals

**Goals:**

- Separate passive monitoring from management-list visibility and input ownership.
- Use the host's public theme, key parser and focus interfaces.
- Keep one selected-run identity and one detail viewport.
- Make live content readable and scrollable independently of saved-file success.
- Preserve existing YAML defaults and durable run evidence.

**Non-Goals:**

- Full conversation or tool-result replay, raw arguments, thinking, stderr or a new event-history store.
- Agent steering, pausing, queueing or changed launch/cleanup behaviour.
- A new styling framework, dependency or terminal renderer.
- Automatic edits to Pi keybindings, operator YAML, sibling preferences or child mappings.

## Decisions

### 1. Split the management-list preference from the tree view

Add fields to the existing version-1 `ui` mapping:

| Field                | Accepted value                | Omitted default | Application                             |
| -------------------- | ----------------------------- | --------------- | --------------------------------------- |
| `showManagementList` | Boolean                       | `true`          | Immediate after confirmed settings save |
| `navigationDownKey`  | Pi key specification or `off` | `down`          | After `/reload`                         |
| `navigationUpKey`    | Pi key specification or `off` | `up`            | After `/reload`                         |

Settings labels are **Management list**, **Management next / enter key** and **Management previous key**. Keep **Fleet view** for the tree's expanded/collapsed/off state. Rename the existing display label **Fleet list shortcut** to **Fleet view shortcut** so a toggle cannot be mistaken for a navigation key. Its YAML name remains `toggleKey`.

Effective list visibility is `expanded && showManagementList && listedRoots.length > 0`. Tree rendering keeps its current rules and tintin styling. Hiding the list removes the hint and all row markers, ends selection and releases navigation input. Session fleet toggles never change the saved list preference.

Use existing confirmation, revision, locking and atomic-write behaviour. Add fields to immutable UI snapshots and declaration tracking. Display key edits against the actual active bindings until reload. Failed or cancelled saves leave confirmed state unchanged.

**Alternative:** adding `tree-only` to `fleetView` would mix tree expansion and list visibility. A boolean lets operators keep their existing expanded preference.

### 2. Scope configurable navigation to the verified editor

Pass the effective active navigation keys to fleet input and hint rendering. Continue to handle navigation through the existing terminal-input path rather than global shortcuts: it requires an empty editor, actual editor ownership and visible list rows.

Identify the focused editor using supported public host interfaces and the exported editor contract. A non-null focused component alone is insufficient. Confirm the approach against the pinned host and installed Pi 1.0.4. If a host or custom editor cannot be identified safely, pass keys through and retain command access. Never inspect private focus fields or replace the main editor merely to detect focus.

Default Down/Up keep the existing narrowly scoped use. For those defaults, allow only their normal editor movement/history and picker navigation overlaps. Any other effective action on the same key still conflicts. Custom navigation keys use the existing modifier normalisation and unsafe-key checks. Reject duplicates across both navigation keys, `toggleKey` and `inspectKey`.

At session start, resolve custom conflicts against effective Pi bindings. Disable the conflicting key, identify the owning action and show recovery instructions. Never fall back to Down/Up after a requested custom binding fails. With navigation Down off or inactive, no key enters selection. With navigation Up off or inactive, omit that action from the hint. Enter and Escape remain selection-local; releases are ignored.

The operator's preferred pair is:

```yaml
ui:
  fleetView: expanded
  showManagementList: false
  navigationDownKey: ctrl+shift+down
  navigationUpKey: ctrl+shift+up
```

This keeps the tree visible and hides the list. Management navigation stays inactive while the list is hidden; `/omps inspect` or an independently configured inspection shortcut opens the inspector. Showing the list later enables its successfully bound navigation keys.

For Pi 1.0.4, the documentation gives this optional manual way to free the pair in the operator's existing `keybindings.json`:

```json
{
	"tui.altScreen.previousPrompt": ["ctrl+up"],
	"tui.altScreen.nextPrompt": ["ctrl+down"]
}
```

The operator merges these entries, checks `/hotkeys`, then runs `/reload`. Keep other custom entries and do not create or change that file automatically. The examples describe supported key syntax; actual terminal reporting still needs interactive verification.

**Alternative:** silently overriding fullscreen shortcuts would violate the project's input-ownership contract and reproduce the reported interference.

### 3. Use a picker followed by a full-width detail screen

Remove the width-based split-pane branch. Every width uses the same screen state:

- `/omps inspect` opens a parent-first picker with foldable descendants.
- Enter or a fullscreen row click opens the selected detail screen and starts its bounded saved read.
- A run-id command or management-list inspection opens details directly.
- Escape from picker-origin details returns to the picker with selection and folds intact. Escape from direct details closes.
- Left/Right in details switches to the previous/next visible picker node and opens its details. Up/Down always scroll details.

Picker rows prioritise agent name, state and elapsed time. Task summaries use a muted second line when space permits. A short run id can distinguish identical agent names; the full id belongs in details. Map click coordinates to the rendered row identities, including window offsets and two-line rows.

Detail anatomy:

1. Fixed header: inspector title, selected name, state and elapsed time.
2. One scrollable body: lineage, known model and run id, task, current activity, provisional answer and saved output.
3. Fixed footer: context-specific controls, visible line range and total content lines.

Illustrative detail screen, with synthetic data:

```text
╭ OMPS inspector · a-explore                         Running · 8m 28s ╮
│                                                                    │
│ Task                                                               │
│ Investigate why a local sync overwrites mirrored changes.           │
│                                                                    │
│ Current activity                                                   │
│ Reading · read ×2                                                  │
│                                                                    │
│ Live answer · provisional                                          │
│ The mutation path writes the local record before the mirror check.  │
│                                                                    │
│ Saved output                                                       │
│ Unavailable while this agent is running.                            │
│                                                                    │
╰ ↑↓ scroll · PgUp/PgDn page · ←→ agent · Esc back      Lines 1–16/48 ╯
```

This is a layout contract rather than an exact-width screenshot. Narrow layouts wrap body content and shorten the footer. Very small heights reduce decoration before content; every rendered line and the total viewport remain bounded.

**Alternative:** stacking a persistent tree above details would still consume reading space and leave arrows with competing meanings.

### 4. Make viewport movement independent of file reads

Use one host `ScrollView` state for the detail body with explicitly calculated content and viewport heights. Fixed header/footer rows are excluded from the content offset. Enable keyboard scrolling whenever details are open, including loading, errors and provisional-only content.

Up/Down move one line. Page keys move a viewport minus one overlap line. Home and End select the boundaries. Fullscreen wheel input over the detail body scrolls and requests redraw; regular mode keeps keyboard access because the terminal owns mouse scrollback. Display a line-range indicator whenever content exceeds the viewport.

Initially show the top of a newly selected agent. Once the reader reaches the bottom, follow new content; upward movement stops following. Preserve the current position on live updates and clamp only when content shrinks or viewport size changes. Do not reset scrolling for a same-run terminal refresh. Keep saved-read invalidation when changing agents or closing.

**Alternative:** gating scroll on `RunDetails` conflates file availability with content availability, which caused the reported behaviour.

### 5. Render observed activity and answers with Pi's theme

Pass the supplied theme and Markdown theme helpers from `src/viewer.ts` to the inspector. Use semantic colours: accent for the selected name, text for body content, muted for metadata, success/error/warning for outcomes. Retain explicit status words and selection markers so colour is not the only signal.

Use full available body width, light borders and blank lines between labelled sections. Wrap the submitted task and metadata safely. Render sanitised visible assistant text and saved answers through Pi's Markdown component. Preserve line breaks and indentation in preview sanitisation at publication and validation; normalise carriage returns and remove terminal controls and direction overrides. Keep the existing 4 KiB UTF-8 bound, truncation marker and visible-text-only sources. Task summaries remain single-line. Cache by width, content and active theme, and invalidate on changes.

Show current tools from the selected node's validated `activeTools`, including concurrent names/counts. With no tools, say **No active tool observed**. Display the entire retained provisional preview up to its existing 4 KiB limit; preserve its truncation marker. Use **Live answer · provisional**, **Saved output**, **Partial output** and **Unavailable** consistently. No current tool information becomes a fabricated tool history.

Use a small inspector-owned elapsed-time refresh while selected work is active. Dispose it when the modal closes or its session ends. Its callback performs no file reads, process controls or model requests. Terminal duration uses the retained end time.

**Alternative:** forwarding raw events or tool results would expand the privacy and storage boundary beyond the requested display change.

### 6. Keep responsibilities and existing safeguards

Keep selection, read cancellation and lifecycle in `src/inspector.ts`. Extract presentation into a small dedicated helper if the redesigned component cannot stay below the project's size limit. Avoid a generic UI framework.

Reuse the existing observation and detail reader. Preserve lineage validation, content bounds, terminal-control sanitisation, partial-result labels, incomplete-evidence warnings and non-interactive fallbacks. Keep pending reads generation-checked. A display failure releases modal subscriptions, timers and reads without changing work or results.

Record the change in Proposed ADR-012. (Renumbered from 011 after the guarded-merge ADR took that number on main.) Accepted ADRs stay immutable except permitted supersession metadata after verification.

## Risks / Trade-offs

- **Requested keys conflict with Pi fullscreen navigation:** name the effective actions and provide manual remapping instructions. No automatic takeover.
- **Some terminals swallow modified arrows:** verify legacy modified-arrow and Kitty press/release encodings, then smoke-test the operator's terminal. Offer other keys through settings.
- **Custom editors vary:** require verifiable public editor ownership and fail closed otherwise. Test the normal host editor and supported custom-editor cases.
- **Live text can change its line count:** keep a stable offset or bottom-follow state and clamp on shrink. Test updates during reading and resize.
- **Single-column views require a picker step:** retain direct run-id entry and detail-to-detail Left/Right navigation.
- **Markdown can widen output or contain controls:** sanitise before rendering, measure terminal columns and test code blocks, wide characters and adversarial text.
- **Animation or elapsed timers can outlive sessions:** modal disposal must clear timers and block late callbacks.
- **Tests can miss real focus routing:** reuse interactive Pi fixtures for `/settings`, extension selectors and both terminal modes.

## Migration Plan

1. Approve this proposal before implementation.
2. Implement and test in the sibling feature worktree.
3. Keep existing YAML and defaults valid without modifying operator files.
4. Document the optional tree-only and modified-arrow configuration.
5. Ask permission before full CI and any live configuration edit.
6. Verify the change and resolve findings before accepting ADR-012 or archiving.

Rollback uses the previous package and removes only the new optional UI fields from an operator-approved configuration copy. Older packages reject unknown UI fields. Any manual Pi keybinding changes remain operator-owned and must be restored separately if desired.

## Verification Approach

- Add failing regressions for selector focus and provisional-only scrolling before implementation.
- Cover independent list visibility, settings cancellation/conflicts, custom-key conflicts and effective hint text.
- Exercise single-column rendering, every scroll key, windowed clicks, stale reads, live updates, resize and theme changes.
- Reuse interactive Pi fixtures for settings navigation, modified keys, long answers and fullscreen wheel routing.
- Save synthetic light/dark and narrow/wide visual evidence under ignored `docs/local-docs/`.
- For new safeguards, break them in disposable copies and confirm targeted tests fail.
- Run focused suites first. Ask permission for `bun run ci`; run strict OpenSpec validation with verification.
- Scan changed first-party code with Aikido when available. Record unavailable tools honestly.
- Run macOS and Linux checks through available runners. Do not claim Linux or real-terminal coverage without execution evidence.
- After an authorised commit, run `bun run ci:clean` before any permitted push.
