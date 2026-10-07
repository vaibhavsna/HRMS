# Repository & Folder Structure

## Monorepo layout

```
hrms-platform/
├── docs/                           # this document set
│   ├── 00-overview.md
│   ├── 01-architecture.md
│   ├── 02-database-schema.md
│   ├── 03-api-specification.md
│   ├── 04-repo-structure.md
│   └── 05-roadmap.md
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── employees/
│   │   │   ├── departments/
│   │   │   ├── job-positions/
│   │   │   └── leave/
│   │   ├── middleware/              # cors, auth, rbac, validation, error handler
│   │   └── config/                  # env loading/validation
│   ├── prisma/
│   │   └── schema.prisma            # created in the Phase 1 implementation task
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── README.md
├── frontend/
│   ├── src/
│   │   ├── features/                # one folder per module (auth, employees, leave, ...)
│   │   ├── components/               # shared components (form-field, theme-toggle, ...)
│   │   │   └── ui/                   # shadcn/ui primitives, copied in and owned by us (docs/09)
│   │   ├── hooks/                    # shared React hooks
│   │   ├── lib/                      # small helpers (cn, theme)
│   │   ├── styles/                   # design tokens (tokens.css), see docs/09
│   │   └── api/                      # typed API client, one file per resource
│   ├── components.json               # shadcn/ui configuration
│   ├── package.json
│   ├── vite.config.ts                # created in the Phase 1 implementation task
│   ├── .env.example
│   └── README.md
├── docker-compose.yml                 # PostgreSQL only
├── package.json                       # npm workspaces root
├── .gitignore
└── README.md                          # links into docs/
```

Each module folder under `backend/src/modules/<name>/` follows the same internal shape once implemented: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schema.ts` (Zod), keeping route wiring, business logic, and validation separately testable.

## Why a monorepo with npm workspaces

The user chose one repository with separate `/frontend` and `/backend` folders over two independent repos. npm workspaces (declared in the root `package.json`) is the lightest tool that fits this:

- A single `npm install` at the root installs both apps' dependencies.
- Each app still has its own `package.json`, scripts, and dependency tree — they stay decoupled; only the install step and shared dev tooling are centralized.
- No build-system lock-in (e.g. Nx, Turborepo) is needed yet at this scale; it can be introduced later if Phase 2 makes the build graph complex enough to warrant it.

## Shared tooling

- **ESLint + Prettier**: configured once at the repo root, extended by both `backend/` and `frontend/` — one formatting standard across the whole codebase.
- **TypeScript**: each app has its own `tsconfig.json` (different target environments — Node vs. browser), but both extend a shared base config at the root for common compiler options.

## Environment files

- `backend/.env.example` and `frontend/.env.example` are committed, documenting every variable each app needs.
- `backend/.env` and `frontend/.env` hold real values and are gitignored.

## Running both apps in development

A root script runs backend and frontend together:

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev -w backend\" \"npm run dev -w frontend\""
  }
}
```

PostgreSQL must be running first via `docker compose up -d` (see below).

## Testing

- **Backend**: Vitest for unit tests, colocated as `*.test.ts` next to the file under test inside each `src/modules/<name>/`; Supertest for API integration tests under `backend/tests/integration/`, run against a dedicated test database.
- **Frontend**: Vitest + React Testing Library, colocated as `*.test.tsx` next to components/hooks.

See [01-architecture.md](./01-architecture.md#testing--ci) for the full testing/CI rationale.

## CI/CD

A GitHub Actions workflow at `.github/workflows/ci.yml` (created during Phase 1 implementation, not in this skeleton) runs on every pull request: install via workspaces, lint, typecheck, test, and `prisma migrate diff` to catch schema/migration drift before merge.

## `docker-compose.yml`

Contains **only the PostgreSQL service** for local development. The Node apps are deliberately run natively (not containerized) in development, so `npm run dev` gives instant reload without a container rebuild step. Example shape (filled in during the Phase 1 implementation task):

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: hrms
      POSTGRES_PASSWORD: hrms
      POSTGRES_DB: hrms
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```
