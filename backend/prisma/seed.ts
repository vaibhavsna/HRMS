// Seeds roles, permissions and (optionally) the first admin. Run with `npm run db:seed -w backend`.
// Safe to run any number of times. See backend/README.md.
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedDatabase } from './seed-database.js';
import { parseBootstrapAdmin } from './seed-env.js';
import { prismaSeedStore } from './seed-prisma-store.js';

const BCRYPT_COST = 12;

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
