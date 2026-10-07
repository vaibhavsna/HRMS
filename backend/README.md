# backend

Express + TypeScript REST API, PostgreSQL via Prisma.

Not yet implemented. See [../docs/01-architecture.md](../docs/01-architecture.md), [../docs/02-database-schema.md](../docs/02-database-schema.md), and [../docs/03-api-specification.md](../docs/03-api-specification.md) for what to build, and [../docs/05-roadmap.md](../docs/05-roadmap.md) for the Phase 1 milestone order (M0 repo scaffold → M1 Auth/RBAC → M2 Employee Management → M3 Leave Management → M4 integration polish).

## Folder layout

- `src/modules/<name>/` — one folder per module (`auth`, `users`, `employees`, `departments`, `job-positions`, `leave`), each with routes/controller/service/schema files once implemented
- `src/middleware/` — CORS, auth, RBAC, validation, error handler
- `src/config/` — environment loading and validation
- `prisma/schema.prisma` — data model; `prisma/seed*.ts` — the seed (see below)

## Seeding

`npm run db:seed -w backend` (after `docker compose up -d` and `npm run prisma:deploy -w backend`) creates the four roles, the 30 permissions and the role grants from the permission appendix in [../docs/03-api-specification.md](../docs/03-api-specification.md). It is safe to run again: it only adds or confirms rows, never removes a grant, and changes nothing the second time.

To create the first admin, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env` (both, or neither). The password is stored as a bcrypt hash (cost 12). If an account with that email already exists it is left exactly as it is, including its password, so re-running the seed can never reset it.

The data lives in `prisma/seed-data.ts`; change it together with the appendix in docs/03.
