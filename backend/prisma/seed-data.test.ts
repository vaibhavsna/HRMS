import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_NAMES, ROLES, permissionKey, type RoleName } from './seed-data.js';

const keysFor = (role: RoleName): string[] =>
  PERMISSIONS.filter((permission) => permission.roles.includes(role)).map(permissionKey);

describe('seed data (docs/03 permission appendix)', () => {
  it('defines the four roles, each with a description', () => {
    expect(ROLES.map((role) => role.name)).toEqual([...ROLE_NAMES]);
    expect(ROLES.every((role) => role.description.length > 0)).toBe(true);
  });

  it('has 30 distinct permissions written as resource:action', () => {
    const keys = PERMISSIONS.map(permissionKey);
    expect(keys).toHaveLength(30);
    expect(new Set(keys).size).toBe(30);
    expect(keys.every((key) => /^[a-z_]+:[a-z_]+$/.test(key))).toBe(true);
  });

  it('only grants permissions to roles that exist', () => {
    const known = new Set<string>(ROLE_NAMES);
    for (const permission of PERMISSIONS) {
      expect(permission.roles.length).toBeGreaterThan(0);
      for (const role of permission.roles) expect(known.has(role)).toBe(true);
    }
  });

  it('gives each role the number of permissions the appendix implies', () => {
    expect(keysFor('admin')).toHaveLength(30);
    expect(keysFor('hr_manager')).toHaveLength(22);
    expect(keysFor('manager')).toHaveLength(9);
    expect(keysFor('employee')).toHaveLength(7);
  });

  it('lets admin do everything', () => {
    expect(keysFor('admin')).toEqual(PERMISSIONS.map(permissionKey));
  });

  it('keeps user and role management for admin only', () => {
    for (const permission of PERMISSIONS.filter((p) => ['user', 'role'].includes(p.resource))) {
      expect(permission.roles).toEqual(['admin']);
    }
  });

  it('lets HR manage people, departments, positions, leave types and balances, but not users or roles', () => {
    const hr = keysFor('hr_manager');
    expect(hr).toEqual(
      expect.arrayContaining(['employee:delete', 'leave_type:create', 'leave_balance:adjust']),
    );
    expect(hr).not.toContain('user:read');
    expect(hr).not.toContain('role:read');
  });

  it('lets a manager read employees and approve leave, but not change people or balances', () => {
    const manager = keysFor('manager');
    expect(manager).toEqual(expect.arrayContaining(['employee:read', 'leave_request:approve']));
    expect(manager).not.toContain('employee:create');
    expect(manager).not.toContain('leave_type:create');
    expect(manager).not.toContain('leave_balance:adjust');
  });

  it('lets an employee read shared lookups and handle their own leave, and nothing that changes data elsewhere', () => {
    const employee = keysFor('employee');
    expect(employee).toEqual(
      expect.arrayContaining([
        'department:read',
        'job_position:read',
        'leave_type:read',
        'leave_request:read',
        'leave_request:create',
        'leave_request:update',
        'leave_balance:read',
      ]),
    );
    expect(employee).not.toContain('employee:read');
    expect(employee).not.toContain('leave_request:approve');
    expect(employee.filter((key) => key.endsWith(':delete'))).toEqual([]);
  });
});
