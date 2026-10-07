# Engineering Guardrails

How we make sure code is never lost and `main` stays stable. These rules apply to people and to Claude. The Claude-specific version is in [CLAUDE.md](../CLAUDE.md).

## 1. Never lose code

| Risk | Guardrail |
|---|---|
| Work exists only on one laptop | Everything lives in a GitHub repo. Push the feature branch at least daily and before ending any session. |
| No history at all | `git init` is the first M0 action (S0-1). Until the first push, nothing is backed up. |
| Overwritten or deleted work | No force push, no `reset --hard`, no `clean -f` without explicit approval. Claude's `.claude/settings.json` denies these commands. |
| Bad merge to `main` | `main` and `dev` are protected: PR required, CI required, no force push, no deletion. |
| Lost database | Dev DB is disposable and rebuilt from migrations + seed. Never the only copy of anything. Production DB gets automated backups before Phase 1 goes live. |
| Lost secrets or leaked secrets | `.env` is gitignored, only `.env.example` is committed. Secrets live in GitHub Actions secrets. |
| Edited history of the schema | Migrations are append-only. Fix forward with a new migration. |

## 2. Branch model

```
feature/s1-login-endpoint ──PR──▶ dev (staging) ──release PR──▶ main (stable) ──tag vX.Y.0
```

- `main`: stable, always deployable, only changed by a release PR from `dev` or a `hotfix/*` PR. Every merge is tagged.
- `dev`: staging. Integration branch; must be green at all times. Sprint demo happens from here.
- `feature/*`: one ticket each, branched from `dev`, short-lived, deleted after merge.
- `hotfix/*`: branched from `main` for urgent fixes, merged to `main` and then back into `dev`.

Merge strategy: squash merge into `dev` (one clean commit per ticket); merge commit for the release PR into `main` so sprint boundaries stay visible. Stacked PRs (a ticket built on an unmerged one) are the exception: parents merge with a merge commit, because squashing a parent would conflict the next PR on `package-lock.json`; the child is then retargeted to `dev`.

## 3. GitHub branch protection (set in S0-2)

For both `main` and `dev`:
- Require a pull request before merging; at least 1 approval.
- Require status check `ci` to pass and the branch to be up to date.
- Require conversation resolution (Claude review comments count).
- Block force pushes and branch deletion. Include administrators.
- `main` only: restrict who can merge to the repo owner.

Note: branch protection on private repos needs a paid GitHub plan. If unavailable, the same rules are enforced by convention and by the Claude permission denies, and the repo should be made public or upgraded before real work starts.

**Applied so far (S0-2, 2026-10-06; repo is public).** On `main` and `dev`: pull request required, force pushes and deletion blocked, conversation resolution required, rules apply to administrators. Not yet applied, because they cannot be met today:
- *1 approval*: the repo has one owner and GitHub does not count an author's own approval, so the count is 0 until a second reviewer exists. Claude's CI review comments still must be resolved.
- *Required check `ci` and up-to-date branch*: `ci` is created by S0-8 and cannot be required before it has run once. Add it right after S0-8 merges.
- *`main` merge restricted to the owner*: GitHub offers push restrictions only on organisation repositories; on this personal repo it is enforced by convention.

## 4. Pull request rules

- Title: `[S1-2] feat: login endpoint`. One ticket per PR, ideally under 400 changed lines. The body links its issue with `Closes #<n>` (see [10-github-workflow.md](./10-github-workflow.md)).
- The PR template ([.github/pull_request_template.md](../.github/pull_request_template.md)) must be filled in: what, why, how tested, risks, docs updated.
- CI runs install, lint, typecheck, test, and `prisma migrate diff`. Red CI blocks merge, no exceptions.
- Claude reviews every PR automatically and comments on correctness, security, data-loss risk, and missing tests. Fix or reply to every comment.

## 5. Release flow

1. Sprint ends with `dev` green and the sprint's Definition of Done met.
2. Open a release PR `dev` → `main` titled `Release vX.Y.0 — Sprint N`. Body lists merged tickets.
3. Claude reviews the full diff. User approves and merges, or tells Claude to merge in that message.
4. Tag `vX.Y.0` on `main`. A GitHub Release is published with notes, and the user is notified.
5. Confirm `dev` still equals or is ahead of `main`.

## 6. Quality gates (what "stable" means)

- Lint, typecheck, and tests pass in CI on every PR.
- Backend: Vitest unit tests for services and Zod schemas; Supertest integration tests on a dedicated test database. Required for auth, RBAC, and the Leave workflow.
- Frontend: Vitest + React Testing Library for components and hooks that hold logic.
- Coverage is a signal, not a target; the rule is that new logic and every bug fix ships with a test.
- Schema changes: reviewed against [02-database-schema.md](./02-database-schema.md); the doc is updated in the same PR.
- A feature that is not finished merges behind no flag and no half-wired route; split the ticket instead.

## 7. Database safety

- Migrations are generated with `prisma migrate dev`, committed, and never edited after merge.
- Destructive operations (`migrate reset`, dropping columns/tables, `docker compose down -v`) need explicit approval and are only run on local dev databases.
- Any migration that drops or rewrites data needs a rollback note in the PR.
- Seed scripts are idempotent.

## 8. Claude-specific guardrails

- [CLAUDE.md](../CLAUDE.md) is loaded every session and defines the rules.
- [.claude/settings.json](../.claude/settings.json) denies force pushes, hard resets, `git clean`, pushes to `main`/`dev`, recursive deletes, destructive Prisma and Docker commands, and reads of `.env` files. These are enforced by the tool, not by trust.
- Claude works only on `feature/*` branches, commits its work, and reports what it ran.
- Claude merges ticket PRs into `dev` itself once the conditions in [CLAUDE.md](../CLAUDE.md) hold (green `ci`, linked issue, "Done when" met, no unapproved dependency). It never merges release PRs, hotfix PRs, or any PR that changes CLAUDE.md, `.claude/settings.json`, this document or branch protection: the owner does. It never tags, releases, or changes GitHub settings without being told to in that message.
- Claude proposes a plan and waits for approval before any cross-cutting change (new dependency, schema change to an existing table, folder restructure).

## 9. Definition of Done (every ticket)

- [ ] Meets the ticket's "Done when" in [07-sprint-execution.md](./07-sprint-execution.md)
- [ ] Lint, typecheck, tests green locally and in CI
- [ ] Tests added for new logic and bug fixes
- [ ] Actually run and observed working (not just compiled)
- [ ] Docs updated if behaviour, schema, or API changed
- [ ] PR template complete, Claude review comments resolved, and the owner approved or the PR meets the self-merge conditions in CLAUDE.md
