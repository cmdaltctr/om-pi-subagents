## ADDED Requirements

### Requirement: Navigate the fleet from an empty prompt

OMPS SHALL provide fleet navigation that needs no modifier key. Down SHALL enter fleet selection only when the editor owns focus, the draft is empty and the fleet shows run rows. In fleet selection, Up and Down SHALL move through every active root, Enter SHALL open inspection at the selected run, and Escape SHALL leave selection and return input to the editor. Outside fleet selection, OMPS MUST NOT consume Up, Escape or Enter. Navigation MUST NOT pause, cancel or restart runs.

#### Scenario: The operator enters the fleet

- **WHEN** the editor is focused and empty and the fleet shows run rows
- **AND** the operator presses Down
- **THEN** the first visible root becomes selected
- **AND** the editor draft stays empty

#### Scenario: The operator moves and inspects

- **WHEN** fleet selection is active
- **AND** the operator presses Down and then Enter
- **THEN** inspection opens at the second root
- **AND** no model request or process starts

#### Scenario: The operator leaves the fleet

- **WHEN** fleet selection is active and the operator presses Escape
- **THEN** selection mode ends and the editor receives later keys
- **AND** the fleet view and every run remain unchanged

#### Scenario: Up and Escape belong to Pi outside selection

- **WHEN** fleet selection is not active and the fleet shows run rows
- **AND** the operator presses Up or Escape in an empty editor
- **THEN** OMPS does not consume the key
- **AND** Pi applies its own history or interrupt behaviour

#### Scenario: The draft has text

- **WHEN** the editor draft is not empty
- **THEN** Down reaches the editor
- **AND** fleet selection does not start

#### Scenario: No fleet rows are shown

- **WHEN** the fleet view is `off`, the fleet is empty or the fleet is collapsed
- **THEN** Down reaches the editor
- **AND** fleet selection does not start

#### Scenario: A dialog owns input

- **WHEN** a selector, settings dialog or overlay has focus
- **THEN** navigation keys reach that component unchanged

## MODIFIED Requirements

### Requirement: Provide independent fleet and inspection shortcuts

The fleet toggle and inspection shortcuts SHALL both default to `off`. Operators SHALL be able to bind or disable either one through YAML/settings. Unsafe built-in conflicts, duplicate keys and Ctrl+I's Tab alias MUST be rejected with guidance. The conflict check SHALL ignore the order of modifiers, so `ctrl+shift+o` and `shift+ctrl+o` are one key. Shortcuts SHALL act only in their live owning terminal session and MUST NOT consume keys owned by another dialog. Shortcut edits SHALL state that reload is required. Guidance SHALL explain that macOS terminals need Option set to send Alt before Alt shortcuts work.

#### Scenario: The fleet key is used

- **WHEN** an operator has bound the fleet key and presses it while the editor owns input
- **THEN** the fleet changes between one-row and expanded views without changing run state

#### Scenario: The inspection key is used

- **WHEN** an operator has bound the inspection key and presses it with retained work
- **THEN** the current-session modal opens directly
- **AND** it starts no model request or process

#### Scenario: No keys are configured

- **WHEN** YAML has no `ui.toggleKey` or `ui.inspectKey`
- **THEN** OMPS registers no view shortcut
- **AND** empty-prompt navigation, `/omps fleet` and `/omps inspect` still provide view access

#### Scenario: Tab or an occupied native key is configured

- **WHEN** an operator chooses Ctrl+I, duplicate view keys or a key occupied by an effective built-in action
- **THEN** settings explains the conflict and refuses the edit
- **AND** existing input bindings remain unchanged

#### Scenario: A built-in key is written in another modifier order

- **WHEN** an operator chooses `ctrl+shift+o` and Pi binds `shift+ctrl+o` to a built-in action
- **THEN** OMPS reports the conflict
- **AND** it does not register the shortcut

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

`README.md` and the public setup, installation, usage and removal guides SHALL describe the implemented fleet/modal, the expanded default, `ui.fleetView`, empty-prompt navigation, opt-in shortcuts, the macOS Option-as-Alt setting, YAML/settings authority, migration and optional per-agent capabilities. Their examples SHALL match real extension behaviour and preserve private operator data. These guide updates SHALL ship in the same change as the supported behaviour.

#### Scenario: An operator follows the updated guides

- **WHEN** the documented fleet, inspection, settings and optional-capability examples are exercised
- **THEN** their commands and YAML produce the documented behaviour
- **AND** unsupported steering, queueing or automatic parent task completion is not promised

#### Scenario: Installation or removal is followed

- **WHEN** the public install or uninstall procedure is checked against the package
- **THEN** it correctly describes extension/skill discovery and operator-owned configuration
- **AND** it requires no manual copy of the bundled skill

#### Scenario: An operator upgrades with implicit Alt keys

- **WHEN** an operator relied on the old Alt+O and Alt+I defaults
- **THEN** the guides show the YAML lines that restore those keys
- **AND** they name the terminal setting that macOS needs for Alt keys
