# Agent tree viewer Specification

## Purpose

Let operators expand an OMPS run tree and inspect an agent's work from the main conversation using keyboard or supported mouse input.

## Requirements

### Requirement: Render a current-session hierarchy

The system SHALL represent tool-launched and command-launched runs in one current-session fleet and a retained descendant modal. Each modal node SHALL show its agent, run identity and authoritative or observed state beneath its immediate parent. Per-launch transcript entries SHALL remain compact acknowledgements rather than separate live trees. Historical `omps-tree` entries MUST retain bounded rendering without recreating active work. Old `ompss-tree` entries SHALL have no extension compatibility renderer. The status count SHALL remain complete for direct active runs.

#### Scenario: Parallel roots and nested children coexist

- **WHEN** two direct runs are active and one has a grandchild
- **THEN** both roots appear in the session modal
- **AND** the grandchild appears beneath its actual immediate parent

#### Scenario: A run starts through the slash command

- **WHEN** an operator starts a run with `/omps run`
- **THEN** it receives a compact transcript acknowledgement and the same fleet/modal representation as a tool launch
- **AND** no synthetic user prompt or model-visible progress message is needed

#### Scenario: A short run completes before its card is drawn

- **WHEN** a run ends before its first UI render
- **THEN** retained evidence shows its terminal state in inspection without recreating active work

#### Scenario: An older session contains tree entries

- **WHEN** a historical `omps-tree` entry is rendered
- **THEN** it stays bounded and labels unavailable evidence
- **AND** it creates no live tree, process or model request

#### Scenario: An old-acronym tree entry exists

- **WHEN** a session file contains `ompss-tree`
- **THEN** no extension renderer is registered under that identifier
- **AND** the session file is neither rewritten nor used to restart work

### Requirement: Honour the host expansion action

OMPS SHALL preserve the host's tool-output expansion action, including Ctrl+O and configured replacements. That action SHALL keep its normal effect on transcript tool output without controlling the session fleet or modal. OMPS MUST NOT replace the host action or silently edit host keybindings. Compact launch acknowledgements MUST NOT become live per-run trees through host expansion.

#### Scenario: The operator presses Ctrl+O

- **WHEN** the default host expansion shortcut is pressed
- **THEN** Pi performs its normal tool-output expansion
- **AND** the OMPS fleet keeps its own expansion state

#### Scenario: The expansion key is remapped

- **WHEN** the operator changes the host expansion binding
- **THEN** that key retains its host-defined behaviour
- **AND** OMPS does not rewrite the binding

#### Scenario: Other tool output shares the transcript

- **WHEN** OMPS acknowledgements coexist with unrelated tool calls
- **THEN** host expansion keeps its existing effect on those calls

### Requirement: Inspect agents without leaving the main session

One read-only modal SHALL inspect owned roots and validated observed descendants. Keyboard navigation SHALL work in fullscreen and regular modes; fullscreen row clicks SHALL select details. Branches SHALL fold/unfold without discarding retained nodes. Enter SHALL open details and Escape SHALL return or close. Opening, navigating, resizing or closing MUST NOT pause, cancel or restart runs. The editor draft and prior fleet view state SHALL survive closure.

#### Scenario: A fullscreen row is clicked

- **WHEN** the operator clicks an observed grandchild in the modal
- **THEN** its details appear with the correct lineage
- **AND** its parent and siblings continue running

#### Scenario: Keyboard navigation is used

- **WHEN** the operator opens `/omps inspect` in either terminal mode
- **THEN** arrows select nodes, branch keys fold/unfold, and Enter opens selected details
- **AND** Escape returns to Pi without cancelling work

#### Scenario: The terminal uses regular mode

- **WHEN** application-owned mouse input is unavailable
- **THEN** all retained descendants remain keyboard-accessible
- **AND** the modal makes no working-click promise

#### Scenario: A selected child finishes

- **WHEN** the selected child becomes terminal while the modal is open
- **THEN** its status and available saved output update
- **AND** the modal remains open

#### Scenario: The terminal becomes narrow

- **WHEN** a resize makes side-by-side panes unusable
- **THEN** tree and details use a sequential layout
- **AND** selection remains attached to the same run identity

#### Scenario: A draft exists before inspection

- **WHEN** the operator closes the modal after typing a draft in Pi's editor
- **THEN** the draft and previous fleet expansion state are restored unchanged

### Requirement: Show selected details from saved evidence

Details SHALL show the submitted task, state, known model, elapsed time, active tool names, bounded provisional assistant preview and available saved output. Missing information MUST be labelled unavailable; failed or cancelled output MUST be partial. Saved reads MUST remain bounded and limited to validated files. Selection changes and session end MUST invalidate pending reads. A live preview MUST NOT be presented as a saved final answer or evidence of completion.

#### Scenario: A completed descendant is inspected

- **WHEN** its saved final output exists
- **THEN** the modal shows that output and correct lineage
- **AND** the operator can scroll the bounded detail view

#### Scenario: A run is still active or its output cannot be read

- **WHEN** final output is absent or unreadable
- **THEN** details show known live activity and any provisional assistant preview
- **AND** saved output remains labelled unavailable
- **AND** no sibling answer is substituted

#### Scenario: Output arrives after selection changes

- **WHEN** a delayed read finishes after another run is selected
- **THEN** it cannot replace the new selection's details

#### Scenario: The requested run or file path is untrusted

- **WHEN** an identity is foreign or a selected file resolves outside the allowed run directory
- **THEN** inspection rejects it before reading that file

#### Scenario: A live preview is truncated

- **WHEN** more than 4 KiB of visible assistant text is produced
- **THEN** the retained preview stays within 4 KiB and identifies truncation
- **AND** the saved final result remains unchanged

### Requirement: Configure visible agents without limiting their work

`/omps-settings` SHALL expose registry `ui.maxVisibleAgents`, default five and safe integers from one to 256. It SHALL bound expanded fleet roots; the modal SHALL independently scroll all retained nodes within terminal space. Hidden counts MUST differ from incomplete observations. Applying the value MUST NOT discard evidence, change execution limits, cancel runs or affect delivery. The generic command alias SHALL use the same settings.

#### Scenario: The widget exceeds the visible-agent preference

- **WHEN** six direct children are active and the saved visible-agent limit is two
- **THEN** expanded fleet content shows at most two root rows with accurate additional-row information
- **AND** scrolling, status and run controls still reach all six roots

#### Scenario: An expanded tree hides descendants

- **WHEN** a modal branch is folded or some rows are outside its viewport
- **THEN** every retained descendant remains available through unfolding and scrolling
- **AND** no descendant observation is discarded

#### Scenario: The visible-agent preference changes during work

- **WHEN** a valid display change is saved successfully
- **THEN** the current fleet repaints from retained evidence
- **AND** work and result delivery continue unchanged

#### Scenario: The observation safety bound is exceeded

- **WHEN** descendant observations cannot fit the fixed retention bound
- **THEN** the modal labels missing evidence separately from retained hidden rows
- **AND** a larger visible-agent preference does not remove the retention bound

### Requirement: Keep rendering bounded and safe

Tree and detail rendering SHALL fit the available terminal width and bound retained display content. Omitted nodes and truncated output MUST be identified. Terminal controls MUST be removed from displayed text. Tool arguments, raw results, thinking and stderr SHALL remain excluded. Resize or display failure MUST NOT alter run state, cleanup or result delivery.

#### Scenario: A narrow terminal displays a large tree

- **WHEN** the tree exceeds visible rows or width
- **THEN** it truncates or scrolls safely and identifies omitted content
- **AND** admission and execution limits remain unchanged

#### Scenario: Names or output contain terminal instructions

- **WHEN** displayed data contains control sequences or directional overrides
- **THEN** the viewer renders sanitised text without executing those instructions

#### Scenario: A modal fails or the session ends

- **WHEN** the detail component throws or its session is replaced
- **THEN** it releases its subscriptions and pending reads
- **AND** it leaves no viewer or delayed update in the successor session

### Requirement: Preserve non-interactive and todo behaviour

RPC inspection SHALL provide bounded plain text through supported output instead of attempting a terminal modal. JSON and print runs SHALL remain unaffected by terminal-only rendering. The OMPS viewer MUST NOT replace the todo widget, copy parent tasks, change OpenSpec bindings or complete a parent todo from a child result.

#### Scenario: An RPC client requests inspection

- **WHEN** `/omps inspect` is handled outside the terminal UI
- **THEN** the client receives bounded current-session tree or detail text
- **AND** no custom terminal component is attempted

#### Scenario: Todo uses normal or OpenSpec mode

- **WHEN** real `om-pi-todo` and OMPS load in either order
- **THEN** both widgets and their task ownership remain independent
- **AND** opening, expanding and closing the viewer leave todo preferences and linked checkboxes unchanged

### Requirement: Provide independent fleet and inspection shortcuts

The fleet toggle SHALL default to Alt+O and inspection to Alt+I. Both SHALL be configurable or disabled through YAML/settings. Unsafe built-in conflicts, duplicate keys and Ctrl+I's Tab alias MUST be rejected with guidance. Shortcuts SHALL act only in their live owning terminal session and MUST NOT consume keys owned by another dialog. Shortcut edits SHALL state that reload is required.

#### Scenario: The fleet key is used

- **WHEN** the default fleet key is pressed while the editor owns input
- **THEN** the fleet changes between one-row and expanded views without changing run state

#### Scenario: The inspection key is used

- **WHEN** the default inspection key is pressed with retained work
- **THEN** the current-session modal opens directly
- **AND** it starts no model request or process

#### Scenario: Tab or an occupied native key is configured

- **WHEN** an operator chooses Ctrl+I, duplicate view keys or a key occupied by an effective built-in action
- **THEN** settings explains the conflict and refuses the edit
- **AND** existing input bindings remain unchanged

#### Scenario: Another dialog owns input

- **WHEN** a selector, settings dialog or unrelated overlay has focus
- **THEN** fleet input handling leaves its navigation and submission keys untouched

#### Scenario: Key release follows key press

- **WHEN** the terminal reports both press and release for one tap
- **THEN** a fleet action or selection movement happens once

#### Scenario: Shortcuts are disabled

- **WHEN** both OMPS view keys are `off`
- **THEN** `/omps fleet` and `/omps inspect` still provide view access

### Requirement: Update public operator guidance

`README.md` and the public setup, installation, usage and removal guides SHALL describe the implemented fleet/modal, supported shortcuts, YAML/settings authority, migration and optional per-agent capabilities. Their examples SHALL match real extension behaviour and preserve private operator data. These guide updates SHALL ship in the same change as the supported behaviour.

#### Scenario: An operator follows the updated guides

- **WHEN** the documented fleet, inspection, settings and optional-capability examples are exercised
- **THEN** their commands and YAML produce the documented behaviour
- **AND** unsupported steering, queueing or automatic parent task completion is not promised

#### Scenario: Installation or removal is followed

- **WHEN** the public install or uninstall procedure is checked against the package
- **THEN** it correctly describes extension/skill discovery and operator-owned configuration
- **AND** it requires no manual copy of the bundled skill

### Requirement: Keep the fleet decision record current

ADR-007 and `docs/adr/ADR_README.md` SHALL record the chosen fleet/modal, shortcut, YAML and sibling boundaries. ADR-007 SHALL remain Proposed until implementation verification passes, then become Accepted with an accurate index entry. Existing accepted ADR text MUST remain intact except permitted status/supersession metadata.

#### Scenario: Implementation is still unverified

- **WHEN** the design or implementation is being revised
- **THEN** ADR-007 records the current proposed decisions and keeps Proposed status
- **AND** the index links to that record

#### Scenario: Verification is complete

- **WHEN** implementation checks pass and verification findings are resolved
- **THEN** ADR-007 describes the implemented choices and is marked Accepted
- **AND** its index status agrees

### Requirement: Ship the updated operational skill

The package SHALL ship the revised `skills/om-pi-subagents/SKILL.md` through `files` and `pi.skills`. A normal installation with skills enabled SHALL discover `/skill:om-pi-subagents`. Instructions SHALL cover the fleet/modal, settings, default-off capabilities and ownership boundaries, with portable references inside the package. Skill loading MUST NOT grant tools or load ambient child resources.

#### Scenario: The packed extension is installed

- **WHEN** a disposable normal package installation enables its skill resources
- **THEN** `/skill:om-pi-subagents` is available with the revised instructions
- **AND** its relative public-guide links resolve within that installation

#### Scenario: Skill command expansion is checked

- **WHEN** the installed skill command is invoked using the fake-model fixture
- **THEN** its revised fleet/settings guidance reaches the model
- **AND** no manually copied skill is needed

#### Scenario: A child maps only the skill

- **WHEN** a child explicitly loads this skill without approval for omps, memory or todo
- **THEN** its instructions cannot enable those tools or bypass the guard
- **AND** unrelated ambient skills remain excluded

#### Scenario: Evaluation evidence is reported

- **WHEN** the skill's updated evaluation fixtures are checked
- **THEN** fleet and optional-capability cases cite real test evidence
- **AND** unrun model-driven trials are labelled unverified rather than reported as measured accuracy
