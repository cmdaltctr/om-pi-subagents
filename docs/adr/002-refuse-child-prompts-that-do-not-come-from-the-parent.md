# ADR-002: Refuse child prompts that do not come from the parent

- **Date:** 2026-10-01
- **Status:** Accepted
- **Deciders:** Maintainer

## Context

A child Pi process can load trusted extensions. Such an extension can call `pi.sendUserMessage` and start a model run that the parent never asked for.

The start-up gate checked for this once. After the child reported ready, the parent looked for an `agent_start` event among the records it had already received. If that event arrived a few milliseconds after the ready entry, the gate missed it.

macOS delivered the events in the expected order, so the test passed there. The first Linux CI runs showed the race: `fails when a model run starts before readiness` failed with no `StartupError`.

## Decision

1. The child guard handles Pi's `input` event. Pi fires it before it starts a model run. The guard lets a prompt through only when its source is `rpc`, which is the parent. It returns `handled` for every other source and records an `ompss-violation` entry with `input` set to the source.
2. A prompt refused before readiness is a readiness problem, so the launch fails. Pi reports entries to the parent only once RPC output starts, so the guard also lists early refusals in the readiness entry.
3. A prompt refused after readiness fails the run with `permission violation: a prompt from <source> was refused`.
4. The parent's `agent_start` check stays as a second layer. Its test now starts the rogue run and waits for it to end before reporting ready. That is the only order the parent can promise to detect.
5. Two end-to-end tests send a prompt from a test extension, once at start-up and once after the task. The injected text must never reach the model.

## Consequences

### Positive

- The protection no longer depends on event timing or platform.
- No injected text reaches a model, before or after readiness.

### Negative

- An extension that needs to prompt the child on its own cannot run inside OMPSS.

### Neutral

- `Violation` now has either `tool` or `input`.

## Alternatives Considered

| Option                                                | Rejected Because                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Ask `get_state` for `isStreaming` after readiness** | It narrows the window but does not close it. A prompt sent later still starts a run. |
| **Wait a fixed time after readiness**                 | Slower on every run, and still a guess about timing.                                 |
| **Run CI on macOS only**                              | Linux users would keep a gate with a known race.                                     |

## References

- `child-guard.ts` (`input` handler), `result.ts`, `protocol.ts`
- `permissions.test.ts` ("a trusted extension sends its own prompt"), `startup.test.ts`
- `test/fixtures/prompt-injector-extension.ts`
