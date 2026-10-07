# OMPS skill evaluation cases

These development fixtures stay outside the published package.
`evals.json` defines operational prompts and expected safeguards, including fleet navigation,
optional Memory/Todo switches and ownership-safe result handoff.
`trigger-eval.json` contains positive and unrelated routing examples.
`evidence.json` links each case to deterministic regressions. These links identify test names;
they do not measure how a model responds to the prompts.

Run the deterministic checks from the repository root:

```sh
bun run test test/skill-evals.test.ts test/runs.parallel.test.ts test/nesting.launch.test.ts test/service.test.ts test/nesting.cleanup.test.ts test/todo.parent.test.ts test/fleet.test.ts test/interactive-fleet.test.ts test/capability-settings.e2e.test.ts test/memory.coexistence.test.ts
```

Set `OMPS_CURRENT_HOST_MODULES` to the installed Pi 1.0.4 `node_modules` folder to exercise both interactive hosts.
Without that variable, the current-host interactive case skips and must be reported as unverified.
These tests use disposable settings, synthetic credentials, a local fake model and the real pinned todo package.
They verify supported runtime behaviour and fixture structure. They do not measure an unscripted model's skill selection,
instruction following or improvement over a baseline.

Model-driven trigger evaluation and with-skill versus baseline trials have not been run.
Obtain approval for paid or live-model runs before using the skill evaluation tooling.
Save transcripts, model/version, timing, grading evidence and remaining gaps in ignored `docs/local-docs/`.
Do not claim a trigger accuracy or benchmark score from the deterministic tests.
