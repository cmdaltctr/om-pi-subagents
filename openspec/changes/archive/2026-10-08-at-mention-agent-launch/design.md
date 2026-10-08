# Design

## Context

`/omps run <agent> <task>` in `src/index.ts` calls `service.run(owner, { agent, task }, context)`, shows the acknowledgement and appends the tree entry. It uses no model. Pi offers two extension hooks that fit the new feature:

- `pi.on("input", handler)` receives `{ text, source }` before the line reaches the model. The handler can return `{ action: "handled" }`, `{ action: "transform", text }` or `{ action: "continue" }`.
- `ctx.ui.addAutocompleteProvider(factory)` wraps the current provider. Register it during TUI `session_start`. A provider has asynchronous `getSuggestions`, synchronous `applyCompletion`, and optional `triggerCharacters` and `shouldTriggerFileCompletion`.

Pi's built-in provider already uses `@` for file references.

## Goals / Non-Goals

**Goals:**

- Pick a mapped agent while typing `@` at the start of the line.
- Launch it without a parent model request for routing. Child model calls and later result delivery remain unchanged.
- Reuse the `/omps run` path so rules stay in one place.

**Non-Goals:**

- No mid-sentence agent mentions.
- No change to the `omps` tool, YAML or result message.
- No model-assisted routing.

## Decisions

### 1. Launch directly through the service

The operator chose direct launch. The input handler parses the line and calls the same code as `/omps run`. To avoid a copy, move the body of the `run` branch in the command handler into one function (`launchRun(ctx, agent, task)`) that both the command and the input handler call. The input handler then returns `{ action: "handled" }`.

Alternative: transform the line into a prompt that asks the model to call `omps`. Rejected. It costs a model turn and the model may change the task.

### 2. Parse in a pure helper

`parseAtMention(text, names)` in `src/at-mention.ts` returns one of `{ kind: "launch", agent, task }`, `{ kind: "unknown", name }`, `{ kind: "no-task", agent }` or `{ kind: "none" }`. The helper matches `^@(\S+)(?:\s+([\s\S]*))?$` at the start of the text it receives. A leading space passed directly to the pure helper returns `none`. Pi trims editor submission before the input event, so an operator's leading spaces do not prevent launch. Accept this host behaviour; add no earlier editor hook. A whitespace-only task returns `no-task`, and a bare `@` returns `none`. A name that is not mapped but looks like a path (contains `/` or `.`) returns `none`, so `@README.md ...` and `@src/x.ts ...` stay file references. Any other unmapped name returns `unknown`.

### 3. Fresh registry read on submit and on completion

Both paths read the registry through the existing store, as launches already do. Input outside the interactive TUI, or text without an initial `@`, passes through without a read. If a registry read fails for an initial `@`, show the error and return `handled`, so Pi cannot forward a failed launch attempt to the model. A failed completion read offers no OMPS items and preserves Pi's items. Never reuse stale mappings.

### 4. Autocomplete wrapper

Register `ctx.ui.addAutocompleteProvider` during TUI `session_start`. Offer agent items only on editor line zero, when the input starts with `@` and the cursor remains in that first word. Read fresh mappings for each triggered request. Use agent names as labels; mappings have no description field.

Pi stacks wrapper factories but does not merge items itself. Call the wrapped provider and place OMPS items above its unchanged items only when the replacement prefixes are compatible. Preserve its optional trigger and file-completion hooks. Use item value `@<agent>` without trailing whitespace. Track OMPS item identity and replace the whole initial token when applying an agent item. Insert exactly one space before the existing task and preserve subsequent lines. Delegate native file items unchanged. Native application only replaces text before the cursor; it leaves an old agent-name suffix when the cursor is inside the name. Explicit owned-item application prevents that task corruption. Other positions pass through untouched.

Source inspection of pinned Pi 0.99.1 confirms the API and stacking in `pi-coding-agent/dist/core/extensions/types.d.ts` and `dist/modes/interactive/interactive-mode.js`. The built-in merge prefix and application behaviour live in `pi-tui/dist/autocomplete.js`. Task 1.1's executable spike passed; its runtime evidence is recorded below.

### 5. Interactive only

The handler checks `event.source === "interactive"` and `ctx.mode === "tui"`. RPC and extension input pass through. Catch registry and launch errors locally and return `handled`; Pi continues prompt processing after an uncaught input-handler error.

Reuse the isolated workspace and fake model in a disposable real SDK session bound to TUI mode. Submit with interactive source to test launch interception, while the existing RPC fixture proves pass-through. Use the native memory-terminal editor fixtures to test completion selection and Pi's submission trimming. Hold the child reply behind a barrier when checking that launch makes no parent routing request. Saved output and result delivery remain separate checks.

Capacity and depth refusals happen before acknowledgement. Readiness runs asynchronously after admission; preserve the acknowledgement followed by the failed result, as `/omps run` already does.

## Spike evidence (task 1.1)

### Source evidence

Pinned Pi 0.99.1 exposes `addAutocompleteProvider` in `dist/core/extensions/types.d.ts`.
`dist/modes/interactive/interactive-mode.js` stacks factories in `setupAutocompleteProvider` and installs the resulting provider on the editor.
Its `setupEditorSubmitHandler` trims text before forwarding it.
`pi-tui/dist/autocomplete.js` returns the complete `@` token as the replacement prefix.
Its `applyCompletion` adds one space for non-directory `@` items.

### Runtime evidence

`test/fixtures/at-mention-spike.mjs` binds a disposable real SDK session to TUI mode.
`test/fixtures/at-mention-host.mjs` uses the native interactive host, editor and memory terminal.
The inline spike registers its wrapper during `session_start` through the real UI context.
The run on pinned Pi 0.99.1 passed:

- Native file values stayed in order: `@reader.md`, `@README.md`.
- Merged labels were `reader`, `reader.md`, `README.md`, with the same replacement prefix.
- Typing `@` and selecting with Tab produced `@reader ` and cursor `{ line: 0, col: 8 }`.
- Submitting `@reader inspect this` delivered `@reader inspect this` to the SDK session.

The executable spike confirms the wrapper API, native spacing and submission trimming. Production application uses an explicit whole-token replacement for OMPS items because later native-provider regressions exposed remaining-name and duplicate-separator defects. Native file items still delegate unchanged.

## Risks / Trade-offs

- A mapped agent with the same name as a file in the project hides that file reference at the start of a line. The path check in decision 2 keeps names with `/` or `.` as files. A bare name such as `@docs` is treated as an agent when `docs` is mapped.
- Direct launch preserves the task received from Pi. Pi's existing submission trimming applies before interception.
- Pi upgrades can change wrapper, token or submission behaviour. Rerun the pinned-provider and native-editor checks when updating the host.
