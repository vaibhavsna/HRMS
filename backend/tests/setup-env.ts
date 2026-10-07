import { afterAll } from 'vitest';
import { TEST_ENV } from './test-env.js';
import { testDatabaseName, testDatabaseUrl } from './test-db.js';

// Runs before each integration test file, before the app reads its environment.
testDatabaseName(testDatabaseUrl()); // fail fast if this is not a *_test database
Object.assign(process.env, TEST_ENV, { DATABASE_URL: testDatabaseUrl() });

afterAll(async () => {
  const { disconnectPrisma } = await import('../src/lib/prisma.js');
  await disconnectPrisma();
});
