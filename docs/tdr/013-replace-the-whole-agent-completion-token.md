# TDR-013: Replace the whole agent completion token

- **Date:** 2026-10-08
- **Status:** Accepted
- **Deciders:** Project maintainer
- **Supersedes:** TDR-012 application decision for OMPS-owned items
- **Tags:** pi, autocomplete, regression

## Context

TDR-012 verified Pi's wrapper API, native application and submission trimming.
Further tests showed that native application replaces only text before the cursor.
Completing `@r|eader inspect src` left `eader` in the task. An existing space could also produce two separators.
These defects affect agent items. Pi's file application must stay unchanged.

## Decision

Track OMPS completion items by object identity in `src/at-mention.ts`.
For those items, replace the whole initial token. Add one space before the existing task.
Preserve later lines and place the cursor after that space. Delegate file items to the wrapped provider unchanged.
Keep the verified wrapper API and prefix checks from TDR-012.

## Consequences

### Positive

- Choosing an agent inside its existing name preserves the intended task.
- Native file application keeps its original behaviour.

### Negative

- OMPS owns a small application path for its own items.

### Neutral

- Input routing, mappings and child launch rules stay unchanged.

## Alternatives Considered

| Option                                   | Rejected Because                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------- |
| Delegate all item application            | Leaves the old agent suffix and can duplicate the separator.           |
| Patch the cursor prefix after delegation | Adds another repair step instead of replacing the complete token once. |

## How to Recognise / Handle This Again

1. Put the cursor inside a previously typed agent name.
2. Apply an agent suggestion.
3. Check the retained task and later lines.
4. Run `bun run test test/at-mention-completion.test.ts`.
5. Check native file application separately.

## Revisit Triggers

Revisit when Pi changes the completion item contract or OMPS changes token syntax.

## References

- [TDR-012 platform spike](012-at-mention-autocomplete-on-pi.md)
- [Application implementation](../../src/at-mention.ts)
- [Pinned-provider regressions](../../test/at-mention-completion.test.ts)
- [ADR-017](../adr/017-launch-agents-directly-from-an-at-mention.md)

Eight pinned-host regressions failed before the fix. The targeted suite passed 46 tests afterwards.
Five disposable mutations tested token boundaries, separators, retained task text, later lines and native-item ownership.
