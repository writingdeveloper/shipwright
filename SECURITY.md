# Security Policy

shipwright is an early, work-in-progress starter, but security is taken
seriously — the whole point is to assemble *vetted* libraries safely.

## Supported versions

The project has not yet cut a tagged release. Until a `1.0` ships, **only the
latest `main`** receives security fixes. Pin to a commit if you need stability.

| Version | Supported |
| --- | --- |
| `main` (latest) | ✅ |
| Older commits / forks | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's
[**Security Advisories**](https://github.com/writingdeveloper/shipwright/security/advisories/new)
("Report a vulnerability"). If you cannot use that, email the maintainer at the
address on their [GitHub profile](https://github.com/writingdeveloper).

Please include:

- a description of the issue and its impact,
- steps to reproduce (or a proof of concept),
- affected version / commit, and
- any suggested remediation.

You can expect an acknowledgement within **a few business days**. Once a fix is
ready we'll coordinate a disclosure timeline with you and credit you in the
advisory unless you prefer to remain anonymous.

## What we already do

- **Dependency auditing in CI.** Every push and pull request runs
  `pnpm audit`; the build is expected to stay at **0 known vulnerabilities**.
  Single-comparator advisories are pinned via `overrides` in both
  `package.json` and `pnpm-workspace.yaml`.
- **Automated dependency updates.** Dependabot opens grouped weekly PRs for npm
  packages and GitHub Actions.
- **Defence-in-depth auth.** The reference app verifies authorization inside
  every Server Action and scopes all data access by owner — not middleware
  alone — with tests asserting those invariants.
- **Validated environment.** Secrets and config are parsed/validated at startup
  via `@repo/env`, so misconfiguration fails fast instead of leaking through.

## Hardening notes for adopters

- Generate a strong, unique `BETTER_AUTH_SECRET` (≥ 32 chars) per environment;
  never reuse the example/dev value in production.
- Never commit a real `.env`; only `.env.example` is tracked.
- Review the architecture rules in [`CLAUDE.md`](./CLAUDE.md) (auth/authz, CSP,
  payment webhooks) before shipping a feature.
