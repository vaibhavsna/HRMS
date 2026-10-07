// Source of truth for the seeded roles and permissions: the "Phase 1 permission reference" appendix in
// docs/03-api-specification.md. When that table changes, change this file and its test together.
// Scoping (an employee sees only their own leave, a manager only their reports) is NOT stored here:
// the services enforce it. These rows only say which permission each role holds.

export const ROLE_NAMES = ['admin', 'hr_manager', 'manager', 'employee'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export interface RoleDefinition {
  name: RoleName;
  description: string;
}

export const ROLES: readonly RoleDefinition[] = [
  { name: 'admin', description: 'Full access, including users and roles' },
  {
    name: 'hr_manager',
    description: 'Manages employees, departments, job positions, leave types and leave balances',
  },
  { name: 'manager', description: 'Sees their direct reports and approves their leave' },
  { name: 'employee', description: 'Sees their own record and manages their own leave' },
];

export interface PermissionDefinition {
  resource: string;
  action: string;
  /** Roles that hold this permission. */
  roles: readonly RoleName[];
}

const EVERYONE: readonly RoleName[] = ['admin', 'hr_manager', 'manager', 'employee'];
const HR: readonly RoleName[] = ['admin', 'hr_manager'];
const ADMIN_ONLY: readonly RoleName[] = ['admin'];

export const PERMISSIONS: readonly PermissionDefinition[] = [
  { resource: 'user', action: 'read', roles: ADMIN_ONLY },
  { resource: 'user', action: 'create', roles: ADMIN_ONLY },
  { resource: 'user', action: 'update', roles: ADMIN_ONLY },
  { resource: 'user', action: 'delete', roles: ADMIN_ONLY },

  { resource: 'role', action: 'read', roles: ADMIN_ONLY },
  { resource: 'role', action: 'create', roles: ADMIN_ONLY },
  { resource: 'role', action: 'update', roles: ADMIN_ONLY },
  { resource: 'role', action: 'delete', roles: ADMIN_ONLY },

  { resource: 'employee', action: 'read', roles: ['admin', 'hr_manager', 'manager'] },
  { resource: 'employee', action: 'create', roles: HR },
  { resource: 'employee', action: 'update', roles: HR },
  { resource: 'employee', action: 'delete', roles: HR },

  { resource: 'department', action: 'read', roles: EVERYONE },
  { resource: 'department', action: 'create', roles: HR },
  { resource: 'department', action: 'update', roles: HR },
  { resource: 'department', action: 'delete', roles: HR },

  { resource: 'job_position', action: 'read', roles: EVERYONE },
  { resource: 'job_position', action: 'create', roles: HR },
  { resource: 'job_position', action: 'update', roles: HR },
  { resource: 'job_position', action: 'delete', roles: HR },

  { resource: 'leave_type', action: 'read', roles: EVERYONE },
  { resource: 'leave_type', action: 'create', roles: HR },
  { resource: 'leave_type', action: 'update', roles: HR },
  { resource: 'leave_type', action: 'delete', roles: HR },

  // Employee: own requests. Manager: their reports'. Admin and HR: all. Scoping lives in the services.
  { resource: 'leave_request', action: 'read', roles: EVERYONE },
  { resource: 'leave_request', action: 'create', roles: EVERYONE },
  { resource: 'leave_request', action: 'update', roles: EVERYONE },
  { resource: 'leave_request', action: 'approve', roles: ['admin', 'hr_manager', 'manager'] },

  { resource: 'leave_balance', action: 'read', roles: EVERYONE },
  { resource: 'leave_balance', action: 'adjust', roles: HR },
];

/** The `resource:action` string used by `requirePermission` and returned by `/auth/me`. */
export function permissionKey(
  permission: Pick<PermissionDefinition, 'resource' | 'action'>,
): string {
  return `${permission.resource}:${permission.action}`;
}
