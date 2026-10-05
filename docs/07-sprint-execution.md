# Sprint Execution Plan — What to do and how

Sprints map to roadmap milestones ([05-roadmap.md](./05-roadmap.md)). Rules for branches, PRs and quality gates are in [08-engineering-guardrails.md](./08-engineering-guardrails.md). Claude's working rules are in [CLAUDE.md](../CLAUDE.md).

**Conventions**
- Ticket IDs: `S<sprint>-<n>`. Branch: `feature/s<sprint>-<short-name>`, from `dev`, PR back into `dev`.
- Ticket order below is the build order. A ticket lists *what*, *how*, and *done when*.
- Versions are not pinned in the earlier docs. In S0-3 pin current stable majors that support the installed Node (v24) and record them in `backend/README.md` and `frontend/README.md`.
- Each sprint ends with a release PR `dev` → `main` and a tag.

**Sprint cadence:** plan (confirm tickets, resolve open questions) → build ticket by ticket → demo from `dev` → release PR → retro note appended to this file.

---

## Sprint 0 — M0 Repo scaffold (tag `v0.1.0`)

Goal: every layer boots; nothing has business logic. Pre-conditions in [06-conversion-point.md](./06-conversion-point.md).

| ID | What | How | Done when |
|---|---|---|---|
| S0-1 | Git + GitHub | `git init -b main`; set author; initial commit of docs and skeleton; create `dev`; add the GitHub remote (personal account); push both branches | `main` and `dev` visible on GitHub |
| S0-2 | Branch protection | GitHub Settings → Branches, rules from guardrails §3 | Direct push to `main`/`dev` rejected |
| S0-3 | Root tooling | Add ESLint (flat config), Prettier, `tsconfig.base.json`; root scripts `lint`, `typecheck`, `test`, `format`; add `.env.*` to `.gitignore`; pin versions | `npm install` and `npm run lint` pass at root |
| S0-4 | Postgres | Use existing `docker-compose.yml`; check port 5432 is free first, else change the host port in compose and `.env.example` | `docker compose up -d` and a client connects |
| S0-5 | Prisma schema | `backend`: add `prisma`, `@prisma/client`; model exactly the 11 entities in `02-database-schema.md` with UUID ids, audit columns, `deleted_at`, native enums, listed indexes and unique constraints | `prisma migrate dev --name init` succeeds; migration committed |
| S0-6 | Express skeleton | `src/config/env.ts` (Zod, fail fast), `app.ts` + `index.ts`, `helmet`, CORS with credentials, JSON body, request-ID + `pino`, error handler producing the `03` error envelope, `GET /health`; `.env.example` | `npm run dev -w backend` serves `/health` → `{status:"ok"}`; missing env var exits with a clear message; first Vitest + Supertest test for `/health` |
| S0-7 | Frontend skeleton | Vite + React + TS; `VITE_API_BASE_URL`; placeholder page; Vitest + RTL configured | `npm run dev -w frontend` renders the page; one smoke test passes |
| S0-8 | CI, review, release automation | `.github/workflows/ci.yml` (install, lint, typecheck, test, `prisma migrate diff` against a Postgres service); `claude-review.yml` (Claude Code action on PRs to `dev`/`main`, uses `ANTHROPIC_API_KEY` secret); `release-notify.yml` (on merged PR into `main`: create GitHub Release from tag/notes and mention the owner) | CI green on a test PR; Claude comments on it |
| S0-9 | UI/UX foundation | Choose component approach (proposal: Tailwind + shadcn/ui/Radix); define tokens (color, type, spacing, radius, light/dark); app shell wireframe (sidebar, top bar, role-based nav); shared patterns: data table, form, loading/empty/error states. Deliver as a short `docs/09-ui-foundation.md` plus a tokens file | User approves the foundation before any feature screen is built |

Out of scope: login, JWT, RBAC, business endpoints, real screens.

---

## Sprint 1 — M1 Auth and RBAC (tag `v0.2.0`)

Goal: log in, refresh, log out; routes enforce permissions; admin manages users and roles.

| ID | What | How | Done when |
|---|---|---|---|
| S1-1 | Seed | `prisma/seed.ts`, idempotent (upsert): roles `admin`, `hr_manager`, `manager`, `employee`; permissions and role grants from the appendix of `03-api-specification.md`; one bootstrap admin from env vars (never hard-coded) | Running seed twice gives the same rows |
| S1-2 | Login | Add `refresh_tokens` model + migration (hashed token, expiry, revoked_at, user_id). `POST /auth/login`: Zod validate, bcrypt cost 12 compare, update `last_login_at`, issue access JWT (TTL from env) and refresh token in httpOnly, secure, SameSite=strict cookie. Same error for unknown email and wrong password | Valid login returns `{accessToken,user}` and cookie; inactive user rejected |
| S1-3 | Refresh, logout, me | Refresh rotates the token and rejects revoked/expired; logout revokes server side and clears cookie; `/auth/me` returns user, employee, roles, permissions | Replaying an old refresh token fails |
| S1-4 | Hardening | `express-rate-limit` on login/refresh; pino redaction for auth bodies, tokens, cookies | Excess attempts → 429; logs contain no secrets |
| S1-5 | Middleware | `authenticate` (verify JWT, attach `req.user`), `requirePermission('resource:action')` resolving permissions from `UserRole`/`RolePermission`, `validate(zodSchema)` | Missing token → 401; missing permission → 403, in the error envelope |
| S1-6 | Users and Roles API | Modules `users`, `roles` per `03`: pagination, `q` search, soft delete, role assignment; admin cannot delete or deactivate the last admin | All endpoints work and are permission-checked |
| S1-7 | Tests | Dedicated test DB (`TEST_DATABASE_URL`), migrate fresh per run, test helpers for creating users with roles | Auth + RBAC integration tests pass in CI |

---

## Sprint 2 — M2 Employee management (tag `v0.3.0`)

Goal: HR manages employees, departments, job positions; reporting lines visible.

| ID | What | How | Done when |
|---|---|---|---|
| S2-0 | Design | Wireframes for login, employee list, employee form, org chart, using the S0-9 foundation | User approves |
| S2-1 | Departments, Job Positions API | Unpaginated lists, `parentDepartmentId`, position `departmentId`; block delete when children/employees exist (409) | Spec endpoints pass tests |
| S2-2 | Employees API | CRUD, filters `departmentId`, `status`, `managerId`, `page`, `limit`, `sort`; unique `employee_code`/`work_email` → 409; reject a manager cycle (A manages B manages A); soft delete; scope reads by role | Tests for filters, conflicts, cycle, scoping |
| S2-3 | Frontend shell | React Router, auth context (access token in memory), API client with envelope + error handling, TanStack Query setup, login screen, protected routes, app shell and role-based nav | Can log in and reach a protected page |
| S2-4 | Employee screens | List with filters and pagination, create/edit form with server field errors, detail page | HR creates and edits an employee end to end |
| S2-5 | Org chart lite | Tree from `manager_id` | Reports render under their manager |

---

## Sprint 3 — M3 Leave management (tag `v0.4.0`)

Goal: request, approve/reject/cancel, balances stay correct.

| ID | What | How | Done when |
|---|---|---|---|
| S3-0 | Design | Wireframes for request form, my requests, approval queue, balances | User approves |
| S3-1 | Leave Types API | CRUD, unpaginated | Spec endpoints pass tests |
| S3-2 | Leave Balances | `GET /employees/:id/leave-balances`; `POST /leave-balances/adjust` (admin/HR); unique per employee/type/year; `Decimal` days | Adjust restricted; duplicates rejected |
| S3-3 | Submit and edit requests | Validate dates (`start <= end`, half-day rules), overlap with existing approved/pending requests, sufficient balance; resolve `approver_id` from `manager_id`; employee without manager → clear 400; edit only while `pending`, only by requester | Each rule has a failing-case test |
| S3-4 | Approve, reject, cancel | Each in one DB transaction with a row lock on the balance; only the approver or HR/admin may act; cancel of an approved request reverses `used_days`; illegal transitions → 409 | Transition table tested; balances never go negative or double-count |
| S3-5 | Screens | Request form, my requests with cancel, manager approval queue, balances widget | Manager approves from the queue |

---

## Sprint 4 — M4 Integration polish (tag `v1.0.0`)

| ID | What | How | Done when |
|---|---|---|---|
| S4-1 | Silent refresh | On 401 call `/auth/refresh` once, retry the original request, else go to login; guard against refresh loops and concurrent refreshes | Expired token is invisible to the user |
| S4-2 | Error handling | Map the error envelope to form field errors and toasts; global error boundary | Every error code has a defined UI |
| S4-3 | Leave workflow tests | Full matrix of transitions, concurrency on balances, RBAC scoping | Suite runs in CI |
| S4-4 | Accessibility and responsive pass | Keyboard, focus, contrast, phone-width layouts across screens | Checklist in PR passes |
| S4-5 | Docs and ops | README run-from-scratch guide, env var table, deployment notes, backup/restore note | A new developer runs the stack from the README |

---

## Open questions to settle before building

1. Component library and visual direction (S0-9).
2. Release notification channel: GitHub only, or also Slack/email.
3. Repo visibility: public, or private on a plan that supports branch protection.
4. Leave rules not in the spec: weekends and public holidays counting, negative balances, carry-forward expiry. Default for Phase 1: calendar days excluding weekends, no holidays, no negative balance; carry-forward applied by admin adjustment only.
5. Who creates the first admin: bootstrap via env vars in the seed (default).

## Retro log
<!-- Append after each sprint: what shipped, what slipped, what to change. -->
