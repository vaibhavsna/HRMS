import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getEnv } from '../../src/config/env.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { verifyAccessToken } from '../../src/lib/tokens.js';
import { TEST_JWT_ACCESS_SECRET } from '../test-env.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, seedRbac } from '../helpers/factories.js';
import { permissionsOf } from '../helpers/rbac.js';
import {
  LOGIN,
  LOGOUT,
  ME,
  REFRESH,
  cookiePair,
  loginAs,
  refreshCookie,
  storedHash,
  tokenOf,
} from '../helpers/session.js';

const app = createApp(getEnv());

interface ErrorBody {
  error: { code: string; message: string };
}
interface RefreshBody {
  data: { accessToken: string };
}

const refreshWith = (cookie?: string) => {
  const req = request(app).post(REFRESH);
  return cookie === undefined ? req : req.set('Cookie', cookie);
};
const logoutWith = (accessToken?: string, cookie?: string) => {
  let req = request(app).post(LOGOUT);
  if (accessToken !== undefined) req = req.set('Authorization', `Bearer ${accessToken}`);
  if (cookie !== undefined) req = req.set('Cookie', cookie);
  return req;
};

/** True if the response tells the browser to delete the refresh cookie. */
function clearsRefreshCookie(setCookie: string | string[] | undefined): boolean {
  const cookie = refreshCookie(setCookie);
  return (
    cookie.startsWith('refresh_token=;') &&
    cookie.includes('Path=/api/v1/auth') &&
    /Expires=Thu, 01 Jan 1970/.test(cookie)
  );
}

const rowFor = (cookie: string) =>
  getPrisma().refreshToken.findUniqueOrThrow({ where: { tokenHash: storedHash(tokenOf(cookie)) } });

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  describe('with a valid refresh cookie', () => {
    it('returns a new access token for the same user and nothing else', async () => {
      const user = await createUser({ roles: ['employee'] });
      const session = await loginAs(app, user);
      const res = await refreshWith(session.cookie);

      expect(res.status).toBe(200);
      const body = res.body as RefreshBody;
      expect(Object.keys(body.data)).toEqual(['accessToken']);
      await expect(
        verifyAccessToken(body.data.accessToken, TEST_JWT_ACCESS_SECRET),
      ).resolves.toEqual({ userId: user.id });
    });

    it('sets a different refresh cookie with the same protections as login', async () => {
      const session = await loginAs(app, await createUser());
      const res = await refreshWith(session.cookie);

      const setCookie = refreshCookie(res.headers['set-cookie']);
      expect(cookiePair(setCookie)).not.toBe(session.cookie);
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Path=/api/v1/auth');
      expect(setCookie).toMatch(/Max-Age=\d+/);
    });

    it('never puts a refresh token in the response body', async () => {
      const session = await loginAs(app, await createUser());
      const res = await refreshWith(session.cookie);
      const newToken = tokenOf(cookiePair(refreshCookie(res.headers['set-cookie'])));

      expect(JSON.stringify(res.body)).not.toContain(newToken);
      expect(JSON.stringify(res.body)).not.toContain(tokenOf(session.cookie));
    });

    it('revokes the token it was given and stores the new one in the same session', async () => {
      const session = await loginAs(app, await createUser());
      const before = await rowFor(session.cookie);
      const res = await refreshWith(session.cookie);
      const after = await rowFor(cookiePair(refreshCookie(res.headers['set-cookie'])));
      const used = await rowFor(session.cookie);

      expect(before.revokedAt).toBeNull();
      expect(used.revokedAt).not.toBeNull();
      expect(after.revokedAt).toBeNull();
      expect(after.familyId).toBe(before.familyId);
      expect(after.userId).toBe(before.userId);
    });

    it('stores only a hash of the new refresh token', async () => {
      const session = await loginAs(app, await createUser());
      const res = await refreshWith(session.cookie);
      const newToken = tokenOf(cookiePair(refreshCookie(res.headers['set-cookie'])));

      const rows = await getPrisma().refreshToken.findMany({ where: { tokenHash: newToken } });
      expect(rows).toHaveLength(0);
      await expect(rowFor(`refresh_token=${newToken}`)).resolves.toMatchObject({
        tokenHash: storedHash(newToken),
      });
    });

    it('gives an access token the protected routes accept', async () => {
      const session = await loginAs(app, await createUser({ roles: ['employee'] }));
      const res = await refreshWith(session.cookie);
      const me = await request(app)
        .get(ME)
        .set('Authorization', `Bearer ${(res.body as RefreshBody).data.accessToken}`);

      expect(me.status).toBe(200);
    });

    it('can be repeated: every new cookie rotates again', async () => {
      let cookie = (await loginAs(app, await createUser())).cookie;
      for (let i = 0; i < 3; i += 1) {
        const res = await refreshWith(cookie);
        expect(res.status).toBe(200);
        cookie = cookiePair(refreshCookie(res.headers['set-cookie']));
      }
      expect(await getPrisma().refreshToken.count({ where: { revokedAt: null } })).toBe(1);
    });
  });

  describe('replaying a refresh token that was already used', () => {
    it('fails with 401 in the error envelope and clears the cookie', async () => {
      const session = await loginAs(app, await createUser());
      await refreshWith(session.cookie);
      const replay = await refreshWith(session.cookie);

      expect(replay.status).toBe(401);
      expect(replay.body).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired refresh token' },
      });
      expect(clearsRefreshCookie(replay.headers['set-cookie'])).toBe(true);
    });

    it('also ends the session: the newest token stops working too', async () => {
      const session = await loginAs(app, await createUser());
      const rotated = await refreshWith(session.cookie);
      const newest = cookiePair(refreshCookie(rotated.headers['set-cookie']));
      await refreshWith(session.cookie); // the replay

      const res = await refreshWith(newest);

      expect(res.status).toBe(401);
      expect(await getPrisma().refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it('leaves the same user’s other sessions alone', async () => {
      const user = await createUser();
      const stolen = await loginAs(app, user);
      const other = await loginAs(app, user);
      await refreshWith(stolen.cookie);
      await refreshWith(stolen.cookie); // replay ends the first session only

      const res = await refreshWith(other.cookie);

      expect(res.status).toBe(200);
    });

    it('leaves other users’ sessions alone', async () => {
      const first = await loginAs(app, await createUser());
      const second = await loginAs(app, await createUser());
      await refreshWith(first.cookie);
      await refreshWith(first.cookie);

      expect((await refreshWith(second.cookie)).status).toBe(200);
    });
  });

  describe('when two requests use the same token at once', () => {
    it('lets one through, refuses the other, and ends the session', async () => {
      const session = await loginAs(app, await createUser());
      const [a, b] = await Promise.all([refreshWith(session.cookie), refreshWith(session.cookie)]);

      expect([a.status, b.status].sort()).toEqual([200, 401]);
      const winner = a.status === 200 ? a : b;
      const winnerCookie = cookiePair(refreshCookie(winner.headers['set-cookie']));
      expect((await refreshWith(winnerCookie)).status).toBe(401);
      expect(await getPrisma().refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    // The test above passes whether or not the requests overlap. This one forces the overlap: a row lock
    // holds both requests after they have read the token as valid and before either can claim it.
    it('refuses the one that lost even though it had read the token as valid', async () => {
      const session = await loginAs(app, await createUser());
      const prisma = getPrisma();
      const { id } = await rowFor(session.cookie);

      let release = (): void => undefined;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let locked = (): void => undefined;
      const hasLock = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM refresh_tokens WHERE id = ${id}::uuid FOR UPDATE`;
          locked();
          await released;
        },
        { timeout: 30_000 },
      );
      await hasLock;

      const both = Promise.all([refreshWith(session.cookie), refreshWith(session.cookie)]);
      const deadline = Date.now() + 10_000;
      for (;;) {
        const [row] = await prisma.$queryRaw<{ waiting: bigint }[]>`
          SELECT count(*) AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND datname = current_database()`;
        if (Number(row?.waiting ?? 0) >= 2) break;
        if (Date.now() > deadline) throw new Error('both requests never reached the claim');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      release();
      await holder;
      const [a, b] = await both;

      expect([a.status, b.status].sort()).toEqual([200, 401]);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });
  });

  describe('with a cookie that cannot be used', () => {
    it('returns 401 and clears the cookie when there is none', async () => {
      const res = await refreshWith();

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error).toEqual({
        code: 'UNAUTHENTICATED',
        message: 'Invalid or expired refresh token',
      });
      expect(clearsRefreshCookie(res.headers['set-cookie'])).toBe(true);
    });

    it('returns 401 for a token that was never issued', async () => {
      const res = await refreshWith('refresh_token=Zm9yZ2VkLXRva2Vu');

      expect(res.status).toBe(401);
    });

    it('returns 401 when the cookie holds an access token instead', async () => {
      const session = await loginAs(app, await createUser());
      const res = await refreshWith(`refresh_token=${session.accessToken}`);

      expect(res.status).toBe(401);
    });

    it('returns 401 for a token that has expired, without ending the session', async () => {
      const session = await loginAs(app, await createUser());
      await getPrisma().refreshToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await refreshWith(session.cookie);

      expect(res.status).toBe(401);
      expect((await rowFor(session.cookie)).revokedAt).toBeNull();
    });

    it('gives every failure the same response body', async () => {
      const user = await createUser();
      const used = await loginAs(app, user);
      await refreshWith(used.cookie);
      const bodies = (
        await Promise.all([
          refreshWith(),
          refreshWith('refresh_token=nonsense'),
          refreshWith(used.cookie),
        ])
      ).map((res) => res.body as ErrorBody);

      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
    });

    it('returns 401 and ends the session when the user has been disabled', async () => {
      const user = await createUser();
      const session = await loginAs(app, user);
      await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });

      const res = await refreshWith(session.cookie);

      expect(res.status).toBe(401);
      expect((await rowFor(session.cookie)).revokedAt).not.toBeNull();
    });

    it('returns 401 and ends the session when the user has been deleted', async () => {
      const user = await createUser();
      const session = await loginAs(app, user);
      await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

      const res = await refreshWith(session.cookie);

      expect(res.status).toBe(401);
      expect((await rowFor(session.cookie)).revokedAt).not.toBeNull();
    });

    it('does not need an access token', async () => {
      const session = await loginAs(app, await createUser());
      const res = await refreshWith(session.cookie).set('Authorization', 'Bearer not-a-token');

      expect(res.status).toBe(200);
    });
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  it('returns 401 without an access token, and does not end the session', async () => {
    const session = await loginAs(app, await createUser());
    const res = await logoutWith(undefined, session.cookie);

    expect(res.status).toBe(401);
    expect((await rowFor(session.cookie)).revokedAt).toBeNull();
  });

  it('returns 204 with no body and clears the refresh cookie', async () => {
    const session = await loginAs(app, await createUser());
    const res = await logoutWith(session.accessToken, session.cookie);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(clearsRefreshCookie(res.headers['set-cookie'])).toBe(true);
  });

  it('revokes the session on the server, so the refresh token no longer works', async () => {
    const session = await loginAs(app, await createUser());
    await logoutWith(session.accessToken, session.cookie);

    expect((await rowFor(session.cookie)).revokedAt).not.toBeNull();
    expect((await refreshWith(session.cookie)).status).toBe(401);
  });

  it('revokes every token of the session, including ones issued by refreshing', async () => {
    const session = await loginAs(app, await createUser());
    const rotated = await refreshWith(session.cookie);
    const newest = cookiePair(refreshCookie(rotated.headers['set-cookie']));
    const accessToken = (rotated.body as RefreshBody).data.accessToken;

    await logoutWith(accessToken, newest);

    expect(await getPrisma().refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('leaves the same user’s other sessions signed in', async () => {
    const user = await createUser();
    const here = await loginAs(app, user);
    const elsewhere = await loginAs(app, user);

    await logoutWith(here.accessToken, here.cookie);

    expect((await refreshWith(elsewhere.cookie)).status).toBe(200);
  });

  it('succeeds without a refresh cookie and clears it anyway', async () => {
    const session = await loginAs(app, await createUser());
    const res = await logoutWith(session.accessToken);

    expect(res.status).toBe(204);
    expect(clearsRefreshCookie(res.headers['set-cookie'])).toBe(true);
    expect((await rowFor(session.cookie)).revokedAt).toBeNull();
  });

  it('ignores a refresh cookie that belongs to another user', async () => {
    const mine = await loginAs(app, await createUser());
    const theirs = await loginAs(app, await createUser());

    const res = await logoutWith(mine.accessToken, theirs.cookie);

    expect(res.status).toBe(204);
    expect((await rowFor(theirs.cookie)).revokedAt).toBeNull();
    expect((await refreshWith(theirs.cookie)).status).toBe(200);
  });

  it('succeeds again when the session is already over', async () => {
    const session = await loginAs(app, await createUser());
    await logoutWith(session.accessToken, session.cookie);

    expect((await logoutWith(session.accessToken, session.cookie)).status).toBe(204);
  });
});

describe('GET /api/v1/auth/me', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  const meWith = (accessToken: string) =>
    request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);

  it('returns 401 without an access token', async () => {
    const res = await request(app).get(ME);

    expect(res.status).toBe(401);
    expect((res.body as ErrorBody).error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the user, no employee, the roles and the permissions of a user without an employee record', async () => {
    const user = await createUser({ roles: ['manager', 'employee'] });
    const session = await loginAs(app, user);
    const res = await meWith(session.accessToken);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: {
        user: {
          id: user.id,
          email: user.email,
          isActive: true,
          lastLoginAt: expect.any(String) as string,
          createdAt: expect.any(String) as string,
        },
        employee: null,
        roles: ['employee', 'manager'],
        permissions: permissionsOf('employee', 'manager'),
      },
    });
  });

  it('returns the linked employee without personal details', async () => {
    const user = await createUser({ roles: ['employee'] });
    const manager = await createUser({ roles: ['manager'] });
    const prisma = getPrisma();
    const department = await prisma.department.create({ data: { name: 'Engineering' } });
    const position = await prisma.jobPosition.create({
      data: { title: 'Developer', departmentId: department.id },
    });
    const managerRecord = await prisma.employee.create({
      data: {
        userId: manager.id,
        employeeCode: 'EMP-0001',
        firstName: 'Grace',
        lastName: 'Hopper',
        workEmail: 'grace@example.com',
        dateJoined: new Date('2020-03-01'),
      },
    });
    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeCode: 'EMP-0002',
        firstName: 'Ada',
        lastName: 'Lovelace',
        workEmail: 'ada@example.com',
        phone: '+1 555 0100',
        dateOfBirth: new Date('1990-05-17'),
        gender: 'female',
        address: '1 Analytical Way',
        departmentId: department.id,
        jobPositionId: position.id,
        managerId: managerRecord.id,
        dateJoined: new Date('2026-01-05'),
      },
    });

    const res = await meWith((await loginAs(app, user)).accessToken);

    expect((res.body as { data: { employee: unknown } }).data.employee).toEqual({
      id: employee.id,
      employeeCode: 'EMP-0002',
      firstName: 'Ada',
      lastName: 'Lovelace',
      workEmail: 'ada@example.com',
      departmentId: department.id,
      jobPositionId: position.id,
      managerId: managerRecord.id,
      dateJoined: '2026-01-05',
      employmentStatus: 'active',
    });
    const text = JSON.stringify(res.body);
    for (const secret of ['+1 555 0100', '1990-05-17', '1 Analytical Way', 'female']) {
      expect(text).not.toContain(secret);
    }
  });

  it('returns no employee when the employee record is soft-deleted', async () => {
    const user = await createUser({ roles: ['employee'] });
    await getPrisma().employee.create({
      data: {
        userId: user.id,
        employeeCode: 'EMP-0003',
        firstName: 'Old',
        lastName: 'Record',
        workEmail: 'old@example.com',
        dateJoined: new Date('2019-01-01'),
        deletedAt: new Date(),
      },
    });

    const res = await meWith((await loginAs(app, user)).accessToken);

    expect((res.body as { data: { employee: unknown } }).data.employee).toBeNull();
  });

  it('never includes the password hash', async () => {
    const user = await createUser({ roles: ['admin'] });
    const res = await meWith((await loginAs(app, user)).accessToken);
    const text = JSON.stringify(res.body).toLowerCase();

    expect(text).not.toContain('password');
    expect(text).not.toContain('$2');
  });

  it('returns 401 once the user has been disabled', async () => {
    const user = await createUser();
    const session = await loginAs(app, user);
    await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });

    expect((await meWith(session.accessToken)).status).toBe(401);
  });

  it('reflects a change to the user’s roles on the next call', async () => {
    const user = await createUser({ roles: ['employee'] });
    const session = await loginAs(app, user);
    const role = await getPrisma().role.findUniqueOrThrow({ where: { name: 'manager' } });
    await getPrisma().userRole.create({ data: { userId: user.id, roleId: role.id } });

    const res = await meWith(session.accessToken);

    expect((res.body as { data: { roles: string[] } }).data.roles).toEqual(['employee', 'manager']);
  });
});

describe('the login, refresh and logout flow', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  it('logs in, refreshes, reads /me, logs out, and then cannot refresh', async () => {
    const user = await createUser({ roles: ['employee'] });
    const login = await request(app)
      .post(LOGIN)
      .send({ email: user.email, password: user.password });
    const cookie = cookiePair(refreshCookie(login.headers['set-cookie']));

    const refreshed = await refreshWith(cookie);
    const accessToken = (refreshed.body as RefreshBody).data.accessToken;
    const me = await request(app).get(ME).set('Authorization', `Bearer ${accessToken}`);
    const next = cookiePair(refreshCookie(refreshed.headers['set-cookie']));
    const out = await logoutWith(accessToken, next);
    const after = await refreshWith(next);

    expect([login.status, refreshed.status, me.status, out.status, after.status]).toEqual([
      200, 200, 200, 204, 401,
    ]);
  });
});
