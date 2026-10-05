# Roadmap

## Phase 1 — Core foundation

Goal: prove the full architecture end-to-end (schema → API → React UI → auth/RBAC) on a small, real vertical slice before expanding to the rest of the feature set.

| Milestone | Scope |
|---|---|
| M0 — Repo scaffold | Monorepo skeleton (this document set), npm workspaces, lint/format config, Docker Compose for Postgres, backend `schema.prisma` for Phase 1 tables, initial migration |
| M1 — Auth & RBAC | `User`, `Role`, `Permission` tables; login/refresh/logout endpoints; auth + RBAC middleware; seed script for default roles |
| M2 — Employee Management | `Employee`, `Department`, `JobPosition` CRUD endpoints and React screens (list, create/edit, org-chart-lite via `manager_id`) |
| M3 — Leave Management | `LeaveType`, `LeaveRequest`, `LeaveBalance`; submit/approve/reject/cancel workflow; balance deduction logic; React screens for request submission and manager approval queue |
| M4 — Integration polish | End-to-end auth flow in the React app (silent refresh, protected routes), error-envelope handling in the API client, basic test coverage on the Leave approval workflow (the module with the most business logic) |

## Phase 2 — Remaining modules

Sequencing rationale (not strict dependencies, but a sensible build order):

| Order | Module | Why here |
|---|---|---|
| 1 | Onboarding & Offboarding | Extends `Employee.employment_status` transitions already modeled in Phase 1; natural next step after Employee Management is solid |
| 2 | Recruitment | Feeds *into* Employee Management (an accepted `Offer` creates an `Employee`); easier once Employee creation is stable |
| 3 | Attendance & Time Tracking | Independent of the above two; moderate complexity, no payroll dependency yet |
| 4 | Performance Management | Reuses the `Employee.manager_id` hierarchy and approval-workflow pattern already proven in Leave Management |
| 5 | Asset Management | Straightforward CRUD + assignment history against `Employee`; low risk, can slot in anytime |
| 6 | Helpdesk | Mostly self-contained (tickets + comments); low coupling to other modules |
| 7 | Payroll | Last, deliberately — it has the heaviest compliance/tax surface and ideally consumes stable Attendance data (for hourly/overtime calculations) and stable Employee data |

Each Phase 2 module gets its own schema/API/UI design pass when its turn comes, following the same doc structure established here (schema → API spec → UI), rather than being fully speced in advance.

## Explicitly out of scope (both phases, for now)

- LDAP integration for authentication
- Biometric device integration for attendance
- Multi-tenancy (multiple organizations per deployment)
- Native mobile apps
