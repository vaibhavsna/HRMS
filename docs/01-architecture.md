# System Architecture

## Component overview

```
┌──────────────────┐        HTTPS / JSON         ┌──────────────────┐        SQL        ┌──────────────┐
│   React SPA       │ ───────────────────────────▶ │  Express REST API │ ─────────────────▶ │  PostgreSQL   │
│  (Vite, TS)        │ ◀─────────────────────────── │  (Node.js, TS)     │ ◀───────────────── │              │
└──────────────────┘        /api/v1/*              └──────────────────┘      Prisma Client  └──────────────┘
```

- The **React SPA** is a fully static build — it holds no server secrets and talks to the backend only through the versioned REST API.
- The **Express API** is the single source of truth for business rules (validation, RBAC, approval workflows) and the only component allowed to talk to PostgreSQL.
- **PostgreSQL** is accessed exclusively through Prisma Client from the backend; nothing else connects to it directly.

This is a strict client/server split: the frontend never queries the database directly, and the backend never renders HTML — it only returns JSON.

## Request flow

1. Browser loads the React SPA (served as static files by a CDN/static host in production, or the Vite dev server locally).
2. A user action triggers a data fetch via **TanStack Query**, which calls a thin API client (`frontend/src/api/`) built on `fetch`/axios.
3. The request hits Express's middleware chain, in order:
   - **CORS** — only the configured frontend origin is allowed, with `credentials: true` (needed for the refresh-token cookie).
   - **Auth middleware** — verifies the JWT access token from the `Authorization` header; attaches `req.user`.
   - **RBAC middleware** — checks the authenticated user's role/permissions against the route's required permission.
   - **Validation middleware** — validates the request body/query against a **Zod** schema; rejects with a 400 error envelope on failure.
4. The route's **controller** calls into a module's service layer, which uses **Prisma Client** to read/write PostgreSQL.
5. The response is shaped into the standard envelope (see [03-api-specification.md](./03-api-specification.md)) and returned as JSON.
6. TanStack Query caches the response and re-renders the relevant React components.

## Authentication flow

- **Login** (`POST /auth/login`): validates credentials, issues a short-lived **JWT access token** (returned in the response body) and a long-lived **refresh token** (set as an `httpOnly`, `secure`, `SameSite=strict` cookie).
- **Access token storage**: kept in memory in a React context — never in `localStorage`, to limit XSS blast radius.
- **Refresh token storage**: `httpOnly` cookie only — inaccessible to JavaScript, mitigating token theft via XSS.
- **Silent refresh**: when an API call returns `401`, the API client calls `POST /auth/refresh` (which relies on the cookie) to get a new access token, then retries the original request once. If refresh also fails, the user is redirected to login.
- **Logout** (`POST /auth/logout`): clears the refresh-token cookie and revokes the refresh token server-side (stored in a `refresh_tokens` table or Redis in a future iteration; Phase 1 uses a DB table).
- **RBAC**: a user has one or more `Role`s; each `Role` has many `Permission`s (`resource` + `action` pairs, e.g. `leave_request:approve`). Middleware checks a route's declared required permission against the authenticated user's resolved permission set.

## Environment & configuration

- Each app (`backend/`, `frontend/`) owns its own `.env`, with `.env.example` committed and the real `.env` gitignored.
- The backend validates all required environment variables **at process boot** using a Zod schema (`src/config/env.ts`) and fails fast with a clear error if any are missing — never discovers a misconfiguration mid-request.
- Key backend env vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`, `CORS_ORIGIN`, `PORT`.
- Key frontend env vars: `VITE_API_BASE_URL`.

## Deployment shape

**Local development:**
- PostgreSQL runs in Docker via `docker-compose.yml` (the only containerized piece locally).
- Backend and frontend run natively via Node (`npm run dev` in each workspace, or one root script that runs both concurrently) for fast reload.

**Production (target shape, not built in this phase):**
- Frontend: static build (`vite build`) served from a static host/CDN.
- Backend: containerized Node process behind a reverse proxy, horizontally scalable since JWTs make it stateless (aside from the refresh-token table in Postgres).
- Database: managed PostgreSQL instance, separate from the application hosts.

## Security & operational considerations

HR data is sensitive (PII now, salary/tax data once Payroll lands in Phase 2), so these are fixed decisions, not left open:

- **Password hashing**: bcrypt (cost factor 12). Settled here as the single answer — the schema doc previously left this as "bcrypt/argon2"; bcrypt is chosen for Phase 1 since it needs no extra native dependency and is well-supported in Node.
- **Rate limiting**: `express-rate-limit` (or equivalent) on `/auth/login` and `/auth/refresh` specifically, to blunt credential-stuffing and brute-force attempts against the only two unauthenticated routes. Decided in Sprint 1: `express-rate-limit`, counting only failed requests per client address (10 failed logins and 30 failed refreshes per 15 minutes by default, set with `RATE_LIMIT_WINDOW`, `LOGIN_RATE_LIMIT_MAX`, `REFRESH_RATE_LIMIT_MAX`), so people who sign in correctly are never locked out by their own use. The counters are in memory, so with several backend instances the limit applies per instance; move to a shared store (for example Redis) if that becomes too loose. Behind the reverse proxy, set `TRUST_PROXY_HOPS` to the number of proxies so the client address is read from `X-Forwarded-For`; left at 0 the header is ignored, so it cannot be used to dodge the limit.
- **Security headers**: `helmet` applied globally in the Express middleware chain (sets `X-Content-Type-Options`, `X-Frame-Options`, a baseline `Content-Security-Policy`, etc.).
- **Logging**: structured logging (e.g. `pino`) with a request ID attached to every log line for traceability; passwords, tokens, and full request bodies for auth routes are explicitly excluded from log output. Two layers enforce this: the request log records only the id, method, URL and status (never headers or bodies), and pino redaction blanks `authorization`, `cookie`, `set-cookie`, request bodies and any `password`, `passwordHash`, `accessToken`, `refreshToken`, `token` or `tokenHash` field that reaches a log call anyway. A test runs every auth route, including failures and the rate limit, and checks that no password, token, cookie or hash appears in the captured logs.
- **Transport**: HTTPS enforced in production (terminated at the reverse proxy); cookies are marked `secure` so they're never sent over plain HTTP outside local dev.

## Testing & CI

- **Backend**: Vitest for unit tests (services, validation schemas) and Supertest for API integration tests run against a dedicated test database (migrated fresh per test run, not the dev database).
- **Frontend**: Vitest + React Testing Library for component and hook tests.
- **CI**: a GitHub Actions workflow runs on every pull request — install (workspaces), lint, typecheck, test, and `prisma migrate diff` to catch schema drift between `schema.prisma` and committed migrations. None of this is set up yet; it's a Phase 1 implementation task (see [05-roadmap.md](./05-roadmap.md)), documented here so the choice is made once rather than improvised per-module.

## Cross-cutting data conventions

Applied to every table from Phase 1 onward, so Phase 2 modules stay consistent:

- **Primary keys**: UUID, not auto-increment integers — avoids enumeration and simplifies merging data across environments.
- **Audit columns**: `created_at`, `updated_at` on every table.
- **Soft deletes**: `deleted_at` (nullable) instead of hard deletes, since HR records (employees, leave history) generally must be retained for compliance/audit even after "removal."
