import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { testDatabaseName, testDatabaseUrl, withDatabase } from './test-db.js';

const backendDir = fileURLToPath(new URL('..', import.meta.url));

/**
 * Runs once before the integration tests: makes sure the test database exists, empties it, and applies
 * the real migrations, so every run starts from the schema in prisma/migrations and nothing else.
 */
export async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  const name = testDatabaseName(url); // throws unless the name ends with _test

  const maintenance = new pg.Client({ connectionString: withDatabase(url, 'postgres') });
  await maintenance.connect();
  try {
    const existing = await maintenance.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      name,
    ]);
    if (existing.rowCount === 0) await maintenance.query(`CREATE DATABASE "${name}"`);
  } finally {
    await maintenance.end();
  }

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('DROP SCHEMA IF EXISTS public CASCADE');
    await db.query('CREATE SCHEMA public');
  } finally {
    await db.end();
  }

  const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: backendDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    });
  } catch (error) {
    const output = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
    throw new Error(`Applying migrations to the test database failed:\n${output}`, {
      cause: error,
    });
  }
}
