import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { AppError } from '../middleware/error.js';
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters';
const OTHER_SECRET = 'a-different-secret-that-is-32-characters-long';
const USER_ID = '0b1f1c5e-5a52-4f6e-9c63-3d3b6b1f9a10';

const keyFor = (secret: string) => new TextEncoder().encode(secret);

async function expectUnauthenticated(token: string, secret = SECRET): Promise<void> {
  const error = await verifyAccessToken(token, secret).catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe('UNAUTHENTICATED');
}

describe('access tokens', () => {
  it('round-trips the user id', async () => {
    const token = await signAccessToken({ userId: USER_ID, secret: SECRET, ttl: '15m' });
    await expect(verifyAccessToken(token, SECRET)).resolves.toEqual({ userId: USER_ID });
  });

  it('carries only the user id as identity: no roles, permissions or email', async () => {
    const token = await signAccessToken({ userId: USER_ID, secret: SECRET, ttl: '15m' });
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString(),
    ) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sub']);
  });

  it('expires after the lifetime it was given', async () => {
    const token = await signAccessToken({ userId: USER_ID, secret: SECRET, ttl: '15m' });
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      iat: number;
      exp: number;
    };
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it('refuses a token that has already expired', async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER_ID)
      .setIssuer('hrms-platform')
      .setAudience('hrms-api')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(keyFor(SECRET));
    await expectUnauthenticated(expired);
  });

  it('refuses a token signed with a different secret', async () => {
    const token = await signAccessToken({ userId: USER_ID, secret: OTHER_SECRET, ttl: '15m' });
    await expectUnauthenticated(token);
  });

  it('refuses a token with a tampered payload', async () => {
    const token = await signAccessToken({ userId: USER_ID, secret: SECRET, ttl: '15m' });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ sub: 'someone-else', iss: 'hrms-platform', aud: 'hrms-api' }),
    ).toString('base64url');
    await expectUnauthenticated(`${header}.${forged}.${signature}`);
  });

  it('refuses an unsigned token (alg none)', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: USER_ID,
        iss: 'hrms-platform',
        aud: 'hrms-api',
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toString('base64url');
    await expectUnauthenticated(`${header}.${payload}.`);
  });

  it('refuses a token for a different audience or issuer', async () => {
    const make = (issuer: string, audience: string) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(USER_ID)
        .setIssuer(issuer)
        .setAudience(audience)
        .setExpirationTime('15m')
        .sign(keyFor(SECRET));
    await expectUnauthenticated(await make('hrms-platform', 'someone-else'));
    await expectUnauthenticated(await make('someone-else', 'hrms-api'));
  });

  it('refuses a token with no subject', async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('hrms-platform')
      .setAudience('hrms-api')
      .setExpirationTime('15m')
      .sign(keyFor(SECRET));
    await expectUnauthenticated(token);
  });

  it.each(['', 'not-a-jwt', 'a.b', 'a.b.c', 'Bearer abc'])(
    'refuses garbage "%s"',
    async (garbage) => {
      await expectUnauthenticated(garbage);
    },
  );
});

describe('refresh tokens', () => {
  it('generates long, unique, URL-safe values', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateRefreshToken()));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it('hashes to a stable 64-character hex value that is not the token', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token, SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken(token, SECRET));
    expect(hash).not.toContain(token);
  });

  it('gives a different hash for a different secret or a different token', () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token, SECRET)).not.toBe(hashRefreshToken(token, OTHER_SECRET));
    expect(hashRefreshToken(token, SECRET)).not.toBe(
      hashRefreshToken(generateRefreshToken(), SECRET),
    );
  });
});
