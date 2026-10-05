# The Conversion Point — From Architecture to Implementation

## Purpose

Every other document in `docs/` describes what to build. This document answers a different question: **at exactly which point does this project stop being documentation and start being code?** Without a hard line, it's easy for "just add a health endpoint" or "just scaffold the Prisma schema" to happen piecemeal, outside any milestone, with no clear record of when the project actually left the planning stage.

## Current state

As of this document, `hrms-platform/` contains:

- All 6 architecture/spec documents (`00` through `05`) plus this one.
- A folder skeleton only: `backend/` and `frontend/` have placeholder `package.json`/`README.md` files and empty module/feature directories (`.gitkeep` only — no source files).
- No `git` repository has been initialized.
- No dependency has been installed, no `schema.prisma` exists, no Express app boots, no Vite app boots.

This is **pre-conversion**. Nothing here runs.

## The conversion point

**The conversion happens at Phase 1, Milestone M0 ("Repo scaffold") in [05-roadmap.md](./05-roadmap.md).** M0 is the first milestone whose deliverables are executable code rather than prose or a folder shape. Everything from M0 onward is implementation; everything before it — including this document set — is planning.

This is a deliberate, narrow scope for M0: it proves the architecture is *alive* (every layer boots and talks to the next one) before any business logic (Auth, Employee, Leave) is written in M1–M3. M0 is infrastructure, not features.

## Go / no-go checklist before starting M0

All of the following should be true before work on M0 begins — if any is false, resolve it first rather than starting code on an unsettled foundation:

- [ ] The user has reviewed `docs/00` through `05` and raised any objections or changes.
- [ ] No open question remains about the Phase 1 schema ([02-database-schema.md](./02-database-schema.md)) or API surface ([03-api-specification.md](./03-api-specification.md)) — changing either after real code and migrations exist is more expensive than changing a markdown table now.
- [ ] Node.js (version supporting the chosen TypeScript/Prisma versions) and Docker are available in the dev environment, since M0 needs both to run anything.
- [ ] The user has explicitly said to proceed — this document does not itself authorize starting M0; it only defines what M0 means once authorized.

## Exit criteria — what "M0 done" looks like

M0 is complete when all of the following are true, verifiable by running commands, not by reading code:

1. `git init` has been run and the existing docs/skeleton are committed.
2. `npm install` at the repo root succeeds and installs both workspaces.
3. `docker compose up -d` starts PostgreSQL and it accepts connections on the configured port.
4. `backend/prisma/schema.prisma` exists, modeling exactly the Phase 1 entities in [02-database-schema.md](./02-database-schema.md) (User, Role, Permission, RolePermission, UserRole, Employee, Department, JobPosition, LeaveType, LeaveRequest, LeaveBalance) — no Phase 2 tables yet.
5. `prisma migrate dev` runs cleanly against the Dockerized database, producing the first committed migration.
6. The Express app boots (`npm run dev -w backend`) and `GET /health` returns `{ status: "ok" }` — no auth, no business routes yet, just proof the server, middleware chain, and config loading (including fail-fast env validation) work.
7. The Vite app boots (`npm run dev -w frontend`) and renders a blank/placeholder page — proof the frontend toolchain works, before any real feature UI exists.
8. The CI workflow described in [04-repo-structure.md](./04-repo-structure.md#cicd) runs on a pushed branch and passes (install, lint, typecheck; test and migrate-diff steps may be no-ops at this point since there's nothing to test yet).

## What is explicitly NOT part of M0

To keep the conversion point unambiguous, M0 does **not** include: login/JWT logic, any Employee or Leave endpoint beyond `/health`, any React screen beyond a placeholder, or RBAC middleware. Those belong to M1 (Auth & RBAC), M2 (Employee Management), and M3 (Leave Management) respectively, each a separate milestone with its own exit criteria to be written when that milestone starts.
