import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, SAMPLE_ROLE_PERMISSIONS, visibleNav } from './nav-sample';

const labels = (permissions: readonly string[]) =>
  visibleNav(permissions).map((item) => item.label);

describe('sample role-based navigation', () => {
  it('shows only the dashboard to someone with no permissions', () => {
    expect(labels([])).toEqual(['Dashboard']);
  });

  it('gives an employee their own leave and the shared lookups, but no people management', () => {
    const employee = labels(SAMPLE_ROLE_PERMISSIONS.employee);
    expect(employee).toEqual(
      expect.arrayContaining(['Dashboard', 'Departments', 'Job positions', 'My leave']),
    );
    expect(employee).not.toEqual(expect.arrayContaining(['Employees']));
    expect(employee).not.toEqual(expect.arrayContaining(['Approvals']));
    expect(employee).not.toEqual(expect.arrayContaining(['Users']));
  });

  it('lets a manager see employees and the approval queue, but not user administration', () => {
    const manager = labels(SAMPLE_ROLE_PERMISSIONS.manager);
    expect(manager).toEqual(expect.arrayContaining(['Employees', 'Approvals']));
    expect(manager).not.toEqual(expect.arrayContaining(['Users']));
    expect(manager).not.toEqual(expect.arrayContaining(['Leave types']));
  });

  it('lets HR configure leave types but not manage users and roles', () => {
    const hr = labels(SAMPLE_ROLE_PERMISSIONS.hr_manager);
    expect(hr).toEqual(expect.arrayContaining(['Leave types', 'Employees', 'Approvals']));
    expect(hr).not.toEqual(expect.arrayContaining(['Users']));
    expect(hr).not.toEqual(expect.arrayContaining(['Roles']));
  });

  it('shows an admin every item', () => {
    expect(labels(SAMPLE_ROLE_PERMISSIONS.admin)).toEqual(NAV_ITEMS.map((item) => item.label));
  });
});
