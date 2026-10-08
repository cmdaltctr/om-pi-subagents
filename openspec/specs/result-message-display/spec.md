# result-message-display Specification

## Purpose

Define how the OMPS result message appears in the transcript so that a long answer can be folded and expanded without changing what the model receives.

## Requirements

### Requirement: Collapse long result messages

The OMPS result message SHALL render collapsed by default. A collapsed message SHALL show its heading line, its files line, any `Error:` line, any `PARTIAL OUTPUT` note, and the first lines of the result up to a fixed limit. When result lines are hidden, a hint SHALL state how many lines are hidden and name the host's current expansion key. An expanded message SHALL show the full text. The host's tool-output expansion action SHALL expand a message and OMPS MUST NOT replace it or edit host keybindings. OMPS SHALL also offer `ui.resultKey`, default `ctrl+shift+e` or `off`, which toggles one OMPS expansion state for every result message in the session. The host and OMPS expansion states SHALL remain independent. A result SHALL collapse only when both states are false. An active host expansion state SHALL also expand new results. When active, the hint SHALL name the OMPS key alongside the host key. `ui.resultKey` MUST follow the existing shortcut rules: valid specification, no duplicate OMPS key, and inactive with guidance when an effective Pi action owns it. The text sent to the model, the saved output and the delivery record MUST NOT change.

#### Scenario: A long result is collapsed

- **WHEN** a result message has more result lines than the collapsed limit
- **THEN** the transcript shows the heading, files line and first result lines
- **AND** a hint shows the hidden line count and the expansion key

#### Scenario: The operator expands the message

- **WHEN** the operator uses the host expansion action or `ui.resultKey`
- **THEN** the full message text appears
- **AND** using it again clears that key's expansion state
- **AND** the message collapses when both expansion states are false

#### Scenario: The result key toggles every message

- **WHEN** several result messages are in the transcript and the operator presses `ui.resultKey`
- **THEN** all of them expand together
- **AND** pressing it again clears the OMPS expansion state
- **AND** they collapse together when the host expansion state is also false
- **AND** unrelated tool output is unchanged

#### Scenario: The result key is turned off

- **WHEN** `ui.resultKey` is `off`
- **THEN** no OMPS shortcut is registered for results
- **AND** the host expansion action still works

#### Scenario: The result key is unavailable

- **WHEN** an effective Pi action owns the configured key
- **THEN** OMPS leaves the key inactive and explains why
- **AND** the hint names the host expansion key

#### Scenario: Extended-key support is unverified

- **WHEN** the terminal has no confirmed kitty support
- **THEN** OMPS permits Pi's supported extended-key sequences and explains that support is unverified when the result key requires extended reporting
- **AND** the hint keeps the host expansion key available
- **AND** legacy raw Ctrl+E retains its editor action

#### Scenario: A short result needs no fold

- **WHEN** the result fits within the collapsed limit
- **THEN** the full text shows with no hint

#### Scenario: A failed run is collapsed

- **WHEN** a failed run's message is collapsed
- **THEN** its `Error:` line and any `PARTIAL OUTPUT` note stay visible
- **AND** the hidden line count covers only result text

#### Scenario: The expansion key is remapped

- **WHEN** the operator remaps the host expansion action or `ui.resultKey`
- **THEN** the hint names the active key
- **AND** that key enables its expansion state without changing the other state

#### Scenario: The model reads the result

- **WHEN** a collapsed message is in the transcript
- **THEN** the model receives the same full message text as before
- **AND** the result file in the run folder is unchanged

#### Scenario: A message has an unexpected shape

- **WHEN** the message content is not text or lacks the expected heading
- **THEN** the renderer shows the content as plain text without collapsing
- **AND** it does not throw
