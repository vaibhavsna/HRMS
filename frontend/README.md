# frontend

React + TypeScript SPA, built with Vite, styled with Tailwind CSS and shadcn/ui, using TanStack Query for server state.

No real screens yet: the page you see is a temporary preview of the UI foundation (tokens, app shell, form and table patterns). See [../docs/09-ui-foundation.md](../docs/09-ui-foundation.md) for the design decisions and rules, [../docs/01-architecture.md](../docs/01-architecture.md) for the auth flow (access token in memory, refresh token in an httpOnly cookie) and [../docs/03-api-specification.md](../docs/03-api-specification.md) for the API it talks to.

## Commands

From the repository root:

- `npm run dev -w frontend` — dev server on http://localhost:5173
- `npm run test -w frontend` — Vitest and React Testing Library
- `npm run build -w frontend` — typecheck and production build

## Folder layout

- `src/features/` — one folder per module (`auth`, `employees`, `leave`, ...). `features/foundation-preview/` is temporary and is deleted in S2-3.
- `src/components/` — shared components; `components/ui/` holds the shadcn/ui primitives
- `src/hooks/`, `src/lib/` — shared hooks and helpers
- `src/styles/tokens.css` — design tokens (colours, radius, shell sizes); use these, never raw values
- `src/api/` — typed API client, one file per resource

## Versions

Tailwind CSS 4.3, shadcn/ui CLI 4.21 (Radix base), React 19, Vite 8, Vitest 5. Pinned majors; see `package.json`.
