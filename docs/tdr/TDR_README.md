# Technical Decision Records

TDRs record implementation-level findings: platform workarounds, debugging results and tooling fixes. For architecture decisions, see the [ADR index](../adr/ADR_README.md).

| TDR                                       | ADR                                |
| ----------------------------------------- | ---------------------------------- |
| How to make a technology behave correctly | Which structure or approach to use |
| "Why is X broken and how did we fix it?"  | "Why did we choose X over Y?"      |

## Index

| TDR                                                                   | Title                                                 | Date       | Status   |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ---------- | -------- |
| [001](./001-make-tests-pass-on-linux.md)                              | Make process, path and clean-up tests pass on Linux   | 2026-10-01 | Accepted |
| [002](./002-allow-tool-events-before-the-prompt-response-in-tests.md) | Allow tool events before the prompt response in tests | 2026-10-02 | Accepted |
| [003](./003-leave-the-generated-changelog-out-of-format-checks.md)    | Leave the generated changelog out of format checks    | 2026-10-02 | Accepted |
| [004](./004-wait-for-descendants-while-the-turn-can-be-aborted.md)    | Wait for descendants while the turn can be aborted    | 2026-10-05 | Accepted |
| [005](./005-match-ci-launch-overrides-and-declare-test-tools.md)      | Match CI launch overrides and declare test tools      | 2026-10-05 | Accepted |
| [006](./006-use-underscore-mcp-tool-names-on-pi-1.md)                 | Use underscore MCP tool names on Pi 1.0               | 2026-10-07 | Accepted |
| [007](./007-macos-option-key-and-pi-modifier-order.md)                | Handle the macOS Option key and Pi modifier order     | 2026-10-07 | Accepted |
| [009](./009-confirm-pi-0-99-1-package-layout.md)                      | Confirm the Pi 0.99.1 package layout                  | 2026-10-08 | Proposed |
| [011](./011-redraw-result-messages-and-preserve-legacy-ctrl-e.md)     | Redraw result messages and preserve legacy Ctrl+E     | 2026-10-08 | Accepted |

## Status values

- **Proposed**: under discussion
- **Accepted**: agreed and active
- **Superseded**: replaced by a later TDR, which is linked
- **Deprecated**: no longer relevant

An accepted TDR is never edited. Supersede it with a new one.
