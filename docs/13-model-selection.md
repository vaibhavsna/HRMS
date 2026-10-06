# Model Selection and Work Division

Which Claude model to use for which kind of task on this project, how much effort to ask for, and how to split work across several agents without them colliding. It builds on the earlier multi-agent playbook and the current model lineup.

Model facts below were taken from the `claude-api` reference on 2026-10-06 (cached 2026-09-25). Re-check the table when a new model ships.

## 1. The lineup

| Model | ID | Context | Input / Output per 1M tokens | Use it for |
|---|---|---|---|---|
| Claude Fable 5.1 | `claude-fable-5-1` | 1M | $10 / $50 | The hardest reasoning and long-horizon agentic work. Thinking is always on, turns can run many minutes. |
| Claude Opus 5.5 | `claude-opus-5-5` | 1M | $4 / $20 | Planning, architecture, security and data-integrity work, final reviews. The default top tier. |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 1M | $2 / $10 | Day-to-day implementation of well-specified tickets, tests, docs, routine reviews. |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | $1 / $5 | Mechanical and read-only work: search, renames, log reading, formatting, summaries. |

Opus 5.5 costs only twice Sonnet 5.5, so using it at the decision points is cheap. Fable 5.1 costs 2.5 times Opus 5.5, so it is reserved for the tickets where Opus 5.5 has already struggled.

Behaviour to remember:
- On Fable 5.1, Opus 5.5 and Sonnet 5.5, thinking cannot be switched off with `thinking: disabled`. Effort is the control.
- Opus 5.5 defaults to effort `medium`. Set the level explicitly on anything that matters. Sonnet 5.5 and Fable 5.1 default to `high`.
- Fable 5.1 requires 30-day data retention and is not available under zero data retention.
- Do not put real employee data in any prompt, on any model. Use synthetic data in tests and seeds.

## 2. Effort levels

Effort has five levels: `low`, `medium`, `high`, `xhigh`, `max`.

| Effort | Use |
|---|---|
| `low` | Sub-agents, lookups, simple edits, formatting, summaries |
| `medium` | Routine tickets with a clear spec, docs, standard CRUD |
| `high` | Default for implementation where correctness matters |
| `xhigh` | Coding and agentic work on hard tickets: auth flow, RBAC, Leave transactions, migrations |
| `max` | Only when correctness matters more than cost and a lower level has been shown to fall short |

Before building a cascade of several models, try the single better model at lower effort on the same task. Judge cost per finished ticket, not per request: a cheaper model that needs three more rounds is not cheaper.

## 3. Task type to model

| Task | Model | Effort | Why |
|---|---|---|---|
| Explore the repo, find usages, read logs, list files | Haiku 4.5 | low | Read-only and mechanical |
| Rename, move files, mechanical refactors, formatting | Haiku 4.5 | low | Low risk, well defined |
| Write docs, READMEs, issue bodies, PR descriptions | Sonnet 5.5 | medium | Clear structure, low risk |
| Standard CRUD endpoint from the spec, DTO and Zod schema | Sonnet 5.5 | medium to high | Well specified |
| React screen from an approved wireframe | Sonnet 5.5 | high | Specified, checked visually |
| Unit and integration tests for a specified behaviour | Sonnet 5.5 | high | Specified |
| CI and workflow YAML, config, scripts | Sonnet 5.5 | high | Checked by running |
| Ticket breakdown, API or schema design, cross-module design | Opus 5.5 | high | Expensive to get wrong |
| Auth, token handling, RBAC middleware, data scoping | Opus 5.5 | xhigh | Security-critical |
| Leave approve, reject, cancel, balance transactions, concurrency | Opus 5.5 | xhigh | Data integrity |
| Migrations that alter or drop data, soft-delete changes | Opus 5.5 | xhigh | Hard to reverse |
| PR review of ordinary changes | Sonnet 5.5 | high | Good value |
| PR review of auth, RBAC, migrations, or any `dev` to `main` release PR | Opus 5.5 | xhigh | Last line of defense |
| Debugging that failed twice on a lower tier | one tier up | high | Escalation rule below |
| A problem Opus 5.5 at `xhigh` could not crack | Fable 5.1 | high | Most capable, slowest, priciest |

### Plan on the top tier, implement one tier down
For security-critical or data-integrity tickets: the plan and the final review are done by Opus 5.5, and implementation may be done by Sonnet 5.5 against that plan. For ordinary tickets, Sonnet 5.5 plans and implements, and Opus 5.5 reviews only the release PR.

### Escalate and de-escalate
- Escalate one tier when a ticket fails the same check twice, when the work turns out to touch auth, money or data deletion, or when the diff crosses module boundaries.
- De-escalate when the work has become repetitive boilerplate once the first example is approved (the second to tenth CRUD module can use Sonnet 5.5 at `medium`).
- Never change the model silently to save cost on a security-critical ticket. Say so in the PR.

## 4. In Claude Code

- Session model: start sessions that will plan or review on Opus 5.5. Start implementation sessions on Sonnet 5.5. Switch with `/model`.
- Sub-agents: pass the `model` option on the Agent tool. Explore and read-only sub-agents use Haiku. Workers use Sonnet. Reviewers use Opus.
- Plan mode before any ticket that touches more than one module or any critical area. The plan is written down in the issue or PR description.
- Fast mode (Opus) is for interactive work where waiting hurts, not for batch or CI work.

## 5. In CI (`claude-review.yml`)

| PR | Model | Effort |
|---|---|---|
| Into `dev`, ordinary files | Sonnet 5.5 | high |
| Into `dev`, touching `backend/prisma/migrations/**`, `backend/src/modules/auth/**`, RBAC or `backend/src/middleware/**` | Opus 5.5 | xhigh |
| Release PR `dev` to `main` | Opus 5.5 | xhigh |

The review follows the checklist in [12-coding-standards.md](./12-coding-standards.md) section 12. Findings must name the file and line and say what breaks. The workflow chooses the model from the changed paths.

## 6. Dividing work across agents

Use several agents only when the work splits into independent pieces. Two to four agents is the useful range. More than that costs more in coordination and review than it saves.

1. **Explore first.** Haiku explorers map the code and the existing patterns for the ticket.
2. **Draft the split.** An Opus 5.5 pass proposes pieces, each with the exact files it may edit, and the shared seams between pieces.
3. **Grill-me step.** Before locking the split, the lead interviews the user on the unclear points: priorities, ordering, any file that two pieces want, risk tolerance for touching existing code.
4. **Fix the seams first.** Shared things (types, the error envelope, permission constants, the Prisma schema) are written and merged before the parallel work begins. Nobody edits another agent's files to satisfy an interface.
5. **Ownership rule.** Every path belongs to exactly one agent. No path appears in two lists. Check with `git diff --stat` per branch that each agent stayed inside its list.
6. **Isolation.** Concurrent agents each get their own git worktree and `feature/*` branch. Agents never merge each other's branches.
7. **One coordinator.** The user or an Opus pass owns merge order and resolves boundary conflicts.
8. **Integrate.** After merge, an Opus review pass checks naming, contracts and duplicated logic across the boundaries.

### Where parallel work fits in this project

| Sprint | Parallel | Must be sequential or single-agent |
|---|---|---|
| 0 | Postgres (S0-4), Vite skeleton (S0-7), CI workflows (S0-8) can run beside the backend chain | Root tooling (S0-3), then lint standards, then Prisma (S0-5), then Express (S0-6) |
| 1 | Users and Roles API (S1-6) after the middleware exists. Tests (S1-7) alongside | Seed (S1-1), login (S1-2), refresh and logout (S1-3), middleware (S1-5) share `modules/auth` and `middleware/`, so one agent, top tier |
| 2 | Departments, Job Positions (S2-1) and the Employees API (S2-2) in parallel with the frontend shell (S2-3) once the API contract is fixed | Employee screens (S2-4) after both |
| 3 | Leave Types (S3-1) and the frontend screens (S3-5) once contracts are fixed | Balances, requests and the approve/reject/cancel transactions (S3-2 to S3-4) are one agent on Opus 5.5 at `xhigh`: one set of invariants |
| 4 | Accessibility pass (S4-4) and docs (S4-5) | Silent refresh and error handling (S4-1, S4-2) share the API client, so one agent |

## 7. Adding the model to a ticket

Every issue created from the ticket template has a *Suggested model* line and a *Split* line (single agent, or the owned paths for each agent). The reviewer can change the model, and the PR notes it when the model differs from the suggestion.

## 8. Cost and safety guardrails

- Prefer lower effort on the strongest model that fits over a chain of different models. Caches are per model, so a cascade loses cache reuse.
- Check `stop_reason` handling and refusals when code calls the API directly. This project's code does not call the Claude API, so this applies only to CI and tooling.
- Keep API keys in GitHub secrets (`ANTHROPIC_API_KEY`). Never in the repository, never echoed in logs.
- Review monthly: which tickets needed an escalation, and whether the default tiers in section 3 still fit.
