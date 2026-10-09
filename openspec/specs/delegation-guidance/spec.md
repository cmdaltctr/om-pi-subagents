# delegation-guidance Specification

## Purpose

Give Pi's model short instructions for proactive use of mapped subagents from the first request, while keeping task selection and execution within existing user permissions and limits.

## Requirements

### Requirement: Supply delegation guidance automatically

OMPS SHALL supply concise delegation instructions in Pi's default system prompt whenever the `omps` tool is active and its guidance is included by the host. These instructions MUST be available from the first model request without loading the operational skill or receiving a user reminder. They MUST remain available on subsequent requests under the same conditions.

#### Scenario: A fresh session receives an ordinary task

- **WHEN** OMPS is loaded with an active model-visible `omps` tool and Pi's default system prompt
- **AND** the user submits a task without mentioning subagents or invoking the OMPS skill
- **THEN** the first model request includes the delegation instructions
- **AND** their presence does not depend on personal context files, mapped agent names or a prior tool call

#### Scenario: The session continues

- **WHEN** the model receives another request while the same prompt and tool conditions hold
- **THEN** the delegation instructions remain available without another user reminder

#### Scenario: The tool is inactive

- **WHEN** the host deactivates `omps` and builds its default prompt without that tool's guidance
- **THEN** OMPS does not independently add delegation instructions or reactivate the tool

#### Scenario: The host uses a replacement prompt

- **WHEN** an operator or another extension replaces Pi's default prompt or omits tool guidance
- **THEN** OMPS does not override that choice to force its instructions into the prompt
- **AND** public guidance identifies this host-controlled limitation

### Requirement: Guide task-aware proactive delegation

The instructions SHALL direct the model to discover mapped agents before substantial tasks with separable work and proactively delegate suitable bounded investigation. They MUST direct the model to delegate review, audit or security work only when the user asks for it. They MUST direct the model to keep simple tasks local and honour explicit user restrictions on delegation. They MUST NOT require a launch for every request or a fixed number of subagents.

#### Scenario: Useful independent work exists

- **WHEN** a substantial task has a self-contained investigation that a mapped agent can perform
- **THEN** the instructions direct the model to discover available agents and delegate that work without a user reminder
- **AND** they direct it to provide a clear task and expected result

#### Scenario: Review work has not been requested

- **WHEN** a task could use a review, audit or security scan and the user has not asked for one
- **THEN** the instructions direct the model not to delegate that work
- **AND** they do not stop the model from suggesting it to the user

#### Scenario: The user asks for a review

- **WHEN** the user asks for a review, audit or security scan
- **THEN** the instructions allow the model to delegate it to a suitable mapped agent

#### Scenario: The task is simple

- **WHEN** the request can be answered directly without useful separable work
- **THEN** the instructions direct the model to keep the task local
- **AND** they impose no agent-discovery or launch requirement for that request

#### Scenario: The user requests local work only

- **WHEN** the user explicitly asks the model to avoid subagents
- **THEN** the instructions direct the model to honour that restriction

### Requirement: Preserve discovery and launch boundaries

The instructions SHALL require selection from fresh `omps list` output, a suitable target's approved tools, and current-session status before adding runs. They MUST require safe working folders and respect configured concurrency, inherited depth ceilings and cleanup blocking. They MUST NOT authorise invented mappings, permission expansion, settings edits or a retry loop around a refused launch.

#### Scenario: A mapped target is suitable

- **WHEN** discovery identifies a target with tools suitable for the bounded task
- **THEN** the instructions direct the model to check current-session runs and launch through `omps` using a verified working folder
- **AND** write-capable parallel work must avoid shared-file conflicts

#### Scenario: Discovery cannot supply a suitable target

- **WHEN** the mapping is empty, registry validation fails or no mapped agent has suitable tools
- **THEN** the instructions direct the model to report the constraint and continue permitted local work where possible
- **AND** they do not authorise creating a persona, changing YAML or granting tools without permission

#### Scenario: Launch is refused

- **WHEN** concurrency, effective depth or unconfirmed cleanup prevents a launch
- **THEN** the instructions direct the model to honour the refusal and use the existing waiting or recovery guidance
- **AND** they do not authorise repeated launch attempts or raising limits without permission

#### Scenario: A child has no delegation approval

- **WHEN** a mapped child's tools omit exact `omps` approval
- **THEN** the new guidance grants no delegation tool and causes no ambient OMPS resource to load in that child

### Requirement: Guide assessment of delivered results

The instructions SHALL tell the parent to await separately delivered results before relying on them, assess findings against the task and available evidence, and preserve failed or partial-result labels. They MUST keep responsibility for the final answer and any parent task update with the parent. Independent parent work can continue while a child runs.

#### Scenario: A launch returns its acknowledgement

- **WHEN** the model receives a run id before the child finishes
- **THEN** the instructions identify the acknowledgement as distinct from the result
- **AND** they direct the parent to await the separate result before claiming findings from that run

#### Scenario: A result arrives

- **WHEN** the parent receives a completed, failed or partial result
- **THEN** the instructions direct the parent to assess it and report its actual status
- **AND** child completion alone does not authorise marking a parent OpenSpec task complete

### Requirement: Keep guidance passive and portable

Supplying the instructions SHALL start no process or model request and add no file access during extension registration. It MUST preserve lazy runtime creation, exact tool approvals, existing actions and operator-owned configuration. The instructions MUST use portable tool names and contain no shipped persona, model or personal path.

#### Scenario: OMPS registers with no usable registry

- **WHEN** the extension registers while the registry is missing or malformed
- **THEN** its static guidance is registered without reading that registry or starting execution
- **AND** listing and launch validation keep their existing behaviour on first use

#### Scenario: The session starts

- **WHEN** Pi starts a session with OMPS loaded
- **THEN** the new guidance starts no child, scheduler or additional model request
- **AND** existing session-start interface behaviour remains unchanged

### Requirement: Explain automatic guidance consistently

README, the usage guide and the shipped operational skill SHALL describe proactive task selection consistently. They MUST distinguish automatically available instructions from model-chosen launches, explain the host prompt limitation, and state that guidance does not guarantee model compliance. Detailed skill loading MUST remain optional for the short built-in rules and grant no tools.

#### Scenario: The operator reads the usage guide

- **WHEN** the operator checks how automatic use works
- **THEN** the guide explains discovery, suitable tasks, simple-task exclusions, explicit user control and prompt limitations
- **AND** it makes no claim of guaranteed delegation or automatic startup execution

#### Scenario: The model loads the operational skill

- **WHEN** the model reads the packaged OMPS skill
- **THEN** its routing description and instructions support the same proactive delegation policy
- **AND** all existing discovery, permissions, result and cleanup guidance remains available
