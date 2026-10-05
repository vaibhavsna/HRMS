# Overview & Vision

## What this project is

**hrms-platform** is a clean-room Human Resource Management System built with a decoupled **React frontend** and **Node.js (Express) backend**, backed by **PostgreSQL**.

The feature scope is inspired by the publicly listed modules of [Horilla HRMS](https://github.com/horilla/horilla-hr), an open-source Django/Python HRMS. This project does **not** reuse any of Horilla's code, database schema, or business logic — Horilla's README is used only as a reference list of what an HRMS should cover. Every data model, API contract, and UI in this project is designed from scratch for this stack.

## Why a separate React + Node stack instead of Django

- **Decoupling**: frontend and backend evolve, deploy, and scale independently. The backend is a pure JSON API; any client (web, mobile, integrations) can consume it.
- **Team fit**: Express + React is a widely known combination, with a large ecosystem of typed tooling (TypeScript, Prisma, Zod) that keeps a multi-module system maintainable as it grows.
- **No inherited constraints**: starting fresh avoids carrying over any Django-specific modeling decisions or technical debt from the reference project.

## Goals

- Reach feature parity with Horilla's 9 listed HR modules, delivered in two phases (see [05-roadmap.md](./05-roadmap.md)).
- Keep the backend a clean, versioned REST API (`/api/v1`) consumable independently of the React app.
- Keep the data model relationally sound from day one — Phase 1's schema is designed so Phase 2 modules can be added without reworking existing tables.

## Non-goals (out of scope for now)

- **LDAP integration** — Horilla mentions it for Employee Management; not planned until explicitly requested.
- **Biometric device integration** — mentioned for Attendance & Time Tracking; deferred, plain check-in/out only for now.
- **Multi-tenancy** — single organization per deployment for both phases.
- **Mobile apps** — the API is mobile-ready (stateless REST + JWT), but no native app is in scope.

## Phased roadmap summary

| Phase | Modules | Status |
|---|---|---|
| Phase 1 | Auth & RBAC, Employee Management, Leave Management | Planned (this document set) |
| Phase 2 | Recruitment, Onboarding & Offboarding, Attendance & Time Tracking, Payroll, Performance Management, Asset Management, Helpdesk | Planned, sequenced in [05-roadmap.md](./05-roadmap.md) |

## Document index

1. [01-architecture.md](./01-architecture.md) — system architecture, request flow, auth flow, deployment shape
2. [02-database-schema.md](./02-database-schema.md) — Phase 1 schema in full, Phase 2 sketch
3. [03-api-specification.md](./03-api-specification.md) — REST conventions and the Phase 1 endpoint list
4. [04-repo-structure.md](./04-repo-structure.md) — monorepo layout and dev workflow
5. [05-roadmap.md](./05-roadmap.md) — milestones and module sequencing
6. [06-conversion-point.md](./06-conversion-point.md) — the exact point where this project moves from documentation to real code, and the checklist/exit criteria around it
