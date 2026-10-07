## MODIFIED Requirements

### Requirement: Read operator-defined limits

The system SHALL accept optional `limits.maxConcurrentRuns` and `limits.maxDepth` in version `1` of the registry, `<agent-dir>/omps/config.yaml` by default.
`maxConcurrentRuns` MUST be a safe integer of at least `1`. `maxDepth` MUST be a safe integer of at least `0`.
Omitted fields SHALL default to `1`. The system MUST NOT impose a separate fixed child-count or depth ceiling.
Invalid values and unknown limit fields MUST identify the YAML field and block launches.

#### Scenario: Existing YAML omits limits

- **WHEN** a valid mapping has no `limits` section
- **THEN** each parent can start one direct child and the maximum depth is `1`

#### Scenario: Operator chooses capacity and depth

- **WHEN** the mapping sets `maxConcurrentRuns: 4` and `maxDepth: 3`
- **THEN** each parent has four direct child slots and launches can reach depth `3`

#### Scenario: Values exceed the documentation example

- **WHEN** the operator sets valid limits of seven direct children and depth five
- **THEN** those limits are accepted without being clamped to four children or depth three

#### Scenario: One field is omitted

- **WHEN** the `limits` mapping contains only `maxConcurrentRuns: 4`
- **THEN** concurrency is four and maximum depth remains `1`

#### Scenario: Limits are malformed

- **WHEN** limits contain an unknown key, invalid mapping shape, wrong type, fraction, unsafe integer or out-of-range value
- **THEN** validation names the field and explains its accepted form
- **AND** no child starts using old settings

#### Scenario: Limits are read from the new default registry

- **WHEN** `OMPS_REGISTRY` is unset and `<agent-dir>/omps/config.yaml` sets `maxConcurrentRuns: 4`
- **THEN** each parent has four direct child slots
