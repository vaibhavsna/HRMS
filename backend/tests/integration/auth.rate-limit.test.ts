import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { getEnv, type Env } from '../../src/config/env.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, seedRbac } from '../helpers/factories.js';
import { LOGIN, REFRESH, cookiePair, loginAs, refreshCookie } from '../helpers/session.js';

/** A fresh app, so every test starts with empty counters. Login allows 3 failures, refresh 2. */
const appWith = (overrides: Partial<Env> = {}): Express =>
  createApp({ ...getEnv(), LOGIN_RATE_LIMIT_MAX: 3, REFRESH_RATE_LIMIT_MAX: 2, ...overrides });

const WINDOW_MS = 15 * 60 * 1000;

function failedLogin(app: Express, forwardedFor?: string) {
  const req = request(app)
    .post(LOGIN)
    .send({ email: 'nobody@example.com', password: 'wrong-password-123' });
  return forwardedFor === undefined ? req : req.set('X-Forwarded-For', forwardedFor);
}

const failedRefresh = (app: Express) => request(app).post(REFRESH);

interface ErrorBody {
  error: { code: string; message: string };
}

describe('rate limits on /auth/login and /auth/refresh', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('login', () => {
    it('answers 429 in the error envelope, with Retry-After, once the failed attempts are used up', async () => {
      const app = appWith();
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        expect((await failedLogin(app)).status).toBe(401);
      }

      const res = await failedLogin(app);

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Try again later.' },
      });
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(WINDOW_MS / 1000);
      expect(res.headers['ratelimit']).toBeDefined();
      expect(res.headers['ratelimit-policy']).toBeDefined();
    });

    it('refuses even the correct password while limited, and starts no session', async () => {
      const app = appWith();
      const user = await createUser();
      for (let attempt = 1; attempt <= 3; attempt += 1) await failedLogin(app);

      const res = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });

      expect(res.status).toBe(429);
      expect(refreshCookie(res.headers['set-cookie'])).toBe('');
    });

    it('does not count successful logins', async () => {
      const app = appWith();
      const user = await createUser();

      for (let attempt = 1; attempt <= 8; attempt += 1) {
        const res = await request(app)
          .post(LOGIN)
          .send({ email: user.email, password: user.password });
        expect(res.status).toBe(200);
      }
    });

    it('counts only the failures when failures and successes are mixed', async () => {
      const app = appWith();
      const user = await createUser();
      const statuses: number[] = [];
      for (const outcome of ['bad', 'bad', 'good', 'bad', 'bad']) {
        const res =
          outcome === 'good'
            ? await request(app).post(LOGIN).send({ email: user.email, password: user.password })
            : await failedLogin(app);
        statuses.push(res.status);
      }

      expect(statuses).toEqual([401, 401, 200, 401, 429]);
    });

    it('counts requests that fail validation too', async () => {
      const app = appWith();
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        expect((await request(app).post(LOGIN).send({ email: 'not-an-email' })).status).toBe(400);
      }

      expect((await request(app).post(LOGIN).send({ email: 'not-an-email' })).status).toBe(429);
    });

    it('lets attempts through again once the window has passed', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const app = appWith();
      const user = await createUser();
      for (let attempt = 1; attempt <= 4; attempt += 1) await failedLogin(app);
      const limited = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });

      vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
      const after = await request(app)
        .post(LOGIN)
        .send({ email: user.email, password: user.password });

      expect([limited.status, after.status]).toEqual([429, 200]);
    });

    it('limits each client address separately when a proxy is trusted', async () => {
      const app = appWith({ TRUST_PROXY_HOPS: 1 });
      for (let attempt = 1; attempt <= 3; attempt += 1) await failedLogin(app, '203.0.113.10');

      const blocked = await failedLogin(app, '203.0.113.10');
      const other = await failedLogin(app, '203.0.113.11');

      expect([blocked.status, other.status]).toEqual([429, 401]);
    });

    it('cannot be dodged by changing X-Forwarded-For when no proxy is trusted', async () => {
      const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const app = appWith();
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        await failedLogin(app, `198.51.100.${attempt}`);
      }

      const res = await failedLogin(app, '198.51.100.99');
      quiet.mockRestore();

      expect(res.status).toBe(429);
    });
  });

  describe('refresh', () => {
    it('answers 429 in the error envelope once the failed attempts are used up', async () => {
      const app = appWith();
      expect((await failedRefresh(app)).status).toBe(401);
      expect((await failedRefresh(app)).status).toBe(401);

      const res = await failedRefresh(app);

      expect(res.status).toBe(429);
      expect((res.body as ErrorBody).error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('does not count successful refreshes', async () => {
      const app = appWith();
      let cookie = (await loginAs(app, await createUser())).cookie;

      for (let attempt = 1; attempt <= 6; attempt += 1) {
        const res = await request(app).post(REFRESH).set('Cookie', cookie);
        expect(res.status).toBe(200);
        cookie = cookiePair(refreshCookie(res.headers['set-cookie']));
      }
    });

    it('refuses a limited request before it can use up a valid token', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const app = appWith();
      const session = await loginAs(app, await createUser());
      await failedRefresh(app);
      await failedRefresh(app);

      const limited = await request(app).post(REFRESH).set('Cookie', session.cookie);
      vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
      const after = await request(app).post(REFRESH).set('Cookie', session.cookie);

      expect([limited.status, after.status]).toEqual([429, 200]);
    });
  });

  it('keeps separate budgets: failed refreshes do not limit login, and failed logins do not limit refresh', async () => {
    const app = appWith();
    await failedRefresh(app);
    await failedRefresh(app);
    await failedRefresh(app); // refresh is now limited

    expect((await failedLogin(app)).status).toBe(401);

    for (let attempt = 1; attempt <= 3; attempt += 1) await failedLogin(app);
    const other = appWith();
    for (let attempt = 1; attempt <= 3; attempt += 1) await failedLogin(other); // login is now limited
    expect((await failedRefresh(other)).status).toBe(401);
  });

  it('does not limit the routes that need an access token', async () => {
    const app = appWith();
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    }
  });
});
