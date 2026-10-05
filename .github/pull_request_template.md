## Linked issue
<!-- Required. Use "Closes #123" so merging closes the ticket. Release PRs list every issue in the sprint. -->
Closes #

## What and why


## How it was tested
<!-- Commands run and what you observed. "Not run" is acceptable only if stated. -->

## Risk
<!-- Schema changes, data deletion, auth/RBAC changes, new dependencies. Rollback note for any migration that drops or rewrites data. -->

## Checklist
- [ ] Targets `dev` (or `main` for a release/hotfix PR only)
- [ ] One issue, branch named `feature/<sprint>-<name>`
- [ ] Every "Done when" item on the issue is met
- [ ] Lint, typecheck, tests pass
- [ ] Tests added for new logic / bug fix
- [ ] Docs updated (schema, API, sprint doc) if behaviour changed
- [ ] No secrets, `.env` files, or real employee data
- [ ] Migrations are new files; no applied migration edited
