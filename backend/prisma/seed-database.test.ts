import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, permissionKey } from './seed-data.js';
import { seedDatabase, type SeedStore } from './seed-database.js';

/** In-memory stand-in for the database. Rows are keyed by the same unique constraints the schema has. */
class MemoryStore implements SeedStore {
  roles = new Map<string, { id: string; description: string }>();
  permissions = new Map<string, { id: string; resource: string; action: string }>();
  rolePermissions = new Set<string>();
  users = new Map<string, { id: string; passwordHash: string }>();
  userRoles = new Set<string>();
  private counter = 0;

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  upsertRole({ name, description }: { name: string; description: string }): Promise<string> {
    const existing = this.roles.get(name);
    if (existing) {
      existing.description = description;
      return Promise.resolve(existing.id);
    }
    const id = this.nextId('role');
    this.roles.set(name, { id, description });
    return Promise.resolve(id);
  }

  upsertPermission({ resource, action }: { resource: string; action: string }): Promise<string> {
    const key = `${resource}:${action}`;
    const existing = this.permissions.get(key);
    if (existing) return Promise.resolve(existing.id);
    const id = this.nextId('perm');
    this.permissions.set(key, { id, resource, action });
    return Promise.resolve(id);
  }

  ensureRolePermission(roleId: string, permissionId: string): Promise<void> {
    this.rolePermissions.add(`${roleId}|${permissionId}`);
    return Promise.resolve();
  }

  ensureUser({ email, passwordHash }: { email: string; passwordHash: string }): Promise<string> {
    const existing = this.users.get(email);
    if (existing) return Promise.resolve(existing.id);
    const id = this.nextId('user');
    this.users.set(email, { id, passwordHash });
    return Promise.resolve(id);
  }

  ensureUserRole(userId: string, roleId: string): Promise<void> {
    this.userRoles.add(`${userId}|${roleId}`);
    return Promise.resolve();
  }

  /** Everything stored, in a stable order, for comparing two runs. */
  snapshot(): string {
    return JSON.stringify({
      roles: [...this.roles].sort(),
      permissions: [...this.permissions].sort(),
      rolePermissions: [...this.rolePermissions].sort(),
      users: [...this.users].sort(),
      userRoles: [...this.userRoles].sort(),
    });
  }

  /** `resource:action` keys held by a role, read back from the stored grants. */
  grantsOf(roleName: string): string[] {
    const roleId = this.roles.get(roleName)?.id;
    const keyById = new Map([...this.permissions].map(([key, row]) => [row.id, key]));
    return [...this.rolePermissions]
      .map((entry) => entry.split('|') as [string, string])
      .filter(([rId]) => rId === roleId)
      .map(([, permissionId]) => keyById.get(permissionId) ?? '')
      .sort();
  }
}

const ADMIN = { email: 'admin@example.com', passwordHash: 'hash-one' };

describe('seedDatabase', () => {
  it('seeds the roles, permissions and grants, and no admin unless asked', async () => {
    const store = new MemoryStore();
    const summary = await seedDatabase(store);

    expect(summary).toEqual({ roles: 4, permissions: 30, grants: 68, adminEnsured: false });
    expect(store.roles.size).toBe(4);
    expect(store.permissions.size).toBe(30);
    expect(store.rolePermissions.size).toBe(68);
    expect(store.users.size).toBe(0);
  });

  it('gives every role exactly the permissions in the seed data', async () => {
    const store = new MemoryStore();
    await seedDatabase(store);

    for (const role of ROLES) {
      const expected = PERMISSIONS.filter((p) => p.roles.includes(role.name))
        .map(permissionKey)
        .sort();
      expect(store.grantsOf(role.name)).toEqual(expected);
    }
  });

  it('gives the same rows, with the same ids, when run twice', async () => {
    const store = new MemoryStore();
    await seedDatabase(store, { admin: ADMIN });
    const first = store.snapshot();

    await seedDatabase(store, { admin: ADMIN });
    expect(store.snapshot()).toBe(first);
  });

  it('creates the bootstrap admin and gives it the admin role', async () => {
    const store = new MemoryStore();
    const summary = await seedDatabase(store, { admin: ADMIN });

    const user = store.users.get('admin@example.com');
    const adminRole = store.roles.get('admin');
    expect(summary.adminEnsured).toBe(true);
    expect(user?.passwordHash).toBe('hash-one');
    expect(store.userRoles).toEqual(new Set([`${user?.id}|${adminRole?.id}`]));
  });

  it('never resets an existing account password or duplicates it on a later run', async () => {
    const store = new MemoryStore();
    await seedDatabase(store, { admin: ADMIN });
    await seedDatabase(store, { admin: { ...ADMIN, passwordHash: 'hash-two' } });

    expect(store.users.size).toBe(1);
    expect(store.users.get('admin@example.com')?.passwordHash).toBe('hash-one');
    expect(store.userRoles.size).toBe(1);
  });

  it('updates a changed role description without changing the role id', async () => {
    const store = new MemoryStore();
    const existingId = await store.upsertRole({ name: 'admin', description: 'old text' });

    await seedDatabase(store);

    expect(store.roles.get('admin')).toEqual({
      id: existingId,
      description: ROLES[0]?.description,
    });
  });

  it('keeps grants that were added to a role after seeding', async () => {
    const store = new MemoryStore();
    await seedDatabase(store);
    const employeeId = store.roles.get('employee')?.id ?? '';
    const userReadId = store.permissions.get('user:read')?.id ?? '';
    await store.ensureRolePermission(employeeId, userReadId);

    await seedDatabase(store);

    expect(store.grantsOf('employee')).toContain('user:read');
  });

  it('restores a seeded grant that was removed', async () => {
    const store = new MemoryStore();
    await seedDatabase(store);
    const managerId = store.roles.get('manager')?.id ?? '';
    const approveId = store.permissions.get('leave_request:approve')?.id ?? '';
    store.rolePermissions.delete(`${managerId}|${approveId}`);
    expect(store.grantsOf('manager')).not.toContain('leave_request:approve');

    await seedDatabase(store);

    expect(store.grantsOf('manager')).toContain('leave_request:approve');
  });
});
