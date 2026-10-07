import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getEnv } from '../../src/config/env.js';
import { verifyPassword } from '../../src/lib/password.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { ADMIN_GUARD_LOCK_KEY } from '../../src/modules/users/users.service.js';
import { accessTokenFor, apiAs, roleId } from '../helpers/api.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, createUserWithOnly, seedRbac } from '../helpers/factories.js';
import { LOGIN, REFRESH, loginAs } from '../helpers/session.js';

const app = createApp(getEnv());

interface UserBody {
  id: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: { id: string; name: string; description: string }[];
}
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { fields?: { field: string; message: string }[] };
  };
}
interface ListBody {
  data: UserBody[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const STRONG_PASSWORD = 'a-long-enough-password-1';
const roleNames = (user: UserBody) => user.roles.map((role) => role.name);

async function admin(overrides: { email?: string } = {}) {
  return createUser({ roles: ['admin'], ...overrides });
}

describe('users API', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  describe('permissions', () => {
    const someId = randomUUID();
    const routes: [string, string, string][] = [
      ['GET', '/api/v1/users', 'user:read'],
      ['POST', '/api/v1/users', 'user:create'],
      ['GET', `/api/v1/users/${someId}`, 'user:read'],
      ['PATCH', `/api/v1/users/${someId}`, 'user:update'],
      ['DELETE', `/api/v1/users/${someId}`, 'user:delete'],
      ['POST', `/api/v1/users/${someId}/roles`, 'user:update'],
    ];
    const call = (method: string, path: string, token?: string) => {
      const req = request(app)[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path);
      return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
    };

    it.each(routes)('%s %s needs a token (%s)', async (method, path) => {
      const res = await call(method, path);

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHENTICATED');
    });

    it.each(['hr_manager', 'manager', 'employee'] as const)(
      'a user who is only %s is refused on every route with 403',
      async (role) => {
        const user = await createUser({ roles: [role] });
        const token = await accessTokenFor(user.id);

        for (const [method, path] of routes) {
          const res = await call(method, path, token);
          expect(res.status, `${method} ${path}`).toBe(403);
          expect((res.body as ErrorBody).error.code).toBe('FORBIDDEN');
        }
      },
    );

    it.each(['user:read', 'user:create', 'user:update', 'user:delete'])(
      'a user who holds only %s may use exactly the routes that ask for it',
      async (permission) => {
        const user = await createUserWithOnly(permission);
        const token = await accessTokenFor(user.id);

        for (const [method, path, required] of routes) {
          const res = await call(method, path, token);
          if (required === permission) {
            expect([401, 403], `${method} ${path} should be allowed`).not.toContain(res.status);
          } else {
            expect(res.status, `${method} ${path} should be refused`).toBe(403);
          }
        }
      },
    );

    it('checks the permission before the input, so a refused user learns nothing about the body', async () => {
      const user = await createUser({ roles: ['employee'] });
      const api = await apiAs(app, user);

      const res = await api.post('/api/v1/users', { email: 'not-an-email' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /users', () => {
    it('returns the users with their roles and the page details, without password hashes', async () => {
      const actor = await admin();
      const other = await createUser({ roles: ['employee', 'manager'] });
      const api = await apiAs(app, actor);

      const res = await api.get('/api/v1/users');

      expect(res.status).toBe(200);
      const body = res.body as ListBody;
      expect(body.meta).toEqual({ page: 1, limit: 20, total: 2, totalPages: 1 });
      const found = body.data.find((user) => user.id === other.id);
      expect(found).toMatchObject({ email: other.email, isActive: true, lastLoginAt: null });
      expect(roleNames(found as UserBody)).toEqual(['employee', 'manager']);
      expect(JSON.stringify(res.body).toLowerCase()).not.toContain('password');
      expect(JSON.stringify(res.body)).not.toContain('$2');
    });

    it('leaves out deleted users', async () => {
      const actor = await admin();
      const gone = await createUser({ deleted: true });
      const res = await (await apiAs(app, actor)).get('/api/v1/users');

      const ids = (res.body as ListBody).data.map((user) => user.id);
      expect(ids).toEqual([actor.id]);
      expect(ids).not.toContain(gone.id);
    });

    it('pages the results and reports the totals', async () => {
      const actor = await admin();
      for (let i = 0; i < 5; i += 1) await createUser({ email: `member${i}@example.com` });
      const api = await apiAs(app, actor);

      const first = await api.get('/api/v1/users?limit=2&page=1&sort=email');
      const last = await api.get('/api/v1/users?limit=2&page=3&sort=email');

      expect((first.body as ListBody).meta).toEqual({ page: 1, limit: 2, total: 6, totalPages: 3 });
      expect((first.body as ListBody).data).toHaveLength(2);
      expect((last.body as ListBody).data).toHaveLength(2);
      const everything = await Promise.all(
        [1, 2, 3].map(
          async (page) =>
            (await api.get(`/api/v1/users?limit=2&page=${page}&sort=email`)).body as ListBody,
        ),
      );
      const emails = everything.flatMap((page) => page.data.map((user) => user.email));
      expect(new Set(emails).size).toBe(6);
      expect(emails).toEqual([...emails].sort());
    });

    it('returns an empty page past the end', async () => {
      const actor = await admin();
      const res = await (await apiAs(app, actor)).get('/api/v1/users?page=5');

      expect((res.body as ListBody).data).toEqual([]);
      expect((res.body as ListBody).meta.total).toBe(1);
    });

    it('searches the email with q, ignoring case', async () => {
      const actor = await admin({ email: 'boss@example.com' });
      await createUser({ email: 'Ada.Lovelace@example.com' });
      await createUser({ email: 'grace@example.org' });
      const api = await apiAs(app, actor);

      const byName = await api.get('/api/v1/users?q=LOVELACE');
      const byDomain = await api.get('/api/v1/users?q=example.org');

      // Stored with capitals (inserted directly, not through the API) and found by a term in other capitals.
      expect((byName.body as ListBody).data.map((u) => u.email)).toEqual([
        'Ada.Lovelace@example.com',
      ]);
      expect((byDomain.body as ListBody).data.map((u) => u.email)).toEqual(['grace@example.org']);
      expect((byName.body as ListBody).meta.total).toBe(1);
    });

    it('treats % and _ in q as ordinary characters', async () => {
      const actor = await admin({ email: 'boss@example.com' });
      await createUser({ email: 'a_b@example.com' });
      await createUser({ email: 'axb@example.com' });
      const api = await apiAs(app, actor);

      const underscore = await api.get('/api/v1/users?q=a_b');
      const percent = await api.get('/api/v1/users?q=%25');

      expect((underscore.body as ListBody).data.map((u) => u.email)).toEqual(['a_b@example.com']);
      expect((percent.body as ListBody).data).toEqual([]);
    });

    it('sorts by a listed field in either direction', async () => {
      const actor = await admin({ email: 'm@example.com' });
      await createUser({ email: 'a@example.com' });
      await createUser({ email: 'z@example.com' });
      const api = await apiAs(app, actor);

      const asc = await api.get('/api/v1/users?sort=email');
      const desc = await api.get('/api/v1/users?sort=-email');

      expect((asc.body as ListBody).data.map((u) => u.email)).toEqual([
        'a@example.com',
        'm@example.com',
        'z@example.com',
      ]);
      expect((desc.body as ListBody).data.map((u) => u.email)).toEqual([
        'z@example.com',
        'm@example.com',
        'a@example.com',
      ]);
    });

    it('sorts by last login with accounts that never signed in at the end', async () => {
      const actor = await admin({ email: 'actor@example.com' });
      const early = await createUser({ email: 'early@example.com' });
      const late = await createUser({ email: 'late@example.com' });
      await getPrisma().user.update({
        where: { id: early.id },
        data: { lastLoginAt: new Date('2026-01-01T00:00:00Z') },
      });
      await getPrisma().user.update({
        where: { id: late.id },
        data: { lastLoginAt: new Date('2026-06-01T00:00:00Z') },
      });
      const api = await apiAs(app, actor);

      const asc = await api.get('/api/v1/users?sort=last_login_at');
      const desc = await api.get('/api/v1/users?sort=-last_login_at');

      expect((asc.body as ListBody).data.map((u) => u.email)).toEqual([
        'early@example.com',
        'late@example.com',
        'actor@example.com',
      ]);
      expect((desc.body as ListBody).data.map((u) => u.email)).toEqual([
        'late@example.com',
        'early@example.com',
        'actor@example.com',
      ]);
    });

    it.each([
      ['page=0', 'query.page'],
      ['limit=101', 'query.limit'],
      ['limit=0', 'query.limit'],
      ['sort=password_hash', 'query.sort'],
      ['sort=-', 'query.sort'],
      ['q=', 'query.q'],
    ])('rejects %s with 400 naming the field', async (query, field) => {
      const actor = await admin();
      const res = await (await apiAs(app, actor)).get(`/api/v1/users?${query}`);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.code).toBe('VALIDATION_ERROR');
      expect((res.body as ErrorBody).error.details?.fields?.map((f) => f.field)).toContain(field);
    });
  });

  describe('GET /users/:id', () => {
    it('returns the user with their roles', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['manager'] });
      const res = await (await apiAs(app, actor)).get(`/api/v1/users/${target.id}`);

      expect(res.status).toBe(200);
      const user = (res.body as { data: UserBody }).data;
      expect(user).toMatchObject({ id: target.id, email: target.email, isActive: true });
      expect(roleNames(user)).toEqual(['manager']);
    });

    it('does not list a soft-deleted role', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['manager', 'employee'] });
      await getPrisma().role.update({
        where: { name: 'manager' },
        data: { deletedAt: new Date() },
      });
      const res = await (await apiAs(app, actor)).get(`/api/v1/users/${target.id}`);

      expect(roleNames((res.body as { data: UserBody }).data)).toEqual(['employee']);
    });

    it.each([
      ['an id that does not exist', () => Promise.resolve(randomUUID()), 404],
      ['a deleted user', async () => (await createUser({ deleted: true })).id, 404],
      ['an id that is not a UUID', () => Promise.resolve('not-a-uuid'), 400],
    ])('answers for %s', async (_name, makeId, status) => {
      const actor = await admin();
      const res = await (await apiAs(app, actor)).get(`/api/v1/users/${await makeId()}`);

      expect(res.status).toBe(status);
    });
  });

  describe('POST /users', () => {
    it('creates the user with the roles, answers 201, and never returns the password or its hash', async () => {
      const actor = await admin();
      const roles = [await roleId('employee'), await roleId('manager')];
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: 'new.hire@example.com',
        password: STRONG_PASSWORD,
        roleIds: roles,
      });

      expect(res.status).toBe(201);
      const user = (res.body as { data: UserBody }).data;
      expect(user).toMatchObject({
        email: 'new.hire@example.com',
        isActive: true,
        lastLoginAt: null,
      });
      expect(roleNames(user)).toEqual(['employee', 'manager']);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain(STRONG_PASSWORD);
      expect(text.toLowerCase()).not.toContain('password');
    });

    it('stores a bcrypt hash with cost 12, not the password', async () => {
      const actor = await admin();
      await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: 'hashed@example.com',
        password: STRONG_PASSWORD,
        roleIds: [],
      });

      const row = await getPrisma().user.findUniqueOrThrow({
        where: { email: 'hashed@example.com' },
      });
      expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(row.passwordHash).not.toContain(STRONG_PASSWORD);
      await expect(verifyPassword(STRONG_PASSWORD, row.passwordHash)).resolves.toBe(true);
    });

    it('lets the new user log in', async () => {
      const actor = await admin();
      await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: 'login.me@example.com',
        password: STRONG_PASSWORD,
        roleIds: [await roleId('employee')],
      });

      const res = await request(app)
        .post(LOGIN)
        .send({ email: 'login.me@example.com', password: STRONG_PASSWORD });

      expect(res.status).toBe(200);
    });

    it('trims and lower-cases the email', async () => {
      const actor = await admin();
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: '  Mixed.Case@Example.COM ',
        password: STRONG_PASSWORD,
        roleIds: [],
      });

      expect((res.body as { data: UserBody }).data.email).toBe('mixed.case@example.com');
    });

    it('ignores a role id that is repeated', async () => {
      const actor = await admin();
      const employee = await roleId('employee');
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: 'dupes@example.com',
        password: STRONG_PASSWORD,
        roleIds: [employee, employee],
      });

      expect(res.status).toBe(201);
      expect(roleNames((res.body as { data: UserBody }).data)).toEqual(['employee']);
    });

    it('answers 409 for an email that is taken, whatever its case', async () => {
      const actor = await admin();
      const existing = await createUser({ email: 'taken@example.com' });
      const api = await apiAs(app, actor);

      const same = await api.post('/api/v1/users', {
        email: existing.email,
        password: STRONG_PASSWORD,
        roleIds: [],
      });
      const upper = await api.post('/api/v1/users', {
        email: 'TAKEN@example.com',
        password: STRONG_PASSWORD,
        roleIds: [],
      });

      expect(same.status).toBe(409);
      expect((same.body as ErrorBody).error).toEqual({
        code: 'CONFLICT',
        message: 'A user with this email already exists',
      });
      expect(upper.status).toBe(409);
    });

    it('answers 409 for the email of a deleted user, which stays reserved', async () => {
      const actor = await admin();
      const gone = await createUser({ email: 'gone@example.com', deleted: true });
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', { email: gone.email, password: STRONG_PASSWORD, roleIds: [] });

      expect(res.status).toBe(409);
    });

    it('does not create a user when the roles are wrong', async () => {
      const actor = await admin();
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: 'no.roles@example.com',
        password: STRONG_PASSWORD,
        roleIds: [randomUUID()],
      });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields).toEqual([
        { field: 'body.roleIds', message: 'contains a role that does not exist' },
      ]);
      expect(await getPrisma().user.count({ where: { email: 'no.roles@example.com' } })).toBe(0);
    });

    it('refuses a role that has been deleted', async () => {
      const actor = await admin();
      const id = await roleId('manager');
      await getPrisma().role.update({ where: { id }, data: { deletedAt: new Date() } });
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', { email: 'x@example.com', password: STRONG_PASSWORD, roleIds: [id] });

      expect(res.status).toBe(400);
    });

    it.each([
      ['a password of 11 characters', { password: 'short-pw-11' }, 'body.password'],
      ['a password over 72 bytes', { password: '€'.repeat(25) }, 'body.password'],
      ['a missing password', { password: undefined }, 'body.password'],
      ['an invalid email', { email: 'not-an-email' }, 'body.email'],
      ['a missing email', { email: undefined }, 'body.email'],
      ['role ids that are not UUIDs', { roleIds: ['employee'] }, 'body.roleIds.0'],
      ['missing role ids', { roleIds: undefined }, 'body.roleIds'],
    ])('rejects %s with 400 and does not echo the password', async (_name, change, field) => {
      const actor = await admin();
      const body = {
        email: 'valid@example.com',
        password: STRONG_PASSWORD,
        roleIds: [],
        ...change,
      };
      const res = await (await apiAs(app, actor)).post('/api/v1/users', body);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields?.map((f) => f.field)).toContain(field);
      if (typeof body.password === 'string')
        expect(JSON.stringify(res.body)).not.toContain(body.password);
    });

    it('accepts a password of exactly 72 bytes', async () => {
      const actor = await admin();
      const res = await (
        await apiAs(app, actor)
      ).post('/api/v1/users', {
        email: 'long.pw@example.com',
        password: 'x'.repeat(72),
        roleIds: [],
      });

      expect(res.status).toBe(201);
    });
  });

  describe('PATCH /users/:id', () => {
    it('changes the email, normalised', async () => {
      const actor = await admin();
      const target = await createUser();
      const res = await (
        await apiAs(app, actor)
      ).patch(`/api/v1/users/${target.id}`, { email: ' New.Address@Example.com ' });

      expect(res.status).toBe(200);
      expect((res.body as { data: UserBody }).data.email).toBe('new.address@example.com');
    });

    it('answers 409 when the email belongs to someone else', async () => {
      const actor = await admin();
      const target = await createUser();
      const other = await createUser({ email: 'other@example.com' });
      const res = await (
        await apiAs(app, actor)
      ).patch(`/api/v1/users/${target.id}`, { email: other.email });

      expect(res.status).toBe(409);
    });

    it('turns an account off and on again', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const api = await apiAs(app, actor);

      const off = await api.patch(`/api/v1/users/${target.id}`, { isActive: false });
      const login = await request(app)
        .post(LOGIN)
        .send({ email: target.email, password: target.password });
      const on = await api.patch(`/api/v1/users/${target.id}`, { isActive: true });
      const again = await request(app)
        .post(LOGIN)
        .send({ email: target.email, password: target.password });

      expect((off.body as { data: UserBody }).data.isActive).toBe(false);
      expect(login.status).toBe(401);
      expect((on.body as { data: UserBody }).data.isActive).toBe(true);
      expect(again.status).toBe(200);
    });

    it('ends the sessions of an account that is turned off, for good', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const session = await loginAs(app, target);
      const api = await apiAs(app, actor);

      await api.patch(`/api/v1/users/${target.id}`, { isActive: false });
      await api.patch(`/api/v1/users/${target.id}`, { isActive: true });

      const refresh = await request(app).post(REFRESH).set('Cookie', session.cookie);
      expect(refresh.status).toBe(401);
      const live = await getPrisma().refreshToken.count({
        where: { userId: target.id, revokedAt: null },
      });
      expect(live).toBe(0);
    });

    it('locks out an access token that was issued before the account was turned off', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const session = await loginAs(app, target);
      await (await apiAs(app, actor)).patch(`/api/v1/users/${target.id}`, { isActive: false });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect(res.status).toBe(401);
    });

    it('refuses to turn off the last active admin', async () => {
      const only = await admin();
      const res = await (
        await apiAs(app, only)
      ).patch(`/api/v1/users/${only.id}`, { isActive: false });

      expect(res.status).toBe(409);
      expect((res.body as ErrorBody).error).toEqual({
        code: 'CONFLICT',
        message: 'There must always be at least one active admin',
      });
      expect((await getPrisma().user.findUniqueOrThrow({ where: { id: only.id } })).isActive).toBe(
        true,
      );
    });

    it('allows turning off an admin when another active admin remains', async () => {
      const first = await admin();
      const second = await admin();
      const res = await (
        await apiAs(app, first)
      ).patch(`/api/v1/users/${second.id}`, { isActive: false });

      expect(res.status).toBe(200);
    });

    it('does not count a disabled admin as the other admin', async () => {
      const active = await admin();
      await createUser({ roles: ['admin'], isActive: false });
      const res = await (
        await apiAs(app, active)
      ).patch(`/api/v1/users/${active.id}`, { isActive: false });

      expect(res.status).toBe(409);
    });

    it('does not count a deleted admin as the other admin', async () => {
      const active = await admin();
      await createUser({ roles: ['admin'], deleted: true });
      const res = await (
        await apiAs(app, active)
      ).patch(`/api/v1/users/${active.id}`, { isActive: false });

      expect(res.status).toBe(409);
    });

    it('does not count a user whose admin role was taken away as the other admin', async () => {
      const active = await admin();
      const former = await admin();
      await getPrisma().userRole.updateMany({
        where: { userId: former.id },
        data: { deletedAt: new Date() },
      });
      const res = await (
        await apiAs(app, active)
      ).patch(`/api/v1/users/${active.id}`, { isActive: false });

      expect(res.status).toBe(409);
    });

    it('turns off a user who is not an admin even when there is only one admin', async () => {
      const only = await admin();
      const member = await createUser({ roles: ['employee'] });
      const res = await (
        await apiAs(app, only)
      ).patch(`/api/v1/users/${member.id}`, { isActive: false });

      expect(res.status).toBe(200);
    });

    it.each([
      ['an empty body', {}, 'body'],
      ['an email that is not an email', { email: 'nope' }, 'body.email'],
      ['isActive that is not a boolean', { isActive: 'no' }, 'body.isActive'],
    ])('rejects %s with 400', async (_name, body, field) => {
      const actor = await admin();
      const target = await createUser();
      const res = await (await apiAs(app, actor)).patch(`/api/v1/users/${target.id}`, body);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields?.map((f) => f.field)).toContain(field);
    });

    it('answers 404 for a user that does not exist or is deleted', async () => {
      const actor = await admin();
      const gone = await createUser({ deleted: true });
      const api = await apiAs(app, actor);

      expect((await api.patch(`/api/v1/users/${randomUUID()}`, { isActive: true })).status).toBe(
        404,
      );
      expect((await api.patch(`/api/v1/users/${gone.id}`, { isActive: true })).status).toBe(404);
    });
  });

  describe('DELETE /users/:id', () => {
    it('answers 204 and soft-deletes: the row stays, the API no longer shows it', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const api = await apiAs(app, actor);

      const res = await api.delete(`/api/v1/users/${target.id}`);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      const row = await getPrisma().user.findUniqueOrThrow({ where: { id: target.id } });
      expect(row.deletedAt).not.toBeNull();
      expect((await api.get(`/api/v1/users/${target.id}`)).status).toBe(404);
      const list = await api.get('/api/v1/users');
      expect((list.body as ListBody).data.map((u) => u.id)).not.toContain(target.id);
    });

    it('stops the user logging in and ends their sessions', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const session = await loginAs(app, target);
      await (await apiAs(app, actor)).delete(`/api/v1/users/${target.id}`);

      // Checked first: a refresh attempt would itself end the session, and hide a delete that did not.
      expect(
        await getPrisma().refreshToken.count({ where: { userId: target.id, revokedAt: null } }),
      ).toBe(0);
      const login = await request(app)
        .post(LOGIN)
        .send({ email: target.email, password: target.password });
      const refresh = await request(app).post(REFRESH).set('Cookie', session.cookie);
      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`);

      expect([login.status, refresh.status, me.status]).toEqual([401, 401, 401]);
    });

    it('refuses to delete the last active admin', async () => {
      const only = await admin();
      const res = await (await apiAs(app, only)).delete(`/api/v1/users/${only.id}`);

      expect(res.status).toBe(409);
      expect(
        (await getPrisma().user.findUniqueOrThrow({ where: { id: only.id } })).deletedAt,
      ).toBeNull();
    });

    it('allows deleting an admin when another active admin remains', async () => {
      const first = await admin();
      const second = await admin();
      const res = await (await apiAs(app, first)).delete(`/api/v1/users/${second.id}`);

      expect(res.status).toBe(204);
    });

    it('answers 404 the second time', async () => {
      const actor = await admin();
      const target = await createUser();
      const api = await apiAs(app, actor);
      await api.delete(`/api/v1/users/${target.id}`);

      expect((await api.delete(`/api/v1/users/${target.id}`)).status).toBe(404);
    });

    it('answers 400 for an id that is not a UUID', async () => {
      const actor = await admin();
      expect((await (await apiAs(app, actor)).delete('/api/v1/users/42')).status).toBe(400);
    });
  });

  describe('POST /users/:id/roles', () => {
    it('sets the roles to exactly the ones given and returns the user', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const res = await (
        await apiAs(app, actor)
      ).post(`/api/v1/users/${target.id}/roles`, {
        roleIds: [await roleId('manager'), await roleId('hr_manager')],
      });

      expect(res.status).toBe(200);
      expect(roleNames((res.body as { data: UserBody }).data)).toEqual(['hr_manager', 'manager']);
    });

    it('removes every role when the list is empty', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee', 'manager'] });
      const res = await (
        await apiAs(app, actor)
      ).post(`/api/v1/users/${target.id}/roles`, { roleIds: [] });

      expect(res.status).toBe(200);
      expect((res.body as { data: UserBody }).data.roles).toEqual([]);
    });

    it('can give a removed role back', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['manager'] });
      const api = await apiAs(app, actor);
      await api.post(`/api/v1/users/${target.id}/roles`, { roleIds: [] });

      const res = await api.post(`/api/v1/users/${target.id}/roles`, {
        roleIds: [await roleId('manager')],
      });

      expect(roleNames((res.body as { data: UserBody }).data)).toEqual(['manager']);
      expect(await getPrisma().userRole.count({ where: { userId: target.id } })).toBe(1);
    });

    it('applies from the user’s next request, with the token they already hold', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const session = await loginAs(app, target);
      const asTarget = () =>
        request(app).get('/api/v1/users').set('Authorization', `Bearer ${session.accessToken}`);
      const before = await asTarget();
      await (
        await apiAs(app, actor)
      ).post(`/api/v1/users/${target.id}/roles`, { roleIds: [await roleId('admin')] });
      const after = await asTarget();

      expect([before.status, after.status]).toEqual([403, 200]);
    });

    it('refuses a role that does not exist and changes nothing', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const res = await (
        await apiAs(app, actor)
      ).post(`/api/v1/users/${target.id}/roles`, {
        roleIds: [await roleId('manager'), randomUUID()],
      });

      expect(res.status).toBe(400);
      const stored = await getPrisma().userRole.findMany({
        where: { userId: target.id, deletedAt: null },
        include: { role: true },
      });
      expect(stored.map((r) => r.role.name)).toEqual(['employee']);
    });

    it('refuses to take the admin role from the last active admin', async () => {
      const only = await admin();
      const res = await (
        await apiAs(app, only)
      ).post(`/api/v1/users/${only.id}/roles`, { roleIds: [await roleId('employee')] });

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: { code: 'CONFLICT' } });
      const roles = await getPrisma().userRole.findMany({
        where: { userId: only.id, deletedAt: null },
        include: { role: true },
      });
      expect(roles.map((r) => r.role.name)).toEqual(['admin']);
    });

    it('refuses an empty list for the last active admin', async () => {
      const only = await admin();
      const res = await (
        await apiAs(app, only)
      ).post(`/api/v1/users/${only.id}/roles`, { roleIds: [] });

      expect(res.status).toBe(409);
    });

    it('lets the last admin keep the admin role while changing the others', async () => {
      const only = await admin();
      const res = await (
        await apiAs(app, only)
      ).post(`/api/v1/users/${only.id}/roles`, {
        roleIds: [await roleId('admin'), await roleId('manager')],
      });

      expect(res.status).toBe(200);
      expect(roleNames((res.body as { data: UserBody }).data)).toEqual(['admin', 'manager']);
    });

    it('allows taking the admin role from an admin when another remains', async () => {
      const first = await admin();
      const second = await admin();
      const res = await (
        await apiAs(app, first)
      ).post(`/api/v1/users/${second.id}/roles`, { roleIds: [await roleId('employee')] });

      expect(res.status).toBe(200);
    });

    it.each([
      ['a body without roleIds', {}, 'body.roleIds'],
      ['role ids that are not UUIDs', { roleIds: ['x'] }, 'body.roleIds.0'],
    ])('rejects %s with 400', async (_name, body, field) => {
      const actor = await admin();
      const target = await createUser();
      const res = await (await apiAs(app, actor)).post(`/api/v1/users/${target.id}/roles`, body);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields?.map((f) => f.field)).toContain(field);
    });

    it('answers 404 for a user that does not exist or is deleted', async () => {
      const actor = await admin();
      const gone = await createUser({ deleted: true });
      const api = await apiAs(app, actor);

      expect((await api.post(`/api/v1/users/${randomUUID()}/roles`, { roleIds: [] })).status).toBe(
        404,
      );
      expect((await api.post(`/api/v1/users/${gone.id}/roles`, { roleIds: [] })).status).toBe(404);
    });
  });

  describe('the last-admin rule under concurrency', () => {
    async function holdAdminGuardLock() {
      const prisma = getPrisma();
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
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_GUARD_LOCK_KEY}::bigint)`;
          locked();
          await released;
        },
        { timeout: 30_000 },
      );
      await hasLock;
      return {
        release: async () => {
          release();
          await holder;
        },
      };
    }

    async function waitForAdvisoryWaiter() {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const [row] = await getPrisma().$queryRaw<{ waiting: bigint }[]>`
          SELECT count(*) AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        if (Number(row?.waiting ?? 0) >= 1) return;
        if (Date.now() > deadline)
          throw new Error('the request never waited for the admin guard lock');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }

    it.each([
      [
        'turning an account off',
        (api: Awaited<ReturnType<typeof apiAs>>, id: string) =>
          api.patch(`/api/v1/users/${id}`, { isActive: false }),
      ],
      [
        'deleting a user',
        (api: Awaited<ReturnType<typeof apiAs>>, id: string) => api.delete(`/api/v1/users/${id}`),
      ],
    ])('%s waits for the admin guard lock, then goes through', async (_name, act) => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const api = await apiAs(app, actor);
      const lock = await holdAdminGuardLock();

      let finished = false;
      const pending = act(api, target.id).then((res) => {
        finished = true;
        return res;
      });
      await waitForAdvisoryWaiter();
      expect(finished).toBe(false);
      await lock.release();
      const res = await pending;

      expect([200, 204]).toContain(res.status);
    });

    it('changing roles waits for the admin guard lock, then goes through', async () => {
      const actor = await admin();
      const target = await createUser({ roles: ['employee'] });
      const api = await apiAs(app, actor);
      const lock = await holdAdminGuardLock();

      let finished = false;
      const pending = api.post(`/api/v1/users/${target.id}/roles`, { roleIds: [] }).then((res) => {
        finished = true;
        return res;
      });
      await waitForAdvisoryWaiter();
      expect(finished).toBe(false);
      await lock.release();

      expect((await pending).status).toBe(200);
    });

    it('two admins turning each other off at the same moment cannot both succeed', async () => {
      const a = await admin();
      const b = await admin();
      const [apiA, apiB] = await Promise.all([apiAs(app, a), apiAs(app, b)]);

      const [first, second] = await Promise.all([
        apiA.patch(`/api/v1/users/${b.id}`, { isActive: false }),
        apiB.patch(`/api/v1/users/${a.id}`, { isActive: false }),
      ]);

      expect([first.status, second.status].filter((status) => status === 200)).toHaveLength(1);
      expect(await getPrisma().user.count({ where: { isActive: true, deletedAt: null } })).toBe(1);
    });
  });
});
