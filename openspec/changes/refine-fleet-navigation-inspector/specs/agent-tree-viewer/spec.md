## MODIFIED Requirements

### Requirement: Inspect agents without leaving the main session

One read-only modal SHALL inspect owned roots and validated observed descendants. It SHALL use one column at every width: an agent picker, then a full-width selected detail screen. Keyboard navigation SHALL work in fullscreen and regular modes; fullscreen row clicks SHALL open the clicked node's details. Picker branches SHALL fold/unfold without discarding retained nodes. Enter SHALL open details; Escape SHALL return to the picker or close it. Details opened by run id SHALL close directly on Escape. Opening, navigating, resizing or closing MUST NOT pause, cancel or restart runs. The editor draft and prior fleet view state SHALL survive closure.

#### Scenario: A fullscreen row is clicked

- **WHEN** the operator clicks an observed grandchild in the picker
- **THEN** its full-width details appear with the correct lineage
- **AND** its parent and siblings continue running

#### Scenario: Keyboard navigation is used

- **WHEN** the operator opens `/omps inspect` in either terminal mode
- **THEN** picker arrows select nodes, branch keys fold/unfold, and Enter opens selected details
- **AND** Escape returns from details to the picker and closes from the picker without cancelling work

#### Scenario: Inspection opens at a run id

- **WHEN** `/omps inspect <run-id>` or a management-list selection opens an owned run
- **THEN** that run's detail screen opens directly at every terminal width
- **AND** Escape closes the modal without an extra picker step

#### Scenario: The terminal uses regular mode

- **WHEN** application-owned mouse input is unavailable
- **THEN** all retained descendants remain keyboard-accessible
- **AND** the modal makes no working-click promise

#### Scenario: A selected child finishes

- **WHEN** the selected child becomes terminal while the modal is open
- **THEN** its status and available saved output update
- **AND** the modal remains open

#### Scenario: The terminal becomes narrow

- **WHEN** a resize reduces the available width
- **THEN** the same one-column screen reflows to that width
- **AND** selection remains attached to the same run identity
- **AND** no side-by-side pane appears when the terminal widens again

#### Scenario: A draft exists before inspection

- **WHEN** the operator closes the modal after typing a draft in Pi's editor
- **THEN** the draft and previous fleet expansion state are restored unchanged

#### Scenario: A windowed picker row is clicked

- **WHEN** fullscreen picker navigation has scrolled beyond the first retained nodes
- **AND** the operator clicks a visible row
- **THEN** details open for the node displayed on that row
- **AND** no off-screen node's evidence is substituted

### Requirement: Show selected details from saved evidence

Details SHALL show the submitted task, state, known model, elapsed time, active tool names, bounded provisional assistant preview and available saved output. Missing information MUST be labelled unavailable; failed or cancelled output MUST be partial. Saved reads MUST remain bounded and limited to validated files. Selection changes and session end MUST invalidate pending reads. A live preview MUST NOT be presented as a saved final answer or evidence of completion. Live observations SHALL remain visible while saved reads are loading or fail.

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

#### Scenario: Elapsed time changes while an agent runs

- **WHEN** an active agent stays selected without emitting another observation
- **THEN** its elapsed-time display advances while the inspector is open
- **AND** a terminal agent's duration remains frozen at its end time

### Requirement: Navigate the fleet from an empty prompt

OMPS SHALL provide configurable selection of the visible below-editor management list. Down/Up SHALL remain the omitted defaults for `ui.navigationDownKey` and `ui.navigationUpKey`. The effective Down action SHALL enter selection only with verified editor focus, an empty draft and visible rows. During selection, configured keys SHALL move between listed roots, Enter SHALL inspect and Escape SHALL return input. Hints SHALL show effective keys. Navigation MUST NOT change runs or consume keys from another component.

#### Scenario: The operator enters the fleet

- **WHEN** the editor is verified as focused and empty and the management list shows run rows
- **AND** the operator presses the effective navigation Down key
- **THEN** the first visible root gets the `●` marker
- **AND** the hint identifies the effective selection, inspection and return keys
- **AND** the editor draft stays empty

#### Scenario: The operator moves and inspects

- **WHEN** fleet selection is active
- **AND** the operator presses the configured navigation Down key and then Enter
- **THEN** inspection opens at the second root
- **AND** no model request or process starts

#### Scenario: The operator leaves the fleet

- **WHEN** fleet selection is active and the operator presses Escape
- **THEN** selection mode ends and the editor receives later keys
- **AND** the fleet view and every run remain unchanged

#### Scenario: Up and Escape belong to Pi outside selection

- **WHEN** fleet selection is not active and the list shows run rows
- **AND** the operator presses Up, the configured navigation Up key or Escape in an empty editor
- **THEN** OMPS does not consume the key
- **AND** Pi applies its own applicable action

#### Scenario: The draft has text

- **WHEN** the editor draft is not empty
- **THEN** navigation keys reach the editor
- **AND** fleet selection does not start

#### Scenario: No fleet rows are shown

- **WHEN** the fleet view is off or collapsed, the management list is hidden, or no list rows remain
- **THEN** all management-navigation keys reach Pi
- **AND** fleet selection does not start or remain active

#### Scenario: A dialog owns input

- **WHEN** Pi settings, a model selector or an extension dialog owns focus
- **AND** there is no overlay and the editor draft is empty
- **THEN** all navigation, submission and cancellation keys reach the focused component unchanged
- **AND** OMPS does not treat that component as the editor

#### Scenario: An overlay owns input

- **WHEN** an unrelated overlay has focus
- **THEN** management navigation leaves its keys untouched

#### Scenario: Editor focus cannot be verified

- **WHEN** the host cannot identify the actual focused editor through supported public interfaces
- **THEN** OMPS leaves management-navigation keys unconsumed
- **AND** `/omps inspect` remains available

#### Scenario: Modified arrows replace plain arrows

- **WHEN** the operator has successfully bound Ctrl+Shift+Down/Up after freeing conflicting Pi actions
- **THEN** those keys enter and move management selection
- **AND** plain Down/Up remain unconsumed by OMPS

#### Scenario: Key release follows a navigation press

- **WHEN** a terminal reports a press and release for one modified arrow tap
- **THEN** management selection moves once

### Requirement: Update public operator guidance

`README.md`, relevant public guides and the shipped operations skill SHALL describe independent management-list visibility, configurable navigation, conflict recovery and the one-column inspector. They SHALL retain accurate fleet defaults, linger rules, tintin credit, settings authority and optional-capability boundaries. Examples MUST match implementation and preserve private operator files.

#### Scenario: An operator follows the updated guides

- **WHEN** documented fleet, inspection, settings and optional-capability examples are exercised
- **THEN** their commands and YAML produce the documented behaviour
- **AND** unsupported steering, queueing or automatic parent task completion is not promised

#### Scenario: Installation or removal is followed

- **WHEN** public install or uninstall procedures are checked against the package
- **THEN** extension and skill discovery remain correctly described
- **AND** no manual skill copy or automatic operator-file edit is required

#### Scenario: An operator upgrades with implicit Alt keys

- **WHEN** an operator relied on the old Alt+O and Alt+I defaults
- **THEN** the guides retain the YAML lines that restore those keys
- **AND** they name the terminal setting that macOS needs for Alt keys

#### Scenario: An operator requests Ctrl+Shift+Down and Up

- **WHEN** effective Pi fullscreen message-navigation actions own those keys
- **THEN** guidance names `tui.altScreen.nextPrompt` and `tui.altScreen.previousPrompt`
- **AND** it gives a manual remapping example and the required reload step
- **AND** it explains that OMPS never rewrites Pi keybindings

## ADDED Requirements

### Requirement: Configure management-navigation keys safely

Settings SHALL expose `ui.navigationDownKey` and `ui.navigationUpKey` as Pi key specifications or `off`. They SHALL reject invalid, unsafe or duplicate OMPS keys. Modified keys occupied by effective Pi actions SHALL remain inactive with named conflict guidance. Default Down/Up SHALL keep their scoped editor-selection use. Saves SHALL retain registry safety checks and show that key changes require reload.

#### Scenario: Existing YAML omits navigation keys

- **WHEN** version-1 YAML omits both navigation fields
- **THEN** Down/Up retain their scoped management-list behaviour
- **AND** fleet-toggle and inspection shortcuts still default to off

#### Scenario: A safe custom key pair is saved

- **WHEN** an operator confirms distinct valid keys that effective Pi actions do not own
- **THEN** YAML stores the pair and settings shows the active pair and required reload
- **AND** reloading activates the saved pair and changes the displayed hints

#### Scenario: A requested modified arrow belongs to Pi

- **WHEN** Ctrl+Shift+Down or Up is configured while an effective Pi action still owns it
- **THEN** OMPS leaves that key inactive and names the conflicting action with recovery instructions
- **AND** no plain-arrow fallback silently replaces it

#### Scenario: A Pi key is freed

- **WHEN** the operator manually remaps the conflicting Pi actions and reloads
- **THEN** the requested modified arrows can become active
- **AND** unrelated Pi keys remain unchanged

#### Scenario: Management navigation is disabled

- **WHEN** the effective navigation Down key is off
- **THEN** editor keys cannot enter management selection
- **AND** the expanded tree and optional visible list remain available
- **AND** slash-command inspection continues to work

#### Scenario: A key duplicates another OMPS action

- **WHEN** a navigation key equals the other navigation key, fleet-toggle key or inspection key after modifier normalisation
- **THEN** validation identifies the conflicting fields
- **AND** existing confirmed settings remain unchanged

#### Scenario: An unsafe or invalid key is entered

- **WHEN** the operator enters Tab, Ctrl+I or an invalid key specification
- **THEN** settings refuses the value with actionable guidance
- **AND** no write or active-binding change occurs

### Requirement: Scroll selected details before saved evidence arrives

The detail screen SHALL provide Up/Down line scrolling, PageUp/PageDown paging and Home/End positioning for all displayed content. Fullscreen wheel input SHALL scroll the body. A visible position indicator SHALL report the viewport. Live updates SHALL preserve a reader's position; following the bottom SHALL continue only while the reader stays there. Agent changes SHALL use Left/Right, leaving arrows for scrolling.

#### Scenario: A live preview exceeds the viewport

- **WHEN** a selected running agent has long provisional text and no saved output
- **THEN** Down and PageDown reveal later preview lines
- **AND** scrolling requires neither a successful file read nor completion

#### Scenario: Saved details are delayed or unavailable

- **WHEN** a selected file read is pending or fails
- **THEN** displayed task summary, activity and preview remain scrollable
- **AND** the read state stays labelled loading or unavailable

#### Scenario: The reader changes scroll position

- **WHEN** the reader uses Up/Down, PageUp/PageDown or Home/End in details
- **THEN** the viewport moves within the same agent's content and the position indicator updates
- **AND** arrow scrolling does not select another agent

#### Scenario: The reader switches agents from details

- **WHEN** the reader uses Left or Right in details
- **THEN** the previous or next visible picker node becomes selected and its details open
- **AND** delayed reads from the previous node cannot replace the new content

#### Scenario: New content arrives while the reader looks back

- **WHEN** the reader has scrolled away from the bottom and live content changes
- **THEN** the viewport remains at the prior readable position, clamped only when content shrinks
- **AND** it does not jump to the start or bottom

#### Scenario: The reader follows the bottom

- **WHEN** the reader reaches the bottom and more content appears
- **THEN** the viewport follows the new bottom
- **AND** scrolling upwards stops following

#### Scenario: Fullscreen wheel input reaches the detail screen

- **WHEN** the reader scrolls the mouse wheel over the detail body in fullscreen mode
- **THEN** that same agent's viewport moves and redraws
- **AND** the picker and main transcript do not receive the wheel movement

#### Scenario: The viewport shrinks

- **WHEN** terminal width or height changes during reading
- **THEN** content reflows in one column and the viewport remains bounded
- **AND** the selected run stays unchanged and all content remains reachable

### Requirement: Present a themed readable inspector

The inspector SHALL use Pi's current theme, clear section headings and full-width content. Details SHALL distinguish task, current activity, provisional answer and saved output. Live-preview and saved-answer text SHALL retain readable Markdown structure. Preview sanitisation SHALL preserve line breaks and indentation within the existing 4 KiB UTF-8 bound while removing terminal controls and direction overrides. The picker SHALL identify the selected agent visibly. Long identifiers SHALL yield space to names and content. Missing or incomplete observations MUST remain labelled.

#### Scenario: A running agent is opened

- **WHEN** an operator opens a running agent
- **THEN** its name, state, elapsed time, known model, lineage and current observed tools are readable
- **AND** its visible answer appears under a provisional label without a second column

#### Scenario: A saved answer contains Markdown

- **WHEN** saved output includes headings, lists or code blocks
- **THEN** the detail body displays readable themed Markdown within the available width
- **AND** all bounded answer lines remain reachable by scrolling

#### Scenario: A live preview contains Markdown

- **WHEN** visible assistant text includes Markdown headings, lists or code blocks
- **THEN** publication and validation retain its line breaks and indentation within the 4 KiB preview limit
- **AND** the detail body renders the retained structure with a provisional label
- **AND** terminal controls, hidden thinking and raw tool results remain excluded

#### Scenario: The theme changes

- **WHEN** the operator changes between supported light and dark themes
- **THEN** inspector text, selection, separators and status use the active theme
- **AND** state remains identifiable through words or markers as well as colour

#### Scenario: Observations are incomplete

- **WHEN** selected-node or tree evidence is incomplete
- **THEN** the relevant warning remains visible in the one-column screen
- **AND** hidden picker rows are not presented as missing evidence

### Requirement: Record the refined fleet and inspector decision

A new decision record SHALL describe independent management-list visibility, scoped configurable keys and the single-column inspector. It SHALL remain Proposed until verification passes. Existing accepted decisions MUST remain intact except permitted supersession metadata. The decision index SHALL agree with the new record's status.

#### Scenario: The proposal awaits implementation

- **WHEN** the refinement has not passed implementation verification
- **THEN** the new record and its index entry remain Proposed

#### Scenario: Implementation is verified

- **WHEN** the implementation and required checks pass with resolved findings
- **THEN** the new record and index become Accepted
- **AND** any partial supersession identifies only the replaced presentation and input decisions
