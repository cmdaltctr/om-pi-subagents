# Spec Delta

## ADDED Requirements

### Requirement: Result panel uses the host theme

Interactive OMPS results SHALL use the host's custom-message background in collapsed and expanded views. The panel SHALL respect host output padding and terminal width. Colours SHALL follow the active theme; Pi's dark theme gives a purple background. Styling MUST leave stored and model-facing content unchanged.

#### Scenario: A result is displayed

- **WHEN** interactive Pi displays a collapsed, expanded or short OMPS result
- **THEN** the entire result appears on the custom-message background
- **AND** the panel respects the host's horizontal output padding

#### Scenario: The panel wraps on a narrow terminal

- **WHEN** a result wraps onto several terminal rows
- **THEN** every panel row retains the background
- **AND** no rendered row exceeds the available width

#### Scenario: The theme changes

- **WHEN** Pi changes its active theme and redraws a retained result
- **THEN** the panel uses the current custom-message background

### Requirement: Fold hint uses the warning colour

The entire hidden-line count and expansion hint SHALL use the active theme's warning foreground colour. Pi's dark theme gives a yellow hint. Styling MUST preserve hint wording and active keys. A hint SHALL remain absent for short or expanded results. Result body text MUST NOT inherit the hint's warning colour.

#### Scenario: A collapsed result has hidden lines

- **WHEN** OMPS folds a long result
- **THEN** the hidden-line count and both available expansion keys use the warning colour
- **AND** the preceding result text keeps its normal foreground

#### Scenario: The hint wraps

- **WHEN** the fold hint wraps onto several terminal rows
- **THEN** each part of the hint retains the warning colour and panel background

#### Scenario: No result lines are hidden

- **WHEN** a result is short or either expansion state is enabled
- **THEN** no fold hint appears

#### Scenario: The theme changes while the result is folded

- **WHEN** Pi changes its active theme and redraws a collapsed result
- **THEN** the hint uses the current warning colour

#### Scenario: Non-interactive delivery

- **WHEN** the model, saved output or a non-interactive client receives a result
- **THEN** display styling adds no colour escape codes to the delivered content
