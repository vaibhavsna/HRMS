// Seeds roles, permissions and (optionally) the first admin. Run with `npm run db:seed -w backend`.
// Safe to run any number of times. See backend/README.md.
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Prisma } from '../src/generated/prisma/client.js';
import { seedDatabase, type SeedStore } from './seed-database.js';
import { parseBootstrapAdmin } from './seed-env.js';

const BCRYPT_COST = 12;

/** Adapts a Prisma transaction to the store the seed logic uses. Upserts only, keyed by the unique constraints. */
function prismaSeedStore(tx: Prisma.TransactionClient): SeedStore {
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

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const bootstrap = parseBootstrapAdmin(process.env);
  const admin = bootstrap && {
    email: bootstrap.email,
    passwordHash: await bcrypt.hash(bootstrap.password, BCRYPT_COST),
  };

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    // One transaction: either everything is seeded or nothing changes.
    const summary = await prisma.$transaction((tx) => seedDatabase(prismaSeedStore(tx), { admin }));
    console.log(
      `Seed complete: ${summary.roles} roles, ${summary.permissions} permissions, ${summary.grants} role grants.`,
    );
    console.log(
      summary.adminEnsured
        ? 'Bootstrap admin ensured (an existing account keeps its current password).'
        : 'No bootstrap admin requested: set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create one.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Seed failed');
  process.exitCode = 1;
});
