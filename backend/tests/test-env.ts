/** Fixed, non-secret values for the app environment during tests. */
export const TEST_JWT_ACCESS_SECRET = 'test-access-secret-0123456789abcdef-test';
export const TEST_JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789abcdef-test';

export const TEST_ENV = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: TEST_JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: TEST_JWT_REFRESH_SECRET,
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
  // Generous, so the many failed logins in other tests never hit the limit. The rate limit tests pass their own.
  LOGIN_RATE_LIMIT_MAX: '100000',
  REFRESH_RATE_LIMIT_MAX: '100000',
} as const;
