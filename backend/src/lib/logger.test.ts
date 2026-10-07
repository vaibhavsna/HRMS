import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

/** A logger whose output is collected as text. */
function capture(level = 'trace') {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger(level, stream), output: () => chunks.join('') };
}

const SECRET = 'S3cret-value-that-must-not-appear';

describe('createLogger redaction', () => {
  it.each([
    ['password', { password: SECRET }],
    ['passwordHash', { passwordHash: SECRET }],
    ['accessToken', { accessToken: SECRET }],
    ['refreshToken', { refreshToken: SECRET }],
    ['token', { token: SECRET }],
    ['tokenHash', { tokenHash: SECRET }],
    ['a nested password', { user: { password: SECRET } }],
    ['a nested token', { session: { refreshToken: SECRET } }],
    ['a password two levels down', { request: { body: { password: SECRET } } }],
    ['the request body', { req: { body: SECRET } }],
    ['the Authorization header', { req: { headers: { authorization: `Bearer ${SECRET}` } } }],
    ['the Cookie header', { req: { headers: { cookie: `refresh_token=${SECRET}` } } }],
    ['another headers object', { incoming: { headers: { cookie: `refresh_token=${SECRET}` } } }],
    ['the Set-Cookie header', { res: { headers: { 'set-cookie': [`refresh_token=${SECRET}`] } } }],
  ])('keeps %s out of the log', (_name, fields) => {
    const { logger, output } = capture();
    logger.info(fields, 'something happened');

    expect(output()).not.toContain(SECRET);
    expect(output()).toContain('[redacted]');
  });

  it('keeps the fields that are not secret', () => {
    const { logger, output } = capture();
    logger.info({ userId: 'u-1', req: { method: 'POST', url: '/api/v1/auth/login' } }, 'login');

    const line = JSON.parse(output()) as Record<string, unknown>;
    expect(line).toMatchObject({
      userId: 'u-1',
      msg: 'login',
      req: { method: 'POST', url: '/api/v1/auth/login' },
    });
  });

  it('writes nothing below the configured level', () => {
    const { logger, output } = capture('warn');
    logger.info({ password: SECRET }, 'quiet');

    expect(output()).toBe('');
  });
});
