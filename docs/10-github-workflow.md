# GitHub Workflow — Issues, Projects, PRs, Releases

Replaces the sprint board artifact as the live tracker; the artifact stays as a planning reference only (scope, order, done-when), never for progress. There is no Jira; GitHub Issues + a GitHub Project (v2) give the same traceability.

## Where things live

| Thing | Tool | Rule |
|---|---|---|
| Sprint plan baseline (scope, how, done-when) | `docs/07-sprint-execution.md` | Changed only when scope or approach changes, in a PR |
| Ticket (live status, discussion) | GitHub Issue, one per ticket | Created from the *Sprint ticket* template |
| Sprint | GitHub Milestone `Sprint N — vX.Y.0` | Every issue and the release PR belong to one |
| Board and observability | GitHub Project "HRMS Roadmap" | Board, table and roadmap views |
| Code change | PR from `feature/*` to `dev` | Must contain `Closes #<issue>` |
| Release | PR `dev` → `main`, tag, GitHub Release | Lists all issues in the milestone |

## Issue ↔ branch ↔ PR

1. Issue exists, is in the current milestone, and is moved to **Ready**.
2. Branch from `dev`: `feature/s1-login-endpoint` (sprint + short name). Move issue to **In progress**.
3. Commits reference the issue: `feat: add login endpoint (#12)`.
4. Open a PR into `dev`. Body has `Closes #12`. Issue moves to **In review**.
5. CI green, Claude review comments resolved, user approves, squash merge. The issue closes and moves to **Done** automatically.

One issue, one branch, one PR. Anything discovered mid-ticket becomes a new issue, not scope creep.

## Labels

- Type: `type:feature`, `type:bug`, `type:design`, `type:docs`, `type:chore`
- Area: `area:backend`, `area:frontend`, `area:db`, `area:infra`, `area:ux`
- Sprint: `sprint:0` … `sprint:4`
- Status flags: `blocked`, `needs-decision`
- Priority: `p0` (data loss, security, broken `main`), `p1`, `p2`

## Milestones

`Sprint 0 — v0.1.0`, `Sprint 1 — v0.2.0`, `Sprint 2 — v0.3.0`, `Sprint 3 — v0.4.0`, `Sprint 4 — v1.0.0`. A milestone is done when all its issues are closed and the release PR is merged and tagged.

## Project "HRMS Roadmap"

- Owner: the `vaibhavsna` account, linked to the `HRMS` repo.
- Fields: **Status** (Backlog, Ready, In progress, In review, Done), **Sprint** (iteration or milestone), **Ticket** (S1-2), **Area**, **Priority**.
- Views: *Board* grouped by Status for the current sprint; *Sprint table* grouped by milestone; *Roadmap* by sprint dates; *Blocked* filtered on `label:blocked`.
- Built-in workflows on: item added → Backlog; PR opened and linked → In review; issue closed or PR merged → Done.

## Observability checklist (sprint review)

- Every open PR links an issue; every issue in the sprint has an owner, a label set and a milestone.
- Nothing in **In progress** older than 3 days without a comment.
- Burn-down read from the milestone's open/closed count.
- Release PR body lists all closed issues of the milestone.

## Release notices

When a release PR merges into `main`, `release-notify.yml` creates the GitHub Release for the tag, with notes generated from the merged PRs, and mentions the owner (GitHub notification). Extra channels (email, Slack) are added there if wanted.

## Setup (one-time, needs `gh auth login` with `repo` and `project` scopes)

1. Create labels and milestones.
2. Create the Project and link it to the repo.
3. Create one issue per ticket in `docs/07` using the ticket template, with the full overview, scope, approach, done-when, test plan and dependencies, then add them to the Project.
4. Keep the sprint artifact as a planning reference: remove progress and status from it and link the Project and issues from it and from the README.
