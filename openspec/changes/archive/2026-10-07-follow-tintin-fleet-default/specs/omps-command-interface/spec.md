## MODIFIED Requirements

### Requirement: Preserve explicit commands and useful validation

Existing `list`, `run`, `status`, `cancel` and `inspect [run-id]` forms SHALL keep their meaning and ownership checks. The additive `fleet` form SHALL provide current-session fleet access without execution. Unknown or malformed subcommands SHALL show actionable usage guidance. Service failures SHALL remain error notifications. Bare `/omps` SHALL remain status rather than opening a view. The `list` output shown to the operator SHALL be compact: one line for each agent with its name, its approved tool count, `read-only` or `write-capable`, and its model and delegation capability when they apply. The `omps` tool SHALL keep every exact approved tool name in the text returned to the model, and SHALL show that full list to the operator only when the tool output is expanded.

#### Scenario: An explicit command is valid

- **WHEN** the operator enters a supported execution command with required arguments
- **THEN** it calls the same current-session operation as before

#### Scenario: The operator lists agents

- **WHEN** the operator enters `/omps list` and an agent has 24 approved tools without write tools
- **THEN** that agent appears on one line as `<name>: 24 tools (read-only)`
- **AND** no individual tool name is printed

#### Scenario: The model lists agents

- **WHEN** the model calls the `omps` tool with action `list`
- **THEN** the returned text names every approved tool for every agent
- **AND** the collapsed tool output shows the compact one-line form
- **AND** expanding the tool output with the host expansion action shows the full list

#### Scenario: A subcommand is incomplete or unknown

- **WHEN** a command is unknown or lacks required arguments
- **THEN** usage guidance is shown at warning level and no child starts

#### Scenario: A valid command reaches a service error

- **WHEN** a requested operation fails in the service
- **THEN** the parent receives its actionable error notification

#### Scenario: Inspection syntax is malformed

- **WHEN** inspect receives extra arguments or an invalid run id
- **THEN** usage guidance includes `inspect [run-id]` before any file read or launch

#### Scenario: Fleet is used in interactive Pi

- **WHEN** the operator enters `/omps fleet`
- **THEN** the current fleet toggles between expanded and collapsed without starting a model request or process
- **AND** an empty session receives a clear empty-state message

#### Scenario: Fleet is used through RPC

- **WHEN** `/omps fleet` is requested by an RPC client
- **THEN** it receives bounded plain current-session summary text
- **AND** no custom terminal widget or modal is attempted

#### Scenario: Fleet syntax is malformed

- **WHEN** `fleet` receives extra arguments
- **THEN** usage guidance is shown before file access or execution

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
- **THEN** the default settings apply and the tree shows expanded above the editor while runs are active
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
