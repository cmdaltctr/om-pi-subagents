## MODIFIED Requirements

### Requirement: Provide native operator settings dialogs

`/omps-settings` SHALL be the canonical operator settings command, with `/subagents-settings` as an alias. Native dialogs SHALL expose depth, per-parent concurrency, visible roots, fleet view, fleet/inspection shortcuts and per-agent Memory/Todo switches. The menu SHALL show effective values, sources, selected YAML destination and reload needs. Opening settings SHALL start no process or model request and change no mapping. Registration MUST perform no file access.

#### Scenario: The operator opens settings

- **WHEN** `/omps-settings` is entered with supported UI dialogs
- **THEN** the menu shows current execution and UI values with their source and save destination
- **AND** an existing agent can be selected to inspect its Memory/Todo mapping states
- **AND** an edit requires confirmation

#### Scenario: The operator changes the fleet view

- **WHEN** the operator selects the fleet view item and confirms `collapsed`, `expanded` or `off`
- **THEN** `ui.fleetView` is saved to the selected YAML
- **AND** the current fleet repaints in that view without `/reload`

#### Scenario: The legacy command is used

- **WHEN** `/subagents-settings` is entered
- **THEN** it uses the same menu, validation and save destination as `/omps-settings`

#### Scenario: A dialog is cancelled

- **WHEN** an input is cancelled or save confirmation is declined
- **THEN** that setting and its file remain unchanged
- **AND** earlier confirmed edits remain in effect

#### Scenario: UI dialogs are unavailable

- **WHEN** either settings command is used without supported dialogs
- **THEN** an actionable error is shown before reading or writing settings

#### Scenario: Settings is requested through RPC

- **WHEN** an RPC client supports selection, input and confirmation
- **THEN** settings uses those native dialog requests rather than a custom terminal component

#### Scenario: Settings syntax is malformed

- **WHEN** either settings command receives extra arguments
- **THEN** usage guidance is shown before file access and no setting changes

### Requirement: Configure display and shortcuts in YAML

Version-one YAML SHALL accept optional `ui.maxVisibleAgents`, `ui.fleetView`, `ui.toggleKey` and `ui.inspectKey`. Defaults SHALL be five, `expanded`, `off` and `off` respectively. Visible roots MUST be safe integers from one to 256. The fleet view MUST be `expanded`, `collapsed` or `off`. Keys MUST be valid non-conflicting specifications or `off`. Unknown or invalid fields MUST identify their YAML path. YAML without `ui` SHALL remain valid. UI rendering MUST use cached values without file access.

#### Scenario: UI settings are omitted

- **WHEN** valid existing YAML has no `ui` mapping or legacy display value
- **THEN** the default settings apply and the fleet starts expanded while runs are active
- **AND** no view shortcut is registered
- **AND** rendering creates no settings file

#### Scenario: Explicit keys survive the default change

- **WHEN** YAML already sets `ui.toggleKey: alt+o` and `ui.inspectKey: alt+i`
- **THEN** those keys stay in effect after the upgrade

#### Scenario: A UI value is confirmed through settings

- **WHEN** an operator confirms a valid UI edit
- **THEN** the matching YAML field is saved
- **AND** editing that same field by hand produces the same effective value

#### Scenario: Invalid UI YAML is loaded

- **WHEN** a UI mapping has unknown fields or invalid values, such as `ui.fleetView: hidden`
- **THEN** an actionable diagnostic names the field
- **AND** new launches cannot proceed on an invalid registry
- **AND** retained run evidence remains inspectable

#### Scenario: Display and shortcut edits take effect

- **WHEN** a visible-root or fleet view value is saved
- **THEN** the fleet repaints immediately
- **WHEN** a shortcut is saved
- **THEN** settings distinguishes the saved binding from the active one and requests `/reload`
