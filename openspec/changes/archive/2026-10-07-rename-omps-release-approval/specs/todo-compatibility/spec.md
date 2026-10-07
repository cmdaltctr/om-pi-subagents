# Todo compatibility delta

## MODIFIED Requirements

### Requirement: Keep parent extension behaviour independent

Loading OMPS and `om-pi-todo` together SHALL preserve both tools, commands, shortcuts and distinct widget ownership. OMPS fleet/modal interaction, delivery, cancellation and settings MUST NOT mutate parent tasks, global todo preferences or OpenSpec bindings. Fleet collapse/expansion SHALL be independent of todo collapse and Pi's native tool expansion.

#### Scenario: Both extensions load in either order

- **WHEN** real OMPS and todo load in the parent in either order
- **THEN** `omps`, `todo`, `/omps` and `/todos` remain available
- **AND** their widgets coexist when supported
- **AND** their non-conflicting default shortcuts retain their separate actions

#### Scenario: A subagent finishes while a parent task is in progress

- **WHEN** a child finishes while a parent task is in progress
- **THEN** the parent's task stays unchanged until an explicit todo update
- **AND** result delivery leaves the todo widget intact

#### Scenario: A fleet or descendant modal is used

- **WHEN** the operator toggles the fleet, selects descendants, closes inspection or saves OMPS settings
- **THEN** parent todo state, its visible rows and OpenSpec checkboxes stay unchanged

#### Scenario: The native expansion key is used

- **WHEN** Ctrl+O performs Pi's native expansion with both extensions loaded
- **THEN** todo keeps its native expansion behaviour
- **AND** OMPS keeps its independent fleet state

### Requirement: Keep child todo opt-in and enableable later

New child mappings SHALL have no todo capability unless explicitly configured. `/omps-settings` SHALL enable or disable Todo per agent through confirmed edits to its existing resource and exact-tool lists. Off SHALL exclude the sibling entry and child todo bootstrap from future launches. Enabling SHALL retain empty child-local normal-mode lists. Existing complete mappings, admitted children and parent/OpenSpec task ownership MUST remain unchanged by opening settings.

#### Scenario: Default child todo is off

- **WHEN** a new agent has no todo extension or tool approval
- **THEN** its child loads no todo extension or bootstrap
- **AND** OMPS operates without om-pi-todo installed

#### Scenario: Todo is enabled after deployment

- **WHEN** the operator later confirms valid installed todo resources for one agent
- **THEN** its next child can use the real todo tool with an empty normal-mode list
- **AND** no new OMPS code change or task-store adapter is needed

#### Scenario: Todo is disabled while a child runs

- **WHEN** the operator confirms disabling Todo for that mapped agent
- **THEN** its admitted child keeps its existing tasks and reminder behaviour
- **AND** future children load neither that todo entry nor its bootstrap

#### Scenario: Parent OpenSpec mode is active

- **WHEN** child Todo is enabled or disabled through settings
- **THEN** the parent retains its linked tasks and revisions
- **AND** no parent checkbox or global todo preference changes

#### Scenario: An explicit todo mapping already exists

- **WHEN** an operator's existing mapping loads the real todo extension and approves todo
- **THEN** the capability remains configured without a new confirmation merely to open settings
- **AND** no migration silently removes its resources
