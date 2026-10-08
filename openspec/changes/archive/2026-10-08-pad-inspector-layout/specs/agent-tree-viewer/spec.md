# Spec Delta

## MODIFIED Requirements

### Requirement: Present a themed readable inspector

The inspector SHALL use Pi's current theme, clear section headings and content inside a small margin on the left, right, top and bottom of both the picker and the details screen. Each margin SHALL shrink to zero when the terminal is too narrow or too short to spare it, and the margin rows MUST NOT hide the footer hint. Section headings SHALL have a blank line before and after them. Details SHALL distinguish task, current activity, provisional answer and saved output. Live-preview and saved-answer text SHALL retain readable Markdown structure. Preview sanitisation SHALL preserve line breaks and indentation within the existing 4 KiB UTF-8 bound while removing terminal controls and direction overrides. The picker SHALL identify the selected agent visibly. Long task summaries SHALL wrap within the available width, limited to three lines per summary, and a shortened summary SHALL end with an ellipsis. Picker warnings SHALL wrap fully without a separate line cap or ellipsis, within the available picker body. Long identifiers SHALL yield space to names and content. Missing or incomplete observations MUST remain labelled.

#### Scenario: A running agent is opened

- **WHEN** an operator opens a running agent
- **THEN** its name, state, elapsed time, known model, lineage and current observed tools are readable
- **AND** its visible answer appears under a provisional label without a second column

#### Scenario: Content keeps a margin

- **WHEN** the inspector renders at a normal terminal size
- **THEN** no content line starts at the first column or reaches the last column
- **AND** the first and last rows of the inspector are blank margin rows

#### Scenario: The terminal is very small

- **WHEN** the terminal is too narrow or too short to spare a margin
- **THEN** that margin is zero
- **AND** content still fits the width and height without overflow
- **AND** the footer hint stays visible at heights of at least two rows
- **AND** at height one the selected agent stays visible while the footer is omitted

#### Scenario: Section headings are spaced

- **WHEN** the details screen shows several sections
- **THEN** each heading has a blank line before it and a blank line after it
- **AND** the first heading has no blank line above it when it starts the body

#### Scenario: A long task summary appears in the picker

- **WHEN** an agent's task summary is longer than one line
- **THEN** it wraps onto continuation lines below the agent line
- **AND** it stops at the line cap and ends with an ellipsis when it is still longer

#### Scenario: A wrapped row is selected by mouse

- **WHEN** the operator clicks any wrapped line of an agent row
- **THEN** that agent is selected
- **AND** the row mapping stays aligned with the rendered lines

#### Scenario: The picker warning is long

- **WHEN** the tree observation warning is longer than the available width
- **THEN** it wraps instead of being cut off
- **AND** its warning colour and wording stay unchanged

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

### Requirement: Inspect agents without leaving the main session

One read-only modal SHALL inspect owned roots and validated observed descendants. It SHALL use one column at every width: an agent picker, then a single-column selected detail screen. Keyboard navigation SHALL work in fullscreen and regular modes; fullscreen row clicks SHALL open the clicked node's details. Picker branches SHALL fold/unfold without discarding retained nodes. Enter SHALL open details; Escape SHALL return to the picker or close it. Details opened by run id SHALL close directly on Escape. Opening, navigating, resizing or closing MUST NOT pause, cancel or restart runs. The editor draft and prior fleet view state SHALL survive closure.

#### Scenario: A fullscreen row is clicked

- **WHEN** the operator clicks an observed grandchild in the picker
- **THEN** its single-column details appear with the correct lineage
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
