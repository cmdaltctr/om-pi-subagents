# Agent tree viewer delta

## MODIFIED Requirements

### Requirement: Render a current-session hierarchy

The system SHALL represent tool-launched and command-launched runs in one current-session fleet and a retained descendant modal. Each modal node SHALL show its agent, run identity and authoritative or observed state beneath its immediate parent. Per-launch transcript entries SHALL remain compact acknowledgements rather than separate live trees. Historical `omps-tree` entries MUST retain bounded rendering without recreating active work. Old `ompss-tree` entries SHALL have no extension compatibility renderer. The status count SHALL remain complete for direct active runs.

#### Scenario: Parallel roots and nested children coexist

- **WHEN** two direct runs are active and one has a grandchild
- **THEN** both roots appear in the session modal
- **AND** the grandchild appears beneath its actual immediate parent

#### Scenario: A run starts through the slash command

- **WHEN** an operator starts a run with `/omps run`
- **THEN** it receives a compact transcript acknowledgement and the same fleet/modal representation as a tool launch
- **AND** no synthetic user prompt or model-visible progress message is needed

#### Scenario: A short run completes before its card is drawn

- **WHEN** a run ends before its first UI render
- **THEN** retained evidence shows its terminal state in inspection without recreating active work

#### Scenario: An older session contains tree entries

- **WHEN** a historical `omps-tree` entry is rendered
- **THEN** it stays bounded and labels unavailable evidence
- **AND** it creates no live tree, process or model request

#### Scenario: An old-acronym tree entry exists

- **WHEN** a session file contains `ompss-tree`
- **THEN** no extension renderer is registered under that identifier
- **AND** the session file is neither rewritten nor used to restart work

### Requirement: Configure visible agents without limiting their work

`/omps-settings` SHALL expose registry `ui.maxVisibleAgents`, default five and safe integers from one to 256. It SHALL bound expanded fleet roots; the modal SHALL independently scroll all retained nodes within terminal space. Hidden counts MUST differ from incomplete observations. Applying the value MUST NOT discard evidence, change execution limits, cancel runs or affect delivery. The generic command alias SHALL use the same settings.

#### Scenario: The widget exceeds the visible-agent preference

- **WHEN** six direct children are active and the saved visible-agent limit is two
- **THEN** expanded fleet content shows at most two root rows with accurate additional-row information
- **AND** scrolling, status and run controls still reach all six roots

#### Scenario: An expanded tree hides descendants

- **WHEN** a modal branch is folded or some rows are outside its viewport
- **THEN** every retained descendant remains available through unfolding and scrolling
- **AND** no descendant observation is discarded

#### Scenario: The visible-agent preference changes during work

- **WHEN** a valid display change is saved successfully
- **THEN** the current fleet repaints from retained evidence
- **AND** work and result delivery continue unchanged

#### Scenario: The observation safety bound is exceeded

- **WHEN** descendant observations cannot fit the fixed retention bound
- **THEN** the modal labels missing evidence separately from retained hidden rows
- **AND** a larger visible-agent preference does not remove the retention bound

### Requirement: Ship the updated operational skill

The package SHALL ship the revised `skills/om-pi-subagents/SKILL.md` through `files` and `pi.skills`. A normal installation with skills enabled SHALL discover `/skill:om-pi-subagents`. Instructions SHALL cover the fleet/modal, settings, default-off capabilities and ownership boundaries, with portable references inside the package. Skill loading MUST NOT grant tools or load ambient child resources.

#### Scenario: The packed extension is installed

- **WHEN** a disposable normal package installation enables its skill resources
- **THEN** `/skill:om-pi-subagents` is available with the revised instructions
- **AND** its relative public-guide links resolve within that installation

#### Scenario: Skill command expansion is checked

- **WHEN** the installed skill command is invoked using the fake-model fixture
- **THEN** its revised fleet/settings guidance reaches the model
- **AND** no manually copied skill is needed

#### Scenario: A child maps only the skill

- **WHEN** a child explicitly loads this skill without approval for omps, memory or todo
- **THEN** its instructions cannot enable those tools or bypass the guard
- **AND** unrelated ambient skills remain excluded

#### Scenario: Evaluation evidence is reported

- **WHEN** the skill's updated evaluation fixtures are checked
- **THEN** fleet and optional-capability cases cite real test evidence
- **AND** unrun model-driven trials are labelled unverified rather than reported as measured accuracy
