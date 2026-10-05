# frontend

React + TypeScript SPA, scaffolded with Vite, using TanStack Query for server state.

Not yet implemented. See [../docs/01-architecture.md](../docs/01-architecture.md) for the auth flow (access token in memory, refresh token in an httpOnly cookie) and [../docs/03-api-specification.md](../docs/03-api-specification.md) for the API it talks to.

## Folder layout

- `src/features/` — one folder per module (`auth`, `employees`, `leave`, ...)
- `src/components/` — shared/presentational components
- `src/api/` — typed API client, one file per resource
