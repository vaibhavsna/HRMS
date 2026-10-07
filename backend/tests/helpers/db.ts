import { getPrisma } from '../../src/lib/prisma.js';

/** Empties every table (except Prisma's own bookkeeping) so each test starts from nothing. */
export async function resetDatabase(): Promise<void> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}
