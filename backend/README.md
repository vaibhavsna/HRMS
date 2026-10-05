# backend

Express + TypeScript REST API, PostgreSQL via Prisma.

Not yet implemented. See [../docs/01-architecture.md](../docs/01-architecture.md), [../docs/02-database-schema.md](../docs/02-database-schema.md), and [../docs/03-api-specification.md](../docs/03-api-specification.md) for what to build, and [../docs/05-roadmap.md](../docs/05-roadmap.md) for the Phase 1 milestone order (M0 repo scaffold → M1 Auth/RBAC → M2 Employee Management → M3 Leave Management → M4 integration polish).

## Folder layout

- `src/modules/<name>/` — one folder per module (`auth`, `users`, `employees`, `departments`, `job-positions`, `leave`), each with routes/controller/service/schema files once implemented
- `src/middleware/` — CORS, auth, RBAC, validation, error handler
- `src/config/` — environment loading and validation
- `prisma/schema.prisma` — data model (not yet created)
