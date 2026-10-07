import type { Prisma } from '../src/generated/prisma/client.js';
import type { SeedStore } from './seed-database.js';

/**
 * Adapts a Prisma client or transaction to the store the seed logic uses.
 * Upserts only, keyed by the unique constraints. Shared by the seed script and the integration tests.
 */
export function prismaSeedStore(tx: Prisma.TransactionClient): SeedStore {
  return {
    async upsertRole({ name, description }) {
      const row = await tx.role.upsert({
        where: { name },
        create: { name, description },
        update: { description },
        select: { id: true },
      });
      return row.id;
    },
    async upsertPermission({ resource, action }) {
      const row = await tx.permission.upsert({
        where: { resource_action: { resource, action } },
        create: { resource, action },
        update: {},
        select: { id: true },
      });
      return row.id;
    },
    async ensureRolePermission(roleId, permissionId) {
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        create: { roleId, permissionId },
        update: {},
      });
    },
    async ensureUser({ email, passwordHash }) {
      const row = await tx.user.upsert({
        where: { email },
        create: { email, passwordHash },
        update: {},
        select: { id: true },
      });
      return row.id;
    },
    async ensureUserRole(userId, roleId) {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId } },
        create: { userId, roleId },
        update: {},
      });
    },
  };
}
