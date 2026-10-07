# TDR-006: Use underscore MCP tool names on Pi 1.0

- **Date:** 2026-10-07
- **Status:** Accepted
- **Deciders:** Maintainer
- **Tags:** pi, mcp, tool-names, readiness

## Context

An operator upgraded Pi from 0.99 to 1.0.4. Every run of an agent with MCP tools then failed before the task reached the child:

```text
child is not ready: tool "mcp__context7-mcp__resolve-library-id" is not registered
```

The mapping and the MCP servers were unchanged. `stderr.log` and `events.jsonl` were empty, because readiness failed first.

### Root Cause Analysis

Pi builds native MCP tool names from the server and tool names.

- Pi 0.99.1, `dist/extensions/mcp/tools.js:48`: `` `mcp__${server}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_") ``. Hyphens stay.
- Pi 1.0.4, `dist/extensions/mcp/tools.js:46`: `` `mcp__${server}__${tool}`.replace(/[^A-Za-z0-9_]/g, "_") ``. Hyphens become underscores.

Pi 1.0.4 registers `mcp__context7_mcp__resolve_library_id`. The OMPS readiness check compares exact names, as designed, so the hyphenated mapping entry has no match.

CI did not catch the change, because the pinned test host is Pi 0.99.1.

## Decision

Keep exact tool-name matching. Do not translate names in OMPS.

Write MCP tool names in the mapping with underscores in place of hyphens. On Pi 1.0 the full name uses only letters, digits and `_`.
Document the rule, an example table and the error in `docs/SETUP.md`, `docs/USAGE.md` and `README.md`.

Use test MCP tool names that contain no hyphen, so the same expected names hold on Pi 0.99 and Pi 1.0.
Run the real-Pi suites with the pinned host and with `OMPS_PI_BIN` set to the operator's Pi 1.0 binary.

## Consequences

### Positive

- The permission boundary stays exact. OMPS never approves a name the operator did not write.
- Mappings written for Pi 1.0 also load on Pi 0.99 when server and tool names contain no hyphen.

### Negative

- Operators who upgrade Pi must edit hyphenated MCP names by hand.

### Neutral

- Server names in `mcp.json` stay unchanged. Only the names in the OMPS mapping change.

## Alternatives Considered

| Option                                       | Rejected Because                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Translate hyphens to underscores inside OMPS | It approves a name the operator did not write, and it hides Pi's naming change. |
| Accept either spelling during readiness      | Two spellings for one permission make the exact boundary harder to audit.       |
| Pin operators to Pi 0.99                     | Operators choose their Pi version, and Pi 0.99 does not receive fixes.          |

## How to Recognise / Handle This Again

1. Look for `child is not ready: tool "mcp__..." is not registered` with an empty `stderr.log`.
2. Check the Pi version with `pi --version`.
3. Find the naming rule in Pi's `dist/extensions/mcp/tools.js`.
4. Replace each character other than a letter, digit or `_` with `_` in the mapping.
5. Run `/omps list` and start the agent again.

## Revisit Triggers

Revisit when Pi changes its MCP naming rule again, or when the pinned test host moves to Pi 1.0 or newer.

## References

- [Tools and MCP setup](../SETUP.md#tools)
- [Troubleshooting table](../USAGE.md)
- [Context7 tool permission test](../../test/context7.test.ts)
- [Readiness check](../../src/startup.ts)
