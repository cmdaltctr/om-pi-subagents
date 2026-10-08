# Tasks

## 1. Independent management-list visibility

- [x] 1.1 Add configuration, settings and fleet regressions for `showManagementList` default/type validation, hide-during-selection and expanded-tree preservation; confirm each new behaviour fails on the current implementation.
- [x] 1.2 Implement the boolean in immutable snapshots, UI cache, atomic settings saves and live repaint; pass the relevant `config`, `ui-settings` and `settings` suites, including cancellation and revision/write failures.
- [x] 1.3 Gate list rendering and input independently of the tree, end selection when hidden and preserve session toggle behaviour; pass `fleet`, `fleet-widget` and `fleet-view` suites and confirm a disposable broken visibility gate fails them.
- [x] 1.4 Update `README.md`, `docs/SETUP.md`, `docs/USAGE.md` and the shipped skill for Show/Hide, tree-only use and slash-command access; pass relevant documentation checks without changing operator files.

## 2. Remappable navigation and focus ownership

- [x] 2.1 Add failing regressions for Pi settings and selectors with non-null focus and no overlay; reproduce interception with the existing interactive Pi fixture before changing the focus check.
- [x] 2.2 Implement verified public editor-focus detection with safe pass-through when unsupported; pass focus tests and interactive `/settings`, model-selector, extension-selector and unrelated-overlay navigation in regular/fullscreen modes.
- [x] 2.3 Add and implement `navigationDownKey`/`navigationUpKey` validation, defaults, off values and cross-field normalised duplicate checks; confirm new tests fail before implementation and relevant configuration/settings tests pass afterwards.
- [x] 2.4 Resolve active custom-key conflicts against effective Pi actions, retain only scoped default-arrow overlaps and provide named recovery guidance; pass shortcut/settings tests for occupied keys, released keys, disabled navigation and no silent fallback.
- [x] 2.5 Apply active navigation keys to list entry/movement and hints after reload, rename the toggle label to Fleet view shortcut and ignore release events; pass fleet/interactive shortcut tests for legacy and Kitty Ctrl+Shift+arrow input and plain-arrow pass-through.
- [x] 2.6 Document manual Pi fullscreen-key remapping, active-versus-saved keys and terminal caveats in public usage/setup guidance and the shipped skill; verify examples with synthetic keybindings and confirm disposable breaks in focus/conflict guards fail targeted tests.

## 3. Single-column inspector and reliable scrolling

- [x] 3.1 Add failing inspector tests for full-width details at wide/narrow sizes, provisional-only scrolling and delayed/failed evidence reads; confirm failures exercise the current split layout and saved-detail scroll gate.
- [x] 3.2 Replace split panes with picker/detail states, direct run-id entry, origin-aware Escape, picker folding and Left/Right detail switching; pass inspector/inspect-command tests for all retained descendants, preserved draft/view state and stale-read rejection.
- [x] 3.3 Implement one bounded detail viewport with Up/Down, page and boundary keys, fullscreen wheel routing and line-range feedback; pass provisional/loading/error/saved-output cases and confirm disposable scroll-guard breaks fail tests.
- [x] 3.4 Preserve reading position or bottom-follow state on live/terminal updates and resize; pass inspector tests for appended/replaced/shrunk content, tiny heights, frozen run identity and terminal-refresh reads.
- [x] 3.5 Map fullscreen picker clicks to rendered row identities, including scrolled windows and two-line rows; pass grandchild and windowed-click tests with no sibling evidence substitution.
- [x] 3.6 Update `docs/USAGE.md`, relevant README guidance and the shipped skill for picker/detail controls and mouse limits; run documentation checks and interactive long-answer scrolling in both terminal modes.

## 4. Readable themed activity and answers

- [x] 4.1 Add render tests for semantic theme output, Markdown headings/lists/code, current tools, full retained provisional text, incomplete warnings and width/height bounds; confirm relevant new assertions fail before presentation changes.
- [x] 4.2 Pass Pi's theme to the inspector, preserve live-preview Markdown line breaks and indentation within existing sanitisation/privacy bounds, add clear labelled sections and render sanitised answers with host Markdown; pass rendering/safety suites with light/dark themes, wide characters, control sequences and truncated evidence.
- [x] 4.3 Show selected-run elapsed time with a modal-owned refresh and frozen terminal duration; pass fake-time tests for idle updates, close, session replacement and late callbacks without process/file/model side effects.
- [x] 4.4 Capture synthetic narrow/wide and light/dark inspector evidence in ignored `docs/local-docs/`; review it against the design anatomy and document live-preview limits in usage guidance and the shipped skill.
- [x] 4.5 Check focused rendering tests with disposable broken theme, sanitisation and disposal safeguards; confirm intended failures and keep deliberate breaks outside working files.

## 5. Integration and verification

- [x] 5.1 Run the targeted configuration/settings, fleet/shortcut, inspector/command, interactive Pi and documentation/packaging suites together; record exact commands/results and keep independent tests enabled if a CLI suite is unavailable.
- [x] 5.2 Ask permission for `bun run ci`, then run it from the verified feature worktree; resolve all findings and report any macOS/Linux or real-terminal coverage that remains unrun.
- [x] 5.3 Scan changed first-party code with Aikido when available and run `openspec validate refine-fleet-navigation-inspector --strict`; resolve findings and keep security/visual evidence in ignored local reports.
- [x] 5.4 Run the OpenSpec verification workflow against the deltas and design; check all acceptance scenarios, retain honest unavailable-check labels and accept ADR-012 only after findings are resolved.
- [x] 5.5 After an authorised commit, run `bun run ci:clean` and record the result; request permission before any push.

## After implementation

Archive the verified change with its spec deltas after every task is complete and before creating a pull request.
Preserve local evidence before removing temporary worktrees.
