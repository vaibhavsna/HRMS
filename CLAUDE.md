# CLAUDE.md — rules for working in hrms-platform

Read this first. The specs live in `docs/`; the execution plan is `docs/07-sprint-execution.md`; the safety rules are `docs/08-engineering-guardrails.md`. If code and docs disagree, stop and ask — do not silently pick one.

## Project in one paragraph
Clean-room HRMS: React + Vite + TypeScript frontend, Node + Express + TypeScript backend, PostgreSQL via Prisma, npm workspaces monorepo. Phase 1 = Auth/RBAC, Employee, Leave. No code from Horilla is reused.

## Branching (non-negotiable)
- `main` = stable, `dev` = staging, `feature/*` = all development work. Fixes for main-only emergencies use `hotfix/*`.
- Never commit or push directly to `main` or `dev`. Always branch from `dev`: `feature/<sprint>-<short-name>` (e.g. `feature/s1-login-endpoint`).
- Open a PR into `dev`. A release PR `dev` → `main` happens only at sprint end and only when the user says so.
- One ticket (S0-1, S1-2, ...) per branch and per PR. Put the ticket ID in the branch name and PR title.
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`. Small, frequent commits.

## Never do without explicit user approval in that message
- `git push --force`, `git reset --hard`, `git clean -f`, `git checkout -- .`, `git branch -D`, rebasing pushed branches, deleting tags or remote branches.
- Pushing, merging, tagging, publishing a release, or changing GitHub settings/secrets.
- `prisma migrate reset`, `prisma db push --force-reset`, dropping tables/databases, deleting Docker volumes (`docker compose down -v`), or editing a migration that has already been merged.
- Deleting or overwriting files you did not create in this task. Look at the target first.
- Installing a new dependency, or upgrading a major version. State the package, why, and its size/maintenance status first.

## Protecting work
- Before any risky or large change, make sure the working tree is committed (or ask). Never leave a task with uncommitted work: commit to the feature branch and tell the user.
- Never read, print, commit, or log `.env` files, secrets, tokens, password hashes, or real employee data. Only `.env.example` is committed.
- Migrations are append-only. To change the schema, add a new migration; never edit or delete an applied one.
- Prefer soft delete (`deleted_at`) as the docs require; never hard-delete HR records in code.

## Scope discipline
- Do only the ticket asked. No unrelated refactors, no features from a later sprint, no "while I'm here" changes. Note ideas as a short list at the end instead.
- Follow the docs: schema in `02`, API envelope and permissions in `03`, folder layout in `04`. A deviation needs the user's OK and a docs update in the same PR.
- Match existing style. Module shape: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (Zod). Controllers hold no business logic.

## Code stability — a ticket is not done until
1. `npm run lint`, `npm run typecheck`, and `npm test` pass locally (once those scripts exist from S0-3).
2. New behaviour has tests; bug fixes have a regression test. Leave approve/reject/cancel and RBAC need the most coverage.
3. Anything runnable was actually run (server booted, endpoint called, page opened) and you report what you saw. If you could not run it, say so — do not claim it works.
4. The ticket's "Done when" in `docs/07` is met, and docs are updated if behaviour changed.
5. No `any`, no `// @ts-ignore`, no disabled lint rules, no skipped or deleted tests to get green. If a check fails, fix the cause or report it.

## Security rules (HR data is sensitive)
- Validate every input with Zod. Return the error envelope from `03`. Never leak stack traces or SQL errors to clients.
- Enforce RBAC on every non-public route and scope data (employee sees own, manager sees reports) in the service layer, not only the UI.
- bcrypt cost 12; access token in memory only; refresh token in httpOnly cookie; never log tokens, passwords, or auth request bodies.
- Money, dates, and leave-day math: use `Decimal` and date-only types, never floats or ad hoc timezone handling. Balance changes happen in a DB transaction.

## Frontend rules
- Follow the design foundation from the UI/UX tickets (tokens, component library, app shell). Do not invent per-screen styles. Every data screen needs loading, empty, and error states, keyboard access, and a phone-width layout.
- Server state via TanStack Query; no secrets in the bundle; only `VITE_*` env vars.

## Issues, Project, and PRs (see `docs/10-github-workflow.md`)
- Tickets are tracked as GitHub Issues in the "HRMS Roadmap" Project, grouped by Sprint milestone. Do not start work without an issue. If none exists, propose one using the *Sprint ticket* template and wait.
- Every PR body must contain `Closes #<issue>`. Branch name uses the sprint and a short name: `feature/s1-login-endpoint`. Reference the issue in commit messages.
- Move the issue's status as work progresses (Ready → In progress → In review); merging closes it. Out-of-scope findings become new issues, not extra changes in the PR.
- `docs/07-sprint-execution.md` is the planning baseline. Update it in the same PR only when a ticket's scope, approach or "Done when" changes. Live status lives in GitHub, not in the doc.
- The old sprint board artifact is superseded by the Project; do not keep updating it.

## How to report
End each task with: what changed (files), what you ran and the result, what is not done, and the branch/PR state. Reference files as `path:line`. If tests fail, show the failure, not a summary.

## Review expectations
Every PR is reviewed by Claude in CI and by the user. When reviewing, prioritise: correctness bugs, security/RBAC holes, data-loss risks (migrations, deletes, transactions), missing tests, then style.
