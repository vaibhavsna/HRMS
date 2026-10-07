import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

let client: PrismaClient | undefined;

/**
 * The shared Prisma client, created on first use from DATABASE_URL.
 * Services import this; nothing else may import Prisma (docs/12 section 3, enforced by ESLint).
 */
export function getPrisma(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }),
  });
  return client;
}

/** Closes the connection pool. Used on shutdown and at the end of test files. */
export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
