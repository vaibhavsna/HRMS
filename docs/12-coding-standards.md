# Coding Standards

The standard every PR is reviewed against, by people, by the CI Claude review, and by Claude when it writes code. Where a rule is enforced by tooling, the tool is named; the rest is checked in review. A deviation needs a note in the PR and, if it will repeat, a change to this file.

Related: [04-repo-structure.md](./04-repo-structure.md) (layout), [03-api-specification.md](./03-api-specification.md) (API), [08-engineering-guardrails.md](./08-engineering-guardrails.md) (process and safety).

## 1. TypeScript (both apps)

- Strict mode on, plus `noUncheckedIndexedAccess` (set in `tsconfig.base.json`). Enforced by `npm run typecheck`.
- No `any`, no `@ts-ignore`, no `@ts-expect-error` without a reason on the same line. Enforced by ESLint.
- Prefer `unknown` and narrow it. Parse external data with Zod instead of casting.
- Use `import type` for type-only imports. Enforced by ESLint.
- Named exports only. Default exports are allowed for config files that require them.
- Backend is ESM (`"type": "module"`, NodeNext). Relative imports end in `.js`.
- Prefer `const`, plain functions and small modules. Use classes only where the language needs them, such as `AppError`.
- No dead code, no commented-out code, no `TODO` without an issue number (`// TODO(#42): ...`).

## 2. Naming and files

| Thing | Convention | Example |
|---|---|---|
| Files and folders | kebab-case | `job-positions/`, `leave-request.service.ts` |
| Types, classes, React components | PascalCase | `AppError`, `EmployeeForm` |
| Variables, functions | camelCase | `resolveApprover` |
| Constants | `UPPER_SNAKE_CASE` for true constants only | `MAX_PAGE_SIZE` |
| DB tables and columns | snake_case via `@map` | `leave_requests.start_date` |
| Permissions | `resource:action`, defined once in a constants file | `leave_request:approve` |
| Booleans | `is`/`has`/`can` prefix | `isActive` |

Backend module layout (from `docs/04`): `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts`, with unit tests beside the file as `*.test.ts` and API tests under `backend/tests/integration/`.

## 3. Backend layering

```
routes  ->  controller  ->  service  ->  Prisma
(wiring)    (HTTP only)     (rules)      (data)
```

- **Routes** declare path, middleware (`authenticate`, `requirePermission`, `validate`) and the controller. Nothing else.
- **Controllers** read the validated request, call one service function, shape the response envelope. No business rules, no Prisma.
- **Services** hold all business rules, authorization scoping and database access. They take plain typed inputs and return plain data. They do not import Express types.
- Prisma Client is imported only in services, seed scripts and tests. Enforced by ESLint `no-restricted-imports`.
- Modules do not import each other's internals. Cross-module calls go through the other module's exported service functions.
- A function does one thing. If a function needs a comment to explain what a block does, split it.

## 4. Validation and errors

- Every request body, query and param is validated with a Zod schema in `*.schema.ts` through the `validate` middleware. Services trust only validated input.
- Environment variables are read once in `src/config/env.ts` and passed down. No `process.env` elsewhere.
- Throw `AppError(code, message, details?)` for expected failures. Codes and statuses are fixed by `docs/03`: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409.
- Express 5 forwards rejected promises to the error handler. Write plain `async` handlers, with no `try/catch` that only rethrows and no async wrapper helpers.
- Never leak stack traces, SQL or Prisma error text to clients. Map Prisma errors (`P2002` unique violation to `CONFLICT`, `P2025` to `NOT_FOUND`) inside the service.
- Same message for unknown email and wrong password on login.

## 5. Database

- All schema changes go through `prisma migrate dev` and produce a new migration. Applied migrations are never edited. A migration that drops or rewrites data needs a rollback note in the PR.
- Soft delete: every read filters `deletedAt: null`. Use one shared helper per service, not hand-written filters in each query. Hard deletes of HR records are not allowed in code.
- Use `Decimal` for leave days and any money. Use date-only columns for dates without a time. Never use floats for either, and never do timezone arithmetic on date-only values.
- Anything that changes more than one row, or that reads then writes a balance, runs in `prisma.$transaction` with the lock or isolation it needs. Leave approve, reject and cancel are always one transaction.
- Select only what is needed (`select`/`include`). No queries inside loops; batch with `in` or a join.
- List endpoints are paginated with `page`/`limit` (default 20, max 100), and `sort` accepts only a whitelist of fields.
- Seed scripts are idempotent (upsert).

## 6. API conventions

- Base path `/api/v1`. Success envelope `{ data }` or `{ data, meta }`. Error envelope `{ error: { code, message, details } }`. Both defined in `docs/03`.
- JSON keys are camelCase. Dates are ISO 8601 strings, date-only fields are `YYYY-MM-DD`.
- `PATCH` accepts partial bodies, `DELETE` is a soft delete and returns `204`.
- A route without `requirePermission` must be listed as public in `docs/03`. Otherwise it is a bug.
- Scope data in the service, not only in the route: an employee sees their own records, a manager their reports, HR everything.

## 7. Security and logging

- bcrypt cost 12. Access token in memory on the client, refresh token in an `httpOnly`, `secure`, `SameSite=strict` cookie.
- Secrets only from environment variables. `.env` files are never committed, read by tools, or logged.
- Log with pino. Request logs carry a request id and never bodies. Redact `authorization`, `cookie`, `set-cookie`, passwords and tokens.
- `console.*` is for process startup and shutdown only (`src/index.ts`). Everything else uses the logger. Enforced by ESLint.
- Rate limit `/auth/login` and `/auth/refresh`. Apply `helmet` and a CORS allow-list with credentials.
- No PII (names, emails, phone, birth dates) in logs or error messages.
- New dependencies: state the package, why, and its maintenance status in the PR. Prefer the platform and existing dependencies first.

## 8. Testing

| What | How |
|---|---|
| Pure logic, Zod schemas, env parsing, helpers | Vitest unit tests beside the file |
| Endpoints, middleware, RBAC, scoping | Supertest integration tests against the dedicated test database, migrated fresh per run |
| Leave approve, reject, cancel and balance maths | Full transition matrix, plus a concurrency test |
| React components and hooks that hold logic | Vitest + React Testing Library |

- Test names say behaviour: `rejects login for an inactive user`, not `test login 2`.
- Arrange, act, assert. One behaviour per test. Build data with small factory functions, not shared mutable fixtures.
- No real time, network or randomness in tests: inject a clock and seed ids.
- A bug fix includes a test that fails without the fix.
- Never skip, delete or weaken a test to get green. A flaky test is a bug to fix, not retry.
- Coverage is a signal, not a target. New logic and every branch of an authorization rule are tested.

## 9. Frontend

- Structure: `src/features/<module>/` for screens, hooks and components of one module, `src/components/` for shared presentational components, `src/api/` for the typed API client. Components never call `fetch` directly.
- Server state lives in TanStack Query with a query-key factory per resource. No server data copied into local state.
- Forms use the same Zod rules as the backend where practical, and show server field errors from the error envelope.
- Every data screen has loading, empty and error states, works with the keyboard, has visible focus, and holds up at phone width (about 400 px).
- Styling uses only the tokens and components from the UI foundation (S0-9). No ad hoc colors, spacing or fonts per screen.
- Access token in memory only. No secrets in the bundle. Only `VITE_*` variables are read.
- Accessibility baseline: semantic elements, labels on every control, no information conveyed by color alone, contrast at least WCAG AA.

## 10. Git, commits and PRs

- Branches: `feature/<sprint>-<short-name>` from `dev`. One ticket, one branch, one PR. See `docs/10`.
- Conventional commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`. Subject in the imperative, under 72 characters, with the issue number.
- A PR is under about 400 changed lines. Larger work is split into tickets first.
- A PR does what its ticket says and nothing else. Findings outside scope become new issues.
- Comments explain why, not what. No banner comments, no changelog comments, no restating the code.
- Update the docs in the same PR when behaviour, schema or API changes.

## 11. How these are enforced

| Rule | Where it is enforced |
|---|---|
| Formatting | Prettier, `npm run format:check`, CI |
| `any`, ts-ignore, unused code, floating promises, type imports | ESLint (type-aware), CI |
| Prisma only in services, no stray `console` | ESLint `no-restricted-imports`, `no-console` |
| Strict typing | `npm run typecheck`, CI |
| Tests, schema drift | `npm test`, `prisma migrate diff`, CI |
| Layering, soft-delete filtering, transactions, scoping, naming | Review checklist below, applied by the CI Claude review and the human reviewer |
| Branch and PR rules | GitHub branch protection and the PR template |

## 12. Review checklist (used by humans and the Claude review)

Check in this order, and stop at the first serious finding class:

1. Correctness against the ticket's "Done when" and the specs in `docs/02` and `docs/03`.
2. Security: validation at every boundary, RBAC and data scoping in the service, no secrets or PII in logs, no new dependency without justification.
3. Data safety: migrations append-only, soft delete respected, transactions for multi-row changes, `Decimal` and date-only types.
4. Tests: new logic and bug fixes covered, authorization branches tested, no weakened tests.
5. Layering and naming per sections 2 and 3.
6. Frontend states, accessibility and token usage per section 9.
7. Style and clarity, last. Formatter and linter findings are not review comments.
