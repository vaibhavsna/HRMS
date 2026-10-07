# API Specification — Phase 1

## Conventions

- **Base path**: `/api/v1`
- **Auth**: `Authorization: Bearer <access_token>` header on every route except `/auth/login` and `/auth/refresh`.
- **Content type**: `application/json` for all requests and responses.
- **Account provisioning**: no public self-registration endpoint — accounts are created by an admin/HR user via `POST /users`.

### Success envelope

Single resource:
```json
{ "data": { "...": "..." } }
```

List (paginated):
```json
{
  "data": [ { "...": "..." } ],
  "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 }
}
```

A `POST` that creates a record answers `201 Created` with the new resource. A `POST` that performs an action (login, refresh, approve, assign roles) answers `200`, or `204` when there is nothing to return.

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "start_date must be before end_date",
    "details": { "field": "start_date" }
  }
}
```

Standard `code` values: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

### Authentication and permission errors

Every route except the public ones (`/health`, `/auth/login`, `/auth/refresh`) runs the `authenticate` guard, and every route with a "Required permission" runs `requirePermission`. Both answer in the error envelope:

- No `Authorization` header, or one that is not `Bearer <token>`: `401 UNAUTHENTICATED`, message `Authentication required`.
- A token that is invalid, expired, signed with another key, or belongs to an account that does not exist or is disabled or deleted: `401 UNAUTHENTICATED`, message `Invalid or expired access token`. The message is the same for all of these.
- Signed in, but none of the user's roles holds the permission the route needs: `403 FORBIDDEN`, message `You do not have permission to perform this action`. The response does not name the permission.
- The user's roles and permissions are read from the database on every request. Changing a role, or disabling or deleting an account, applies to the next request, not when the access token expires. A deleted role, grant or permission grants nothing.
- No role is special. `admin` passes a permission check only for the permissions the appendix grants it.

### List query parameters

- `page` (default `1`), `limit` (default `20`, max `100`)
- `sort` — e.g. `sort=-created_at` for descending
- Resource-specific filters documented per endpoint below (e.g. `department_id`, `status`)

## Health

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/health` | none | — | `{ status: "ok" }` — for container/orchestration liveness checks, not part of `/api/v1` |

## Auth

Rate-limited (see [01-architecture.md](./01-architecture.md#security--operational-considerations)): `/auth/login` and `/auth/refresh` are the only unauthenticated routes and the ones credential-stuffing attempts would target.

**Rate limit behaviour:**
- Each client address may make a limited number of **failed** requests to each of the two routes within a window (defaults: 10 failed logins and 30 failed refreshes per 15 minutes; configurable, see `backend/.env.example`). A failed request is one answered with status 400 or above, including a body that fails validation. Successful requests are not counted.
- The next request over the limit gets `429 RATE_LIMITED` in the error envelope (`Too many attempts. Try again later.`) with a `Retry-After` header in seconds and the `RateLimit` and `RateLimit-Policy` headers. While limited, even a correct password is refused and no session is started, and a refresh token that is presented is not used up.
- Login and refresh have separate budgets. The routes that need an access token are not rate limited by this.
- The client address is the socket address, or `X-Forwarded-For` when `TRUST_PROXY_HOPS` says a reverse proxy is in front. Counters are kept in memory per backend instance.

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/login` | none | `{ email, password }` | `{ data: { accessToken, user } }` + sets refresh cookie |
| POST | `/auth/refresh` | refresh cookie | — | `{ data: { accessToken } }` |
| POST | `/auth/logout` | access token | — | `204 No Content`, clears refresh cookie |
| GET | `/auth/me` | access token | — | `{ data: { user, employee, roles, permissions } }` |

**Login behaviour** (`POST /auth/login`):
- `email` is trimmed and compared case-insensitively. `password` is required and at most 200 characters.
- Unknown email, wrong password, a disabled account and a deleted account all return the same `401 UNAUTHENTICATED` with the message `Invalid email or password`. The password is always checked (against a dummy hash when there is no account) so response time does not reveal which case it was.
- On success the body is `{ data: { accessToken, user } }` where `user` is `{ id, email, isActive, lastLoginAt, createdAt }`. The access token is a JWT (HS256) whose only identity claim is the user id (`sub`); roles and permissions are looked up on every request.
- The refresh token is an opaque random value in the cookie `refresh_token`: `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` outside local development, `Max-Age` equal to `REFRESH_TOKEN_TTL`. It never appears in the response body.
- Validation failures return `400 VALIDATION_ERROR` with `details.fields` as a list of `{ field, message }` (for example `body.email`). The message never repeats what the client sent.

**Refresh behaviour** (`POST /auth/refresh`):
- No access token is needed: the `refresh_token` cookie is the credential.
- Success is `200 { data: { accessToken } }` plus a new `refresh_token` cookie with the same attributes as at login. The cookie that was sent is revoked in the same transaction (rotation), and the new one belongs to the same session.
- Every failure is `401 UNAUTHENTICATED` with the message `Invalid or expired refresh token`, and the cookie is cleared. This covers: no cookie, an unknown value (including an access token), an expired token, a revoked token, and a user who is disabled or deleted.
- **Replay detection.** Presenting a token that was already rotated or revoked means it was copied, so every refresh token of that session (that login) is revoked and the real owner has to log in again. The same applies to a disabled or deleted user. Two requests that use the same token at the same moment count as a replay: one succeeds, the other gets 401, and the session ends. Clients must therefore refresh from one place at a time.
- Other sessions (other logins) of the same user, and other users, are not affected.

**Logout behaviour** (`POST /auth/logout`):
- Needs a valid access token. The response is `204` with no body, and the refresh cookie is cleared.
- If the request carries the signed-in user's refresh cookie, that session is revoked on the server, so the token can no longer be refreshed. A refresh cookie that belongs to another user is ignored. Without a cookie the call still succeeds. The user's other sessions stay signed in.
- Access tokens are not stored, so one that was already issued keeps working until it expires (`ACCESS_TOKEN_TTL`, 15 minutes by default). The client discards it.

**Me behaviour** (`GET /auth/me`): needs an access token.
- `user` has the same fields as in the login response.
- `employee` is the linked employee record as `{ id, employeeCode, firstName, lastName, workEmail, departmentId, jobPositionId, managerId, dateJoined, employmentStatus }` (`dateJoined` as `YYYY-MM-DD`), or `null` when the user has no employee record or it is deleted. Birth date, phone, gender and address are not included.
- `roles` are the role names and `permissions` the `resource:action` keys of all the user's roles, both sorted.

## Users

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/users` | `user:read` | — (query: `page`, `limit`, `q`) | paginated `User[]` |
| POST | `/users` | `user:create` | `{ email, password, roleIds[] }` | `User` |
| GET | `/users/:id` | `user:read` | — | `User` |
| PATCH | `/users/:id` | `user:update` | `{ email?, isActive? }` | `User` |
| DELETE | `/users/:id` | `user:delete` | — | `204` (soft delete) |
| POST | `/users/:id/roles` | `user:update` | `{ roleIds[] }` | `User` with resolved roles |

**Users behaviour:**
- `User` is `{ id, email, isActive, lastLoginAt, createdAt, updatedAt, roles: [{ id, name, description }] }`. A password or its hash is never returned.
- `GET /users` takes `page`, `limit` (default 20, at most 100), `q` and `sort`. `q` matches part of the email in any case, and `%` and `_` in it are ordinary characters. `sort` is `email`, `created_at` or `last_login_at`, with a leading `-` for descending (default `-created_at`; accounts that never signed in come last for `last_login_at`). Deleted users are not listed.
- `POST /users` answers `201`. The email is trimmed and lower-cased. The password needs at least 12 characters and at most 72 bytes (bcrypt ignores the rest). `roleIds` is required and may be empty; a role that does not exist or is deleted is `400` on `body.roleIds`. An email already in use, including the email of a deleted user, is `409`.
- `PATCH /users/:id` needs at least one of `email`, `isActive`. Turning an account off ends all of its sessions, and it cannot be turned on again to bring an old session back. An access token issued earlier stops working at once, because the account is checked on every request.
- `DELETE /users/:id` is a soft delete: the user disappears from the API, cannot sign in, and their sessions end. Their email stays reserved.
- `POST /users/:id/roles` **sets** the user's roles: afterwards they hold exactly `roleIds` (an empty list removes them all). The new roles apply from the user's next request.
- **There is always an active admin.** Turning off, deleting, or taking the `admin` role from the last active admin (active, not deleted, holding the `admin` role) is refused with `409 CONFLICT`, message `There must always be at least one active admin`. Concurrent requests cannot get around it.
- An unknown or deleted user is `404`; an `:id` that is not a UUID is `400`.

## Roles

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/roles` | `role:read` | — | `Role[]` |
| POST | `/roles` | `role:create` | `{ name, description?, permissionIds[] }` | `Role` |
| PATCH | `/roles/:id` | `role:update` | `{ name?, description?, permissionIds[]? }` | `Role` |
| DELETE | `/roles/:id` | `role:delete` | — | `204` |

**Roles behaviour:**
- `Role` is `{ id, name, description, permissions: [{ id, resource, action }], createdAt, updatedAt }`, with the permissions sorted by resource and action. `GET /roles` returns all roles ordered by name (unpaginated, as there are only a few).
- `POST /roles` answers `201`. `name` is 2 to 50 characters: lower-case letters, digits and underscores, starting with a letter. `description` is at most 255 characters (default empty). `permissionIds` is required and may be empty; an id that does not exist is `400` on `body.permissionIds`. A name that is taken, including the name of a deleted role, is `409`.
- `PATCH /roles/:id` needs at least one field. `permissionIds` **replaces** the role's permissions. The change applies to every holder of the role from their next request.
- The four built-in roles (`admin`, `hr_manager`, `manager`, `employee`) are used by name in code and in the seed, so they cannot be renamed or deleted (`409`). Their description and permissions can change; running the seed again adds back any built-in grant that was removed.
- `DELETE /roles/:id` is a soft delete. A role that is still assigned to a user (not deleted) is refused with `409` and `details.holders` giving how many.
- There is no endpoint that lists every permission yet, so `permissionIds` can only be taken from roles that already have them.

## Employees

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/employees` | `employee:read` | query: `departmentId?`, `status?`, `managerId?`, `page`, `limit` | paginated `Employee[]` |
| POST | `/employees` | `employee:create` | `{ userId, employeeCode, firstName, lastName, workEmail, departmentId?, jobPositionId?, managerId?, dateJoined }` | `Employee` |
| GET | `/employees/:id` | `employee:read` | — | `Employee` |
| PATCH | `/employees/:id` | `employee:update` | partial `Employee` fields | `Employee` |
| DELETE | `/employees/:id` | `employee:delete` | — | `204` (soft delete) |

## Departments

Reference data — expected to stay small (tens, not thousands, of rows) in Phase 1, so the list endpoint returns the full set unpaginated rather than following the `page`/`limit` convention.

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/departments` | `department:read` | — | `Department[]` |
| POST | `/departments` | `department:create` | `{ name, description?, parentDepartmentId? }` | `Department` |
| GET | `/departments/:id` | `department:read` | — | `Department` |
| PATCH | `/departments/:id` | `department:update` | partial fields | `Department` |
| DELETE | `/departments/:id` | `department:delete` | — | `204` |

## Job Positions

Reference data — same unpaginated convention as Departments above.

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/job-positions` | `job_position:read` | query: `departmentId?` | `JobPosition[]` |
| POST | `/job-positions` | `job_position:create` | `{ title, departmentId, description? }` | `JobPosition` |
| GET | `/job-positions/:id` | `job_position:read` | — | `JobPosition` |
| PATCH | `/job-positions/:id` | `job_position:update` | partial fields | `JobPosition` |
| DELETE | `/job-positions/:id` | `job_position:delete` | — | `204` |

## Leave Types

Reference data — same unpaginated convention as Departments above.

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/leave-types` | `leave_type:read` | — | `LeaveType[]` |
| POST | `/leave-types` | `leave_type:create` | `{ name, defaultDaysPerYear, isPaid, requiresApproval, carryForwardAllowed }` | `LeaveType` |
| PATCH | `/leave-types/:id` | `leave_type:update` | partial fields | `LeaveType` |
| DELETE | `/leave-types/:id` | `leave_type:delete` | — | `204` |

## Leave Requests

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/leave-requests` | `leave_request:read` | query: `employeeId?`, `status?`, `page`, `limit` (non-managers are implicitly scoped to their own requests) | paginated `LeaveRequest[]` |
| POST | `/leave-requests` | `leave_request:create` | `{ leaveTypeId, startDate, endDate, halfDay, reason? }` | `LeaveRequest` (status `pending`, `approverId` resolved from `manager_id`) |
| GET | `/leave-requests/:id` | `leave_request:read` | — | `LeaveRequest` |
| PATCH | `/leave-requests/:id` | `leave_request:update` | `{ startDate?, endDate?, reason? }` (only while `pending`, only by the requester) | `LeaveRequest` |
| POST | `/leave-requests/:id/approve` | `leave_request:approve` | — | `LeaveRequest` (status `approved`, deducts `LeaveBalance.used_days`) |
| POST | `/leave-requests/:id/reject` | `leave_request:approve` | `{ rejectionReason }` | `LeaveRequest` (status `rejected`) |
| POST | `/leave-requests/:id/cancel` | `leave_request:update` | — | `LeaveRequest` (status `cancelled`, reverses any balance deduction if was approved) |

## Leave Balances

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/employees/:id/leave-balances` | `leave_balance:read` | query: `year?` | `LeaveBalance[]` |
| POST | `/leave-balances/adjust` | `leave_balance:adjust` (admin/HR only) | `{ employeeId, leaveTypeId, year, allocatedDaysDelta? , carriedForwardDaysDelta? }` | `LeaveBalance` |

## Appendix: Phase 1 permission reference

Every `resource:action` pair referenced above, consolidated so the seed script (`Role`/`Permission`/`RolePermission` rows created in milestone M1) has a single source of truth instead of being reconstructed by scanning every endpoint table.

| Permission | Typically granted to |
|---|---|
| `user:read`, `user:create`, `user:update`, `user:delete` | `admin` |
| `role:read`, `role:create`, `role:update`, `role:delete` | `admin` |
| `employee:read` | `admin`, `hr_manager`, `manager` |
| `employee:create`, `employee:update`, `employee:delete` | `admin`, `hr_manager` |
| `department:read`, `job_position:read` | all authenticated roles |
| `department:create/update/delete`, `job_position:create/update/delete` | `admin`, `hr_manager` |
| `leave_type:read` | all authenticated roles |
| `leave_type:create`, `leave_type:update`, `leave_type:delete` | `admin`, `hr_manager` |
| `leave_request:read`, `leave_request:create`, `leave_request:update` | `employee` (scoped to self), `manager` (scoped to reports), `admin`/`hr_manager` (unscoped) |
| `leave_request:approve` | `manager`, `admin`, `hr_manager` |
| `leave_balance:read` | `employee` (self), `manager` (reports), `admin`/`hr_manager` (unscoped) |
| `leave_balance:adjust` | `admin`, `hr_manager` |
