# backend

Express + TypeScript REST API, PostgreSQL via Prisma.

Built ticket by ticket following [../docs/07-sprint-execution.md](../docs/07-sprint-execution.md). See [../docs/01-architecture.md](../docs/01-architecture.md), [../docs/02-database-schema.md](../docs/02-database-schema.md), and [../docs/03-api-specification.md](../docs/03-api-specification.md) for what to build, and [../docs/05-roadmap.md](../docs/05-roadmap.md) for the Phase 1 milestone order (M0 repo scaffold → M1 Auth/RBAC → M2 Employee Management → M3 Leave Management → M4 integration polish).

## Folder layout

- `src/modules/<name>/` — one folder per module (`auth`, `users`, `employees`, `departments`, `job-positions`, `leave`), each with routes/controller/service/schema files once implemented
- `src/middleware/` — CORS, auth, RBAC, validation, error handler
- `src/config/` — environment loading and validation
- `prisma/schema.prisma` — data model; `prisma/seed*.ts` — the seed (see below)

## Seeding

`npm run db:seed -w backend` (after `docker compose up -d` and `npm run prisma:deploy -w backend`) creates the four roles, the 30 permissions and the role grants from the permission appendix in [../docs/03-api-specification.md](../docs/03-api-specification.md). It is safe to run again: it only adds or confirms rows, never removes a grant (a grant removed from a role later stays removed), and changes nothing the second time except that a built-in role's description is put back to the seed text.

To create the first admin, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env` (both, or neither). The password is stored as a bcrypt hash (cost 12). If an account with that email already exists it is left exactly as it is, including its password, so re-running the seed can never reset it.

The data lives in `prisma/seed-data.ts`; change it together with the appendix in docs/03.

## Tests

`npm test -w backend` runs two sets (see `vitest.config.ts`):

- **unit** (`src/**/*.test.ts`, `prisma/**/*.test.ts`): pure logic, no database.
- **integration** (`tests/**/*.test.ts`): endpoints through Supertest against a real PostgreSQL. Start it with `docker compose up -d`. Before the run, `tests/global-setup.ts` creates the database `hrms_test` if needed, empties it, and applies the migrations in `prisma/migrations`, so a run always starts from the committed schema. Set `TEST_DATABASE_URL` to use another server; its database name **must end in `_test`**, and the setup refuses anything else, so it can never touch the development database.

`tests/helpers/` keeps a test to a few lines:

- `resetDatabase()` and `seedRbac()` (the real roles and permissions) start each test from a known state.
- `createUser({ roles, isActive, deleted })` makes a user; `createUserWithOnly('user:read', ...)` makes one whose only role grants exactly those permissions.
- `apiAs(app, user)` sends requests as that user without logging in; `loginAs(app, user)` goes through the real login and returns the access token and refresh cookie; `accessTokenFor`, `roleId` and `permissionId` fetch the rest.
- `collectLogs()` captures what the app logs; `listRoutes(app)` lists every route with what protects it (`tests/integration/rbac.matrix.test.ts` uses it).

Integration test files run one at a time because they share the database. When you add a route, add it to the table at the top of `rbac.matrix.test.ts` in the same change: the test fails if the table and the app differ.
