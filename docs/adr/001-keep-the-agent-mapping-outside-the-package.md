# ADR-001: Keep the agent mapping outside the package and ship no agents

- **Date:** 2026-10-01
- **Status:** Accepted
- **Partly superseded by:** [ADR-010](./010-keep-operator-files-in-the-omps-folder.md), for the default registry location only.
- **Deciders:** Maintainer

## Context

OMPSS used to read `om-subagents.yaml` from its own install directory. The repository also held the maintainer's sixteen ported agents in `ports/` and a two-agent example in `pilot/`.

That setup cannot become a public npm package:

- A package update replaces the install directory, so it would overwrite the user's mapping.
- The ported agents named the maintainer's model choices, skill paths and MCP servers. One persona named the maintainer.
- `a-build` pinned the virtual model `model-auto-router/default` and loaded `pi-model-auto-router` from a fixed path. That package was never in use and was no longer installed, so 24 tests failed and blocked the first push.

## Decision

1. Read the mapping from `~/.pi/agent/om-pi-subagents.yaml`. The folder comes from Pi's agent directory, so `PI_CODING_AGENT_DIR` moves it too. `OMPSS_REGISTRY` overrides the path.
2. Treat a missing mapping file as no agents. A new install answers `No personas mapped.`
3. Ship no mapping, no persona, no model and no personal path. An agent with no `model` uses the parent session's model.
4. Remove `ports/`, `pilot/` and the tests built on them. The maintainer's mapping moved to their own agent directory.
5. Remove every trace of `pi-model-auto-router`.
6. Add `defaults.test.ts`. It fails if a mapping, a persona folder, a provider or model name, or a personal path appears in the package.
7. Rename the mapping file to `om-pi-subagents.yaml` to match the package name.

## Consequences

### Positive

- Package updates never touch the user's agents.
- The public package holds nothing specific to one machine or one person.
- A user with no mapping gets a working, empty extension instead of an error.

### Negative

- This is a breaking change for anyone who kept a mapping in the install directory. They must move it to `~/.pi/agent/om-pi-subagents.yaml`.
- The parity tests against the retired `pi-subagents` agents are gone. They only made sense for one machine.

### Neutral

- Persona paths stay relative to the mapping file.

## Alternatives Considered

| Option                                        | Rejected Because                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Keep the mapping in the install directory** | A package update would overwrite it.                                                                                 |
| **Ship the ported agents as examples**        | They name one person's models, skills and MCP servers. Users would copy settings that do not exist on their machine. |
| **Give `a-build` a fixed default model**      | Any fixed model is a guess about the user's providers. The session's model is always available.                      |
| **Keep `pi-model-auto-router`**               | It was never used and was not installed.                                                                             |

## References

- `index.ts` (`resolveRegistryPath`), `config.ts` (`loadRegistry`)
- `defaults.test.ts`
- [USAGE.md](../USAGE.md)
