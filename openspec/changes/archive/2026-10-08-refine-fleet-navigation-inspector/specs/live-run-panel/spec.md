## MODIFIED Requirements

### Requirement: Show run progress in the owning parent

The system SHALL show run progress in session-wide widgets when the owning parent supports widgets. A tree widget adapted from `tintinweb/pi-subagents` SHALL appear above the editor. An optional management list SHALL appear below the editor. Their starting view SHALL follow registry `ui.fleetView`: `expanded` (the default) shows the full tree and, when `ui.showManagementList` is true, the list; `collapsed` shows only the tree heading; `off` shows neither widget. Omitted `ui.showManagementList` SHALL default to true. The tree SHALL show a `● Agents` heading while runs are active and a dim `○ Agents` heading otherwise. Each running agent SHALL use two tree lines: a spinner, the agent name, the task summary, the tool-use count and the elapsed time, then an activity line. Each finished agent SHALL use one line with its outcome icon and duration. Tree lines SHALL use `├─` connectors, with `└─` on the last item. Every active root SHALL remain reachable through the visible list or `/omps inspect` when the list is hidden. Display bounds MUST NOT limit launches, trigger model requests or create child terminals.

#### Scenario: A background run starts

- **WHEN** the parent starts a valid run with the default fleet view
- **THEN** the tree above the editor shows a spinner line for that agent and an activity line
- **AND** no key press is needed to see the run

#### Scenario: Several background runs start

- **WHEN** one parent starts four valid direct runs with default UI settings
- **THEN** the tree shows two lines for each run, with `├─` connectors and `└─` on the last run
- **AND** the management list below the editor shows a row for each run

#### Scenario: The operator hides the management list

- **WHEN** `ui.fleetView` is `expanded` and `ui.showManagementList` is false
- **THEN** the expanded above-editor tree keeps its agent rows and activity lines
- **AND** the below-editor hint and management rows are absent
- **AND** every retained agent remains reachable through `/omps inspect`

#### Scenario: The operator prefers the collapsed view

- **WHEN** `ui.fleetView` is `collapsed` and four direct runs are active
- **THEN** the tree shows only its heading with the active count
- **AND** no list is shown
- **AND** a bound toggle key or `/omps fleet` expands it for this session, respecting `ui.showManagementList`

#### Scenario: The operator turns the fleet off

- **WHEN** `ui.fleetView` is `off`
- **THEN** neither widget is displayed while runs are active
- **AND** `/omps`, `/omps status` and `/omps inspect` still report every run

#### Scenario: More runs exist than the panel can show

- **WHEN** active roots exceed the visible-agent bound and the management list is shown
- **THEN** list rows are windowed with `↑ N more` or `↓ N more` markers
- **AND** moving selection reaches roots outside the initial window
- **AND** hidden runs continue normally

#### Scenario: The parent has no UI

- **WHEN** the parent runs without UI support
- **THEN** runs proceed without attempting terminal widget calls

#### Scenario: The terminal is small

- **WHEN** the tree and visible management list are rendered in a terminal under 80 columns
- **THEN** every line is truncated to the terminal width
- **AND** no line wraps

#### Scenario: The fleet has no retained runs

- **WHEN** the current session has no run evidence
- **THEN** no fleet widget is displayed
- **AND** opening inspection reports the empty session without starting work

## ADDED Requirements

### Requirement: Configure management-list visibility independently

`/omps-settings` and its alias SHALL expose **Management list: Show/Hide**, stored as boolean `ui.showManagementList` in operator YAML. Confirmed saves SHALL repaint immediately. Hiding the list SHALL end selection and stop its input capture. It MUST NOT change the tree view, run state, delivery, sibling widgets or Pi settings. Invalid values SHALL name the field and block configuration refresh.

#### Scenario: The list is hidden during selection

- **WHEN** the operator confirms Hide while a management row is selected
- **THEN** the hint and all list rows disappear immediately
- **AND** selection ends and later navigation keys reach Pi
- **AND** the expanded tree and running agents remain unchanged

#### Scenario: The operator shows the list again

- **WHEN** the operator confirms Show while the fleet is expanded
- **THEN** the list returns using retained run evidence and the effective configured key hints
- **AND** no run is restarted

#### Scenario: A session toggle expands the tree with the list hidden

- **WHEN** `ui.showManagementList` is false and `/omps fleet` expands the tree
- **THEN** the tree expands without showing the list or capturing list navigation keys
- **AND** the saved list preference stays false

#### Scenario: A save is cancelled or fails

- **WHEN** the visibility confirmation is declined, the file changed externally, or the write fails
- **THEN** the current confirmed display and registry remain unchanged
- **AND** a conflict or write failure provides recovery instructions

#### Scenario: Existing YAML has no list preference

- **WHEN** an existing version-1 registry omits `ui.showManagementList`
- **THEN** its expanded view continues to show both widgets

#### Scenario: The list preference has the wrong type

- **WHEN** `ui.showManagementList` is a string, number or collection
- **THEN** validation names `ui.showManagementList` and requires a boolean
- **AND** old settings are not silently used for a launch
