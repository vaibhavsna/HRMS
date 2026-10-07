import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../config/env.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

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

/**
 * True when a write failed because it would duplicate a unique value (Prisma P2002). Services turn this
 * into CONFLICT (docs/12 section 4) instead of letting the database error text reach the client.
 */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Closes the connection pool. Used on shutdown and at the end of test files. */
export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
