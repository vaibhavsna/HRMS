/** Where integration tests run. A separate database, never the development one. */
const DEFAULT_TEST_DATABASE_URL = 'postgresql://hrms:hrms@localhost:5432/hrms_test';

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

/**
 * The database name in a connection URL. Throws unless it ends in `_test`: the test setup drops and
 * recreates the schema, so it must be impossible to point it at a real database by mistake.
 */
export function testDatabaseName(url: string): string {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `Refusing to use database "${name}" for tests: the name must end with _test (set TEST_DATABASE_URL).`,
    );
  }
  return name;
}

/** The same server and credentials with a different database, e.g. the `postgres` maintenance database. */
export function withDatabase(url: string, database: string): string {
  const copy = new URL(url);
  copy.pathname = `/${database}`;
  return copy.toString();
}
