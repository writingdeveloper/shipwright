# .claude/ — the AI-native layer

shipwright ships first-class support for [Claude Code](https://claude.com/claude-code) as part of the repo. This directory is committed so every contributor (and every agent session) inherits the same setup.

## What's here
- `../CLAUDE.md` — repo-wide guidance loaded every session. Per-package `CLAUDE.md` files hold area-specific rules and load on demand.
- `skills/` — reusable task workflows (`SKILL.md` files). Put specialized, occasionally-needed expertise here so it loads on demand instead of bloating `CLAUDE.md`. Planned: `add-mvp`, `add-package`, `ship-pwa`.
- `agents/` — custom subagents, each running in its own context window with its own tools. Use them to map a subsystem read-only before editing, or to review changes.
- `commands/` — custom slash commands.
- `settings.json` — shared permissions and hooks, version-controlled so the same guardrails apply to everyone.

## Conventions
- Keep `CLAUDE.md` files small and broadly-applicable. The test for a line: *would removing it cause a mistake?* If it's only sometimes relevant, make it a skill.
- Prefer subagents for exploration in a large monorepo — they keep the main context clean by reporting summaries.
