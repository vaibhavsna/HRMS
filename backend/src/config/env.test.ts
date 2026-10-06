import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://hrms:hrms@localhost:5432/hrms',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('coerces PORT to a number', () => {
    expect(parseEnv({ ...valid, PORT: '5000' }).PORT).toBe(5000);
  });

  it('lists every missing or invalid variable in one error', () => {
    expect(() => parseEnv({ JWT_ACCESS_SECRET: 'short', CORS_ORIGIN: 'not-a-url' })).toThrow(
      /DATABASE_URL[\s\S]*JWT_ACCESS_SECRET[\s\S]*JWT_REFRESH_SECRET[\s\S]*CORS_ORIGIN/,
    );
  });
});
