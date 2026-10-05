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

Standard `code` values: `VALIDATION_ERROR` (400), `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `INTERNAL_ERROR` (500).

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

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/login` | none | `{ email, password }` | `{ data: { accessToken, user } }` + sets refresh cookie |
| POST | `/auth/refresh` | refresh cookie | — | `{ data: { accessToken } }` |
| POST | `/auth/logout` | access token | — | `204 No Content`, clears refresh cookie |
| GET | `/auth/me` | access token | — | `{ data: { user, employee, roles, permissions } }` |

## Users

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/users` | `user:read` | — (query: `page`, `limit`, `q`) | paginated `User[]` |
| POST | `/users` | `user:create` | `{ email, password, roleIds[] }` | `User` |
| GET | `/users/:id` | `user:read` | — | `User` |
| PATCH | `/users/:id` | `user:update` | `{ email?, isActive? }` | `User` |
| DELETE | `/users/:id` | `user:delete` | — | `204` (soft delete) |
| POST | `/users/:id/roles` | `user:update` | `{ roleIds[] }` | `User` with resolved roles |

## Roles

| Method | Path | Required permission | Body | Response |
|---|---|---|---|---|
| GET | `/roles` | `role:read` | — | `Role[]` |
| POST | `/roles` | `role:create` | `{ name, description?, permissionIds[] }` | `Role` |
| PATCH | `/roles/:id` | `role:update` | `{ name?, description?, permissionIds[]? }` | `Role` |
| DELETE | `/roles/:id` | `role:delete` | — | `204` |

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
