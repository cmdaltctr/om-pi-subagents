# Spec Delta

## ADDED Requirements

### Requirement: Accept forgiving typed shortcut input in settings

The `/omps-settings` shortcut prompts SHALL tell the operator to type the key as text, with an example such as `ctrl+1`, and not to press the keys. The prompt SHALL name the common modifiers `ctrl`, `shift` and `alt`. Before validation, settings SHALL convert the typed text to a canonical key specification: lowercase, no spaces around `+`, `ctr`, `ctl` and `control` as `ctrl`, `opt` and `option` as `alt`, and `cmd`, `command` and `win` as `super`. The converted key MUST pass the existing unsafe-key and duplicate checks. Before confirmation or saving, settings MUST check conflicts against effective Pi bindings using the same policy and guidance as shortcut registration. The existing direction-specific exceptions for default Up/Down navigation MUST remain available. The confirmation SHALL show the converted key and, when it differs, the typed text. The saved value SHALL be the converted key. The YAML loader MUST NOT accept these aliases.

#### Scenario: A modifier is spelled loosely

- **WHEN** the operator types `Control + 1` for a shortcut
- **THEN** settings proposes `ctrl+1`
- **AND** the confirmation shows both the typed text and `ctrl+1`

#### Scenario: A canonical key is typed

- **WHEN** the operator types `ctrl+shift+i`
- **THEN** settings proposes it unchanged
- **AND** the confirmation does not show a conversion

#### Scenario: The prompt explains typing

- **WHEN** a shortcut prompt opens
- **THEN** it says to type the key as text and gives `ctrl+1` as an example
- **AND** it names `ctrl`, `shift` and `alt` as common modifiers

#### Scenario: A converted key is unsafe or conflicts

- **WHEN** the converted key is `tab`, `ctrl+i`, a duplicate OMPS key or a key owned by an effective Pi action outside the permitted default navigation overlaps
- **THEN** settings rejects it with the existing guidance before showing a save confirmation
- **AND** nothing is saved

#### Scenario: Default navigation uses permitted Pi overlaps

- **WHEN** the operator types `Down` for `navigationDownKey` or `Up` for `navigationUpKey`
- **AND** effective Pi owners are limited to the existing direction-specific cursor, history and selection actions
- **THEN** settings allows confirmation and saves `down` or `up`
- **AND** shortcut registration accepts the same permitted overlaps

#### Scenario: Another Pi action owns a default navigation key

- **WHEN** an effective Pi action outside the permitted direction-specific overlaps owns `down` or `up`
- **AND** the operator assigns that key to its default navigation field
- **THEN** settings rejects the edit before confirmation and leaves the registry unchanged
- **AND** shortcut registration refuses the key with the same owner-specific guidance

#### Scenario: Remapping a Pi action frees a key

- **WHEN** a Pi action has been remapped away from the converted key
- **AND** no effective Pi action owns that key
- **AND** the key passes the unsafe-key and duplicate checks
- **THEN** settings permits confirmation and saving
- **AND** shortcut registration permits the key under those effective bindings

#### Scenario: An unknown word is typed

- **WHEN** the operator types a modifier that is not a known spelling, such as `hyper+1`
- **THEN** settings rejects it with the existing key error
- **AND** the error lists the accepted modifiers

#### Scenario: YAML uses an alias

- **WHEN** the registry YAML sets `ui.toggleKey: control+1`
- **THEN** the loader rejects it with the existing lowercase key error
- **AND** the settings input remains the only place that converts aliases
