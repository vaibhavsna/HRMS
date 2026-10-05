# hrms-platform

A clean-room HR Management System with a decoupled React frontend and Node.js (Express) backend, backed by PostgreSQL. Feature scope is inspired by [Horilla HRMS](https://github.com/horilla/horilla-hr)'s module list; no code from that project is reused.

## Start here

Read the docs in order:

1. [docs/00-overview.md](./docs/00-overview.md) — what this is, goals, non-goals, phased roadmap
2. [docs/01-architecture.md](./docs/01-architecture.md) — system architecture, request flow, auth flow
3. [docs/02-database-schema.md](./docs/02-database-schema.md) — database schema
4. [docs/03-api-specification.md](./docs/03-api-specification.md) — REST API spec
5. [docs/04-repo-structure.md](./docs/04-repo-structure.md) — this monorepo's layout and dev workflow
6. [docs/05-roadmap.md](./docs/05-roadmap.md) — milestones and module sequencing

7. [docs/06-conversion-point.md](./docs/06-conversion-point.md) — go/no-go and exit criteria for starting implementation
8. [docs/07-sprint-execution.md](./docs/07-sprint-execution.md) — sprint-by-sprint tickets: what to do and how
9. [docs/08-engineering-guardrails.md](./docs/08-engineering-guardrails.md) — branching, protection, and stability rules

Working with Claude: rules are in [CLAUDE.md](./CLAUDE.md), with tool-level safety denies in `.claude/settings.json`.

## Status

Architecture and documentation phase. `backend/` and `frontend/` are folder skeletons only — implementation (Prisma schema, Express routes, Vite app) starts in the Phase 1 implementation task described in the roadmap.
