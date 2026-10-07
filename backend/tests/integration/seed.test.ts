import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, ROLE_NAMES } from '../../prisma/seed-data.js';
import { seedDatabase } from '../../prisma/seed-database.js';
import { prismaSeedStore } from '../../prisma/seed-prisma-store.js';
import { hashPassword, verifyPassword } from '../../src/lib/password.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { resetDatabase } from '../helpers/db.js';
import { permissionsOf } from '../helpers/rbac.js';

const prisma = getPrisma();
const runSeed = (admin?: { email: string; passwordHash: string }) =>
  prisma.$transaction((tx) => seedDatabase(prismaSeedStore(tx), admin ? { admin } : {}));

const EXPECTED_GRANTS = PERMISSIONS.reduce((total, p) => total + p.roles.length, 0);

async function snapshot() {
  const [roles, permissions, grants] = await Promise.all([
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
    prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] }),
    prisma.rolePermission.findMany({ orderBy: [{ roleId: 'asc' }, { permissionId: 'asc' }] }),
  ]);
  return { roles, permissions, grants };
}

async function permissionKeysOf(roleName: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { name: roleName }, deletedAt: null },
    select: { permission: { select: { resource: true, action: true } } },
  });
  return rows.map(({ permission }) => `${permission.resource}:${permission.action}`).sort();
}

describe('the seed, against the real database', () => {
  beforeEach(resetDatabase);

  it('creates the roles, the permissions and the grants of docs/03', async () => {
    const summary = await runSeed();

    expect(summary).toEqual({
      roles: ROLES.length,
      permissions: PERMISSIONS.length,
      grants: EXPECTED_GRANTS,
      adminEnsured: false,
    });
    expect(await prisma.role.count()).toBe(ROLE_NAMES.length);
    expect(await prisma.permission.count()).toBe(PERMISSIONS.length);
    expect(await prisma.rolePermission.count()).toBe(EXPECTED_GRANTS);
    expect(await prisma.user.count()).toBe(0);
    for (const role of ROLE_NAMES) {
      expect(await permissionKeysOf(role), role).toEqual(permissionsOf(role));
    }
  });

  it('can be run again and again without changing a row or adding one', async () => {
    await runSeed();
    const first = await snapshot();
    await runSeed();
    await runSeed();
    const third = await snapshot();

    expect(third.roles.map((r) => r.id)).toEqual(first.roles.map((r) => r.id));
    expect(third.permissions.map((p) => p.id)).toEqual(first.permissions.map((p) => p.id));
    expect(third.grants.map((g) => g.id)).toEqual(first.grants.map((g) => g.id));
    expect(third.permissions).toEqual(first.permissions);
    expect(third.grants).toEqual(first.grants);
    expect(third.roles.map((r) => r.name)).toEqual(first.roles.map((r) => r.name));
  });

  describe('after the roles have been customised through the API', () => {
    it('keeps a grant that was removed from a built-in role removed', async () => {
      await runSeed();
      await prisma.rolePermission.updateMany({
        where: {
          role: { name: 'employee' },
          permission: { resource: 'department', action: 'read' },
        },
        data: { deletedAt: new Date() },
      });

      await runSeed();

      expect(await permissionKeysOf('employee')).not.toContain('department:read');
      expect((await permissionKeysOf('employee')).length).toBe(
        permissionsOf('employee').length - 1,
      );
    });

    it('restores a built-in role’s description, which is the one thing it rewrites', async () => {
      await runSeed();
      await prisma.role.update({ where: { name: 'employee' }, data: { description: 'Edited' } });

      await runSeed();

      const seeded = ROLES.find((role) => role.name === 'employee');
      expect(
        (await prisma.role.findUniqueOrThrow({ where: { name: 'employee' } })).description,
      ).toBe(seeded?.description);
    });

    it('does not touch a custom role or its grants', async () => {
      await runSeed();
      const permission = await prisma.permission.findFirstOrThrow({
        where: { resource: 'user', action: 'read' },
      });
      const custom = await prisma.role.create({
        data: {
          name: 'custom_role',
          description: 'Mine',
          permissions: { create: [{ permissionId: permission.id }] },
        },
      });

      await runSeed();

      expect(await prisma.role.count()).toBe(ROLE_NAMES.length + 1);
      expect(await permissionKeysOf('custom_role')).toEqual(['user:read']);
      expect((await prisma.role.findUniqueOrThrow({ where: { id: custom.id } })).description).toBe(
        'Mine',
      );
    });

    it('adds back a permission that is missing altogether', async () => {
      await runSeed();
      await prisma.rolePermission.deleteMany({
        where: { permission: { resource: 'leave_balance', action: 'adjust' } },
      });
      await prisma.permission.deleteMany({
        where: { resource: 'leave_balance', action: 'adjust' },
      });

      await runSeed();

      expect(await permissionKeysOf('admin')).toContain('leave_balance:adjust');
      expect(await prisma.permission.count()).toBe(PERMISSIONS.length);
    });
  });

  describe('with a bootstrap admin', () => {
    const email = 'first.admin@example.com';

    it('creates the account with the admin role and the given hash', async () => {
      const passwordHash = await hashPassword('the-first-admin-password', 4);
      const summary = await runSeed({ email, passwordHash });

      expect(summary.adminEnsured).toBe(true);
      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { role: true } } },
      });
      expect(user.passwordHash).toBe(passwordHash);
      expect(user.isActive).toBe(true);
      expect(user.roles.map((link) => link.role.name)).toEqual(['admin']);
    });

    it('leaves an existing account exactly as it is, including its password', async () => {
      const original = await hashPassword('the-first-admin-password', 4);
      await runSeed({ email, passwordHash: original });
      await prisma.user.update({ where: { email }, data: { isActive: false } });

      await runSeed({ email, passwordHash: await hashPassword('a-different-password-1', 4) });

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await prisma.user.count()).toBe(1);
      expect(user.passwordHash).toBe(original);
      await expect(verifyPassword('the-first-admin-password', user.passwordHash)).resolves.toBe(
        true,
      );
      expect(user.isActive).toBe(false);
      expect(await prisma.userRole.count({ where: { userId: user.id } })).toBe(1);
    });
  });
});
