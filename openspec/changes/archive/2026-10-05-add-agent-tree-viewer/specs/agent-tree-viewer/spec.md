# Agent tree viewer

## Purpose

Let operators expand an OMPSS run tree and inspect an agent's work from the main conversation using keyboard or supported mouse input.

## ADDED Requirements

### Requirement: Render a current-session hierarchy

The interactive transcript SHALL provide live tree cards for current-session direct runs, with observed descendants indented beneath their immediate parents. Each node SHALL show its agent, run identity and current state. Both tool-launched and command-launched runs MUST be represented. The existing compact widget and status indicator SHALL retain their specified behaviour.

#### Scenario: Parallel roots and nested children coexist

- **WHEN** two direct runs are active and one has a grandchild
- **THEN** each direct run has a separate tree root
- **AND** the grandchild appears beneath the correct parent in the expanded view

#### Scenario: A run starts through the slash command

- **WHEN** an operator starts a run with `/ompss run`
- **THEN** it receives the same tree presentation as a tool-launched run
- **AND** no synthetic user prompt or model-visible progress message is needed

#### Scenario: A short run completes before its card is drawn

- **WHEN** a run ends before initial UI rendering
- **THEN** its card shows the retained terminal state without recreating active work

### Requirement: Honour the host expansion action

Tree cards SHALL use the host's tool-output expansion action, whose default shortcut is Ctrl+O. The collapsed view SHALL remain compact; expansion SHALL reveal observed child branches and bounded activity. Shortcut hints MUST follow configured bindings. OMPSS MUST NOT replace the host action or change unrelated tool expansion behaviour.

#### Scenario: The operator presses Ctrl+O

- **WHEN** the default tool expansion shortcut is pressed with a tree card present
- **THEN** the card changes between collapsed and expanded views
- **AND** observed descendants are visible in the expanded tree

#### Scenario: The expansion key is remapped

- **WHEN** the operator assigns another key to tool-output expansion
- **THEN** that key controls the tree's expansion
- **AND** its hint shows the active binding

#### Scenario: Other tool output shares the transcript

- **WHEN** OMPSS cards coexist with unrelated tool calls
- **THEN** the host expansion action keeps its existing behaviour for those calls

### Requirement: Inspect agents without leaving the main session

An interactive detail viewer SHALL open for an owned root or validated observed descendant. Clicking an agent row in fullscreen mode SHALL open its details. Keyboard access SHALL work in fullscreen and regular modes, with arrow-key selection, Enter to inspect and Escape to close. Opening or closing the viewer MUST NOT pause, cancel or restart runs.

#### Scenario: A fullscreen row is clicked

- **WHEN** the operator clicks an observed grandchild in an expanded tree
- **THEN** a modal shows that grandchild's details over the main conversation
- **AND** the parent and its other children continue running

#### Scenario: Keyboard navigation is used

- **WHEN** the operator opens `/ompss inspect` in either interactive mode
- **THEN** arrow keys select an agent and Enter opens its details
- **AND** Escape returns to the main session without cancelling work

#### Scenario: The terminal uses regular mode

- **WHEN** the viewer is used without application-owned mouse input
- **THEN** keyboard inspection remains available
- **AND** the UI does not promise a working mouse action

### Requirement: Show selected details from saved evidence

Details SHALL show the selected run's task, state, model when known, active tool names and available saved output. Missing information MUST be labelled unavailable. Failed output MUST be labelled partial. Reads MUST be bounded and limited to validated files of an owned or observed run. Selecting another node or ending the session MUST invalidate pending reads.

#### Scenario: A completed descendant is inspected

- **WHEN** its final output exists
- **THEN** the viewer shows that run's saved output and correct lineage
- **AND** the operator can scroll the bounded detail view

#### Scenario: A run is still active or its output cannot be read

- **WHEN** final output does not exist or a saved file is unavailable
- **THEN** the viewer shows the known state and labels output unavailable
- **AND** it does not invent or borrow a sibling's answer

#### Scenario: Output arrives after selection changes

- **WHEN** a delayed read finishes after the operator selects another run
- **THEN** it does not replace the newly selected run's details

#### Scenario: The requested run or file path is untrusted

- **WHEN** a supplied identity is foreign, invalid or resolves outside the allowed run directory
- **THEN** inspection is rejected before reading the file

### Requirement: Configure visible agents without limiting their work

`/subagents-settings` SHALL expose a persisted `maxVisibleAgents` display preference, with default four and valid safe integers from one to 256. The compact widget SHALL apply it to direct-run summaries; each expanded tree card SHALL apply it to node rows, including the card's root. Retained hidden agents MUST remain available through the scrollable inspector. Hidden counts SHALL be accurate and distinct from incomplete observations. Applying the preference MUST NOT discard observation state, change execution limits, cancel runs or affect result delivery.

#### Scenario: The widget exceeds the visible-agent preference

- **WHEN** six direct children are active and the saved visible-agent limit is two
- **THEN** the widget shows two direct-run summaries and reports four additional active runs
- **AND** its status count and run controls still include all six children

#### Scenario: An expanded tree hides descendants

- **WHEN** a tree card contains more retained nodes than its visible-agent limit
- **THEN** it shows bounded rows with parents before their children and identifies the hidden count
- **AND** hidden retained descendants remain selectable through `/ompss inspect`

#### Scenario: The visible-agent preference changes during work

- **WHEN** a valid display change is saved successfully
- **THEN** the current widget and cards repaint from the retained observation state
- **AND** active work and pending result delivery continue unchanged

#### Scenario: The observation safety bound is exceeded

- **WHEN** some descendant observations cannot be retained within the fixed safety bound
- **THEN** the viewer labels that missing evidence separately from retained hidden rows
- **AND** increasing the visible-agent preference does not remove the safety bound

### Requirement: Persist display preferences independently

The visible-agent preference SHALL be saved in `<config-dir>/pi-subagents/config.json`, using absolute `XDG_CONFIG_HOME` when set and otherwise `~/.config`, following todo's preference pattern. Execution limits SHALL remain in registry YAML. Preference loading MUST be asynchronous and lazy; rendering MUST read only the cache. Successful local saves SHALL update the cache and repaint. Reopening settings SHALL refresh saved preferences from disk.

#### Scenario: No display file exists

- **WHEN** the viewer first needs display preferences and the file is absent
- **THEN** it uses four visible agents
- **AND** it does not create a file merely to render

#### Scenario: A valid preference is saved and loaded again

- **WHEN** the operator confirms a valid visible-agent value and later starts another session
- **THEN** that session loads the saved value from the OMPSS display config
- **AND** unrelated JSON keys and todo's separate preferences are preserved

#### Scenario: Another session updates display preferences

- **WHEN** the operator reopens settings after another session saved a display preference
- **THEN** settings refreshes the displayed value from disk
- **AND** later local rendering uses the refreshed preference

#### Scenario: Display preferences are malformed or invalid

- **WHEN** the display file is malformed or its visible-agent value is invalid
- **THEN** rendering uses the default and reports a diagnostic
- **AND** settings requires the file to be corrected before saving over it

#### Scenario: Rendering requests display preferences

- **WHEN** a widget or tree card renders
- **THEN** it reads the cached preference without filesystem access
- **AND** registration has performed no preference read or write

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

RPC inspection SHALL provide bounded plain text through supported output instead of attempting a terminal modal. JSON and print runs SHALL remain unaffected by terminal-only rendering. The OMPSS viewer MUST NOT replace the todo widget, copy parent tasks, change OpenSpec bindings or complete a parent todo from a child result.

#### Scenario: An RPC client requests inspection

- **WHEN** `/ompss inspect` is handled outside the terminal UI
- **THEN** the client receives bounded current-session tree or detail text
- **AND** no custom terminal component is attempted

#### Scenario: Todo uses normal or OpenSpec mode

- **WHEN** real `om-pi-todo` and OMPSS load in either order
- **THEN** both widgets and their task ownership remain independent
- **AND** opening, expanding and closing the viewer leave todo preferences and linked checkboxes unchanged
