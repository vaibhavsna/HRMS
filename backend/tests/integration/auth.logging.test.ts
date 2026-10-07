import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getEnv } from '../../src/config/env.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { TEST_JWT_ACCESS_SECRET, TEST_JWT_REFRESH_SECRET } from '../test-env.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, seedRbac } from '../helpers/factories.js';
import { collectLogs } from '../helpers/logs.js';
import {
  LOGIN,
  LOGOUT,
  ME,
  REFRESH,
  cookiePair,
  refreshCookie,
  tokenOf,
} from '../helpers/session.js';

const WRONG_PASSWORD = 'Wrong-Password-Typed-By-Mistake-1';
const INVALID_BODY_PASSWORD = 'Password-Sent-In-An-Invalid-Body-2';
const MALFORMED_BODY_PASSWORD = 'Password-Sent-In-A-Malformed-Body-3';
const LIMITED_PASSWORD = 'Password-Sent-While-Rate-Limited-4';

describe('what the application logs', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  it('never contains a password, token, cookie or hash, whatever the auth routes receive', async () => {
    const logs = collectLogs();
    // Three failures allowed, so the run below also passes through the rate-limited path.
    const app = createApp(
      { ...getEnv(), LOG_LEVEL: 'trace', LOGIN_RATE_LIMIT_MAX: 3 },
      { logDestination: logs.stream },
    );
    const user = await createUser({ roles: ['admin'] });
    const secrets = new Set<string>([
      user.password,
      WRONG_PASSWORD,
      INVALID_BODY_PASSWORD,
      MALFORMED_BODY_PASSWORD,
      LIMITED_PASSWORD,
      TEST_JWT_ACCESS_SECRET,
      TEST_JWT_REFRESH_SECRET,
    ]);
    const stored = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    secrets.add(stored.passwordHash);

    // A session: login, use it, refresh, replay the old cookie, then a second session and logout.
    const login = await request(app)
      .post(LOGIN)
      .send({ email: user.email, password: user.password });
    const firstAccess = (login.body as { data: { accessToken: string } }).data.accessToken;
    const firstCookie = cookiePair(refreshCookie(login.headers['set-cookie']));
    const me = await request(app).get(ME).set('Authorization', `Bearer ${firstAccess}`);
    const refreshed = await request(app).post(REFRESH).set('Cookie', firstCookie);
    const secondAccess = (refreshed.body as { data: { accessToken: string } }).data.accessToken;
    const secondCookie = cookiePair(refreshCookie(refreshed.headers['set-cookie']));
    const replay = await request(app).post(REFRESH).set('Cookie', firstCookie);
    const out = await request(app)
      .post(LOGOUT)
      .set('Authorization', `Bearer ${secondAccess}`)
      .set('Cookie', secondCookie);
    for (const token of [firstAccess, secondAccess]) {
      secrets.add(token);
      secrets.add(`Bearer ${token}`);
    }
    for (const cookie of [firstCookie, secondCookie]) {
      secrets.add(cookie);
      secrets.add(tokenOf(cookie));
    }

    // Failures: wrong password, an invalid body and a malformed body that all carry a password,
    // a garbage Authorization header, and finally the rate limit.
    const wrong = await request(app)
      .post(LOGIN)
      .send({ email: user.email, password: WRONG_PASSWORD });
    const invalid = await request(app)
      .post(LOGIN)
      .send({ email: 'not-an-email', password: INVALID_BODY_PASSWORD });
    const malformed = await request(app)
      .post(LOGIN)
      .set('Content-Type', 'application/json')
      .send(`{"email":"${user.email}","password":"${MALFORMED_BODY_PASSWORD}",`);
    const wrongAgain = await request(app)
      .post(LOGIN)
      .send({ email: user.email, password: WRONG_PASSWORD });
    const limited = await request(app)
      .post(LOGIN)
      .send({ email: user.email, password: LIMITED_PASSWORD });
    const garbage = await request(app)
      .get(ME)
      .set('Authorization', 'Bearer garbage.token.value')
      .set('Cookie', 'refresh_token=garbage-cookie-value');
    secrets.add('garbage.token.value');
    secrets.add('garbage-cookie-value');

    // The run really went through every path, so "nothing found" below is not an empty-log accident.
    expect(
      [
        login,
        me,
        refreshed,
        replay,
        out,
        wrong,
        invalid,
        malformed,
        wrongAgain,
        limited,
        garbage,
      ].map((res) => res.status),
    ).toEqual([200, 200, 200, 401, 204, 401, 400, 400, 401, 429, 401]);
    const text = logs.text();
    expect(logs.lines().length).toBeGreaterThanOrEqual(11);
    expect(text).toContain('/api/v1/auth/login');
    for (const status of [200, 204, 400, 401, 429])
      expect(text).toContain(`"statusCode":${status}`);

    for (const secret of secrets) {
      expect(
        text,
        `the log contains a secret that starts with "${secret.slice(0, 12)}"`,
      ).not.toContain(secret);
    }
  });
});
