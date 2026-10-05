# OMPSS skill evaluation cases

These development fixtures stay outside the published package.
`evals.json` defines operational prompts and expected safeguards.
`trigger-eval.json` contains positive and unrelated routing examples.
`evidence.json` links each case to a deterministic runtime regression.

Run the deterministic checks from the repository root:

```sh
bun run test test/skill-evals.test.ts runs.parallel.test.ts nesting.launch.test.ts service.test.ts nesting.cleanup.test.ts todo.parent.test.ts
```

These tests use disposable settings, synthetic credentials, a local fake model and the real pinned todo package.
They verify supported runtime behaviour and fixture structure. They do not measure an unscripted model's skill selection,
instruction following or improvement over a baseline.

Model-driven trigger evaluation and with-skill versus baseline trials have not been run.
Obtain approval for paid or live-model runs before using the skill evaluation tooling.
Save transcripts, model/version, timing, grading evidence and remaining gaps in ignored `docs/local-docs/`.
Do not claim a trigger accuracy or benchmark score from the deterministic tests.
