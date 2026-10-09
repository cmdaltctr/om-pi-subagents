# Spec Delta

## MODIFIED Requirements

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
