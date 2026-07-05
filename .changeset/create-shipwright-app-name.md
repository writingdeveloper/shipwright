---
"create-shipwright": minor
---

Prompt for an app display name (or pass `--name "Acme"`; opt out with
`--no-rename`) and run the template's own `pnpm rename` right after
scaffolding — before `git init`, so the new project's very first commit is
already branded instead of "Shipwright". Non-interactive runs without
`--name` skip the step, matching the previous behaviour.
