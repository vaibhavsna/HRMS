import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { getEnv } from '../../src/config/env.js';
import { DUMMY_PASSWORD_HASH } from '../../src/lib/password.js';
import * as password from '../../src/lib/password.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { verifyAccessToken } from '../../src/lib/tokens.js';
import { TEST_JWT_ACCESS_SECRET } from '../test-env.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, seedRbac } from '../helpers/factories.js';

const app = createApp(getEnv());
const LOGIN = '/api/v1/auth/login';

interface LoginBody {
  data: { accessToken: string; user: Record<string, unknown> };
}
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { fields?: { field: string; message: string }[] };
  };
}

function refreshCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith('refresh_token=')) ?? '';
}

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  describe('with correct credentials', () => {
    it('returns an access token for that user and the public user fields', async () => {
      const user = await createUser({ roles: ['employee'] });
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(200);
      const body = res.body as LoginBody;
      await expect(
        verifyAccessToken(body.data.accessToken, TEST_JWT_ACCESS_SECRET),
      ).resolves.toEqual({
        userId: user.id,
      });
      expect(body.data.user).toMatchObject({ id: user.id, email: user.email, isActive: true });
    });

    it('never returns the password hash', async () => {
      const user = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });

      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
    });

    it('sets the refresh token as an httpOnly, SameSite=Strict cookie limited to the auth routes', async () => {
      const user = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });

      const cookie = refreshCookie(res.headers['set-cookie']);
      expect(cookie).toMatch(/^refresh_token=[A-Za-z0-9_-]{60,}/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/Max-Age=\d+/);
    });

    it('does not put the refresh token in the response body', async () => {
      const user = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });
      const token =
        /^refresh_token=([^;]+)/.exec(refreshCookie(res.headers['set-cookie']))?.[1] ?? '';

      expect(token).not.toBe('');
      expect(JSON.stringify(res.body)).not.toContain(token);
    });

    it('stores only a hash of the refresh token, expiring after the configured lifetime', async () => {
      const user = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });
      const token =
        /^refresh_token=([^;]+)/.exec(refreshCookie(res.headers['set-cookie']))?.[1] ?? '';

      const rows = await getPrisma().refreshToken.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      const [row] = rows;
      expect(row?.tokenHash).not.toBe(token);
      expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.revokedAt).toBeNull();
      const lifetimeDays = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000;
      expect(lifetimeDays).toBeGreaterThan(6.99);
      expect(lifetimeDays).toBeLessThanOrEqual(7);
    });

    it('records the login time', async () => {
      const user = await createUser();
      const before = Date.now();
      await request(app).post(LOGIN).send({ email: user.email, password: user.password });

      const saved = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
      expect(saved.lastLoginAt?.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('starts a separate session each time (different token family and token)', async () => {
      const user = await createUser();
      await request(app).post(LOGIN).send({ email: user.email, password: user.password });
      await request(app).post(LOGIN).send({ email: user.email, password: user.password });

      const rows = await getPrisma().refreshToken.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(2);
      expect(new Set(rows.map((row) => row.familyId)).size).toBe(2);
      expect(new Set(rows.map((row) => row.tokenHash)).size).toBe(2);
    });

    it('accepts the email in any letter case and with surrounding spaces', async () => {
      const user = await createUser({ email: 'ada@example.com' });
      const res = await request(app)
        .post(LOGIN)
        .send({ email: '  Ada@Example.COM ', password: user.password });

      expect(res.status).toBe(200);
    });
  });

  describe('with credentials that must be refused', () => {
    it('refuses a wrong password', async () => {
      const user = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: 'not-the-password' });

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHENTICATED');
    });

    it('gives the same answer for an unknown email as for a wrong password', async () => {
      const user = await createUser();
      const wrongPassword = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: 'not-the-password' });
      const unknownEmail = await request(app)
        .post(LOGIN)
        .send({ email: 'nobody@example.com', password: 'not-the-password' });

      expect(unknownEmail.status).toBe(wrongPassword.status);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
    });

    it('refuses an inactive account even with the right password, with the same answer', async () => {
      const inactive = await createUser({ isActive: false });
      const active = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: inactive.email, password: inactive.password });
      const wrong = await request(app)
        .post(LOGIN)
        .send({ email: active.email, password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual(wrong.body);
    });

    it('refuses a soft-deleted account', async () => {
      const deleted = await createUser({ deleted: true });
      const res = await request(app)
        .post(LOGIN)
        .send({ email: deleted.email, password: deleted.password });

      expect(res.status).toBe(401);
    });

    it('sets no cookie and stores no token when it refuses', async () => {
      const user = await createUser();
      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: 'wrong-password' });

      expect(refreshCookie(res.headers['set-cookie'])).toBe('');
      expect(await getPrisma().refreshToken.count()).toBe(0);
    });

    it('still checks a password when the email is unknown, so timing does not reveal it', async () => {
      const verify = vi.spyOn(password, 'verifyPassword');
      await request(app)
        .post(LOGIN)
        .send({ email: 'nobody@example.com', password: 'whatever-it-is' });

      expect(verify).toHaveBeenCalledWith('whatever-it-is', DUMMY_PASSWORD_HASH);
      verify.mockRestore();
    });
  });

  describe('with an invalid request', () => {
    it.each([
      ['no body', undefined, ['body']],
      ['an empty object', {}, ['body.email', 'body.password']],
      ['a missing password', { email: 'a@b.co' }, ['body.password']],
      ['a missing email', { password: 'x' }, ['body.email']],
      ['an invalid email', { email: 'not-an-email', password: 'x' }, ['body.email']],
      ['an empty password', { email: 'a@b.co', password: '' }, ['body.password']],
      ['a password that is not text', { email: 'a@b.co', password: 12345 }, ['body.password']],
      ['an enormous password', { email: 'a@b.co', password: 'x'.repeat(201) }, ['body.password']],
    ])('rejects %s with VALIDATION_ERROR naming the fields', async (_label, payload, fields) => {
      const req = request(app).post(LOGIN);
      const res = await (payload === undefined ? req : req.send(payload));

      expect(res.status).toBe(400);
      const body = res.body as ErrorBody;
      expect(body.error.code).toBe('VALIDATION_ERROR');
      const named = (body.error.details?.fields ?? []).map((item) => item.field);
      for (const field of fields) expect(named).toContain(field);
    });

    it('does not echo what the client sent in the error', async () => {
      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'not-an-email', password: 'secret-value-123' });

      expect(JSON.stringify(res.body)).not.toContain('secret-value-123');
      expect(JSON.stringify(res.body)).not.toContain('not-an-email');
    });
  });
});
