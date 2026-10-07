import { randomUUID } from 'node:crypto';
import express from 'express';
import { SignJWT } from 'jose';
import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS, type RoleName } from '../../prisma/seed-data.js';
import { getEnv } from '../../src/config/env.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { authenticate, requirePermission, requireUser } from '../../src/middleware/authenticate.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/error.js';
import { TEST_JWT_ACCESS_SECRET } from '../test-env.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, seedRbac } from '../helpers/factories.js';

/**
 * A small app with one route per guard, so the middleware is tested on its own with the real database.
 * The real routes get their own RBAC tests as they are added (S1-7).
 */
function createGuardedApp() {
  const app = express();
  app.use(pinoHttp({ logger: pino({ level: 'silent' }) }));
  app.get('/whoami', authenticate, (req, res) => {
    const user = requireUser(req);
    res.json({
      data: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: [...user.permissions].sort(),
      },
    });
  });
  const guarded = (path: string, permission: Parameters<typeof requirePermission>[0]) =>
    app.get(path, authenticate, requirePermission(permission), (_req, res) => {
      res.json({ data: { ok: true } });
    });
  guarded('/users', 'user:read');
  guarded('/users-delete', 'user:delete');
  guarded('/leave-approve', 'leave_request:approve');
  guarded('/made-up', 'made_up:permission');
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createGuardedApp();

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}
interface WhoAmI {
  data: { id: string; email: string; roles: string[]; permissions: string[] };
}

const bearer = (token: string) => `Bearer ${token}`;
const tokenFor = (userId: string, secret = TEST_JWT_ACCESS_SECRET) =>
  signAccessToken({ userId, secret, ttl: getEnv().ACCESS_TOKEN_TTL });

function expiredTokenFor(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer('hrms-platform')
    .setAudience('hrms-api')
    .setIssuedAt(now - 3600)
    .setExpirationTime(now - 60)
    .sign(new TextEncoder().encode(TEST_JWT_ACCESS_SECRET));
}

const permissionsOf = (...roles: RoleName[]) =>
  PERMISSIONS.filter((p) => p.roles.some((role) => roles.includes(role)))
    .map((p) => `${p.resource}:${p.action}`)
    .sort();

describe('authenticate and requirePermission', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  describe('authenticate', () => {
    it('returns 401 in the error envelope when there is no token', async () => {
      const res = await request(app).get('/whoami');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Authentication required' },
      });
    });

    it.each([
      ['another scheme', (token: string) => `Basic ${token}`],
      ['no scheme', (token: string) => token],
      ['an empty token', () => 'Bearer '],
    ])('returns 401 for %s', async (_name, header) => {
      const user = await createUser();
      const res = await request(app)
        .get('/whoami')
        .set('Authorization', header(await tokenFor(user.id)));

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 for a token that is not a JWT', async () => {
      const res = await request(app).get('/whoami').set('Authorization', bearer('not.a.token'));

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.message).toBe('Invalid or expired access token');
    });

    it('returns 401 for an expired token', async () => {
      const user = await createUser();
      const res = await request(app)
        .get('/whoami')
        .set('Authorization', bearer(await expiredTokenFor(user.id)));

      expect(res.status).toBe(401);
    });

    it('returns 401 for a token signed with another secret', async () => {
      const user = await createUser();
      const res = await request(app)
        .get('/whoami')
        .set(
          'Authorization',
          bearer(await tokenFor(user.id, 'some-other-secret-0123456789abcdef-x')),
        );

      expect(res.status).toBe(401);
    });

    it('returns 401 for a token whose subject is not a UUID', async () => {
      const res = await request(app)
        .get('/whoami')
        .set('Authorization', bearer(await tokenFor('not-a-uuid')));

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHENTICATED');
    });

    it('sets req.user with the id, email, roles and permissions for a valid token', async () => {
      const user = await createUser({ roles: ['employee'] });
      const res = await request(app)
        .get('/whoami')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(200);
      expect((res.body as WhoAmI).data).toEqual({
        id: user.id,
        email: user.email,
        roles: ['employee'],
        permissions: permissionsOf('employee'),
      });
    });

    it('gives a user with several roles the union of their permissions', async () => {
      const user = await createUser({ roles: ['employee', 'manager'] });
      const res = await request(app)
        .get('/whoami')
        .set('Authorization', bearer(await tokenFor(user.id)));

      const { roles, permissions } = (res.body as WhoAmI).data;
      expect([...roles].sort()).toEqual(['employee', 'manager']);
      expect(permissions).toEqual(permissionsOf('employee', 'manager'));
    });

    it('accepts a user with no roles and gives them no permissions', async () => {
      const user = await createUser();
      const res = await request(app)
        .get('/whoami')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(200);
      expect((res.body as WhoAmI).data).toMatchObject({ roles: [], permissions: [] });
    });

    describe('a valid token for an account that cannot sign in', () => {
      it('is refused for a user that does not exist, is disabled or is deleted, all with the same response', async () => {
        const disabled = await createUser({ isActive: false });
        const deleted = await createUser({ deleted: true });
        const responses = await Promise.all(
          [randomUUID(), disabled.id, deleted.id].map(async (id) =>
            request(app)
              .get('/whoami')
              .set('Authorization', bearer(await tokenFor(id))),
          ),
        );

        for (const res of responses) expect(res.status).toBe(401);
        expect(responses[1]?.body).toEqual(responses[0]?.body);
        expect(responses[2]?.body).toEqual(responses[0]?.body);
      });

      it('is refused on the next request after the account is disabled', async () => {
        const user = await createUser({ roles: ['admin'] });
        const token = await tokenFor(user.id);
        const before = await request(app).get('/users').set('Authorization', bearer(token));
        await getPrisma().user.update({ where: { id: user.id }, data: { isActive: false } });
        const after = await request(app).get('/users').set('Authorization', bearer(token));

        expect(before.status).toBe(200);
        expect(after.status).toBe(401);
      });

      it('is refused on the next request after the account is deleted', async () => {
        const user = await createUser({ roles: ['admin'] });
        const token = await tokenFor(user.id);
        await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

        const res = await request(app).get('/users').set('Authorization', bearer(token));

        expect(res.status).toBe(401);
      });
    });
  });

  describe('requirePermission', () => {
    it('returns 401, not 403, when there is no token', async () => {
      const res = await request(app).get('/users-delete');

      expect(res.status).toBe(401);
      expect((res.body as ErrorBody).error.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 in the error envelope when the user lacks the permission', async () => {
      const user = await createUser({ roles: ['employee'] });
      const res = await request(app)
        .get('/users-delete')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action' },
      });
    });

    it('returns 403 for a user with no roles', async () => {
      const user = await createUser();
      const res = await request(app)
        .get('/users')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(403);
    });

    it('lets a user through when their role holds the permission', async () => {
      const user = await createUser({ roles: ['admin'] });
      const res = await request(app)
        .get('/users-delete')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { ok: true } });
    });

    it.each<[RoleName, number]>([
      ['employee', 403],
      ['manager', 200],
      ['hr_manager', 200],
      ['admin', 200],
    ])('for leave_request:approve, a %s gets %i', async (role, status) => {
      const user = await createUser({ roles: [role] });
      const res = await request(app)
        .get('/leave-approve')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(status);
    });

    it('lets a user through with the permission from any one of several roles', async () => {
      const user = await createUser({ roles: ['employee', 'manager'] });
      const res = await request(app)
        .get('/leave-approve')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(200);
    });

    it('gives admin no special pass: a permission nobody was granted is refused for admin too', async () => {
      const user = await createUser({ roles: ['admin'] });
      const res = await request(app)
        .get('/made-up')
        .set('Authorization', bearer(await tokenFor(user.id)));

      expect(res.status).toBe(403);
    });

    describe('changes to roles apply on the next request, with the same token', () => {
      function approveRoute(token: string) {
        return request(app).get('/leave-approve').set('Authorization', bearer(token));
      }

      it('when the grant is removed from the role', async () => {
        const user = await createUser({ roles: ['manager'] });
        const token = await tokenFor(user.id);
        const before = await approveRoute(token);
        await getPrisma().rolePermission.deleteMany({
          where: {
            role: { name: 'manager' },
            permission: { resource: 'leave_request', action: 'approve' },
          },
        });
        const after = await approveRoute(token);

        expect([before.status, after.status]).toEqual([200, 403]);
      });

      it('when the role is taken away from the user', async () => {
        const user = await createUser({ roles: ['manager'] });
        const token = await tokenFor(user.id);
        await getPrisma().userRole.deleteMany({ where: { userId: user.id } });

        expect((await approveRoute(token)).status).toBe(403);
      });

      it.each([
        [
          'the role is soft-deleted',
          () =>
            getPrisma().role.updateMany({
              where: { name: 'manager' },
              data: { deletedAt: new Date() },
            }),
        ],
        [
          'the user-role link is soft-deleted',
          () => getPrisma().userRole.updateMany({ data: { deletedAt: new Date() } }),
        ],
        [
          'the grant is soft-deleted',
          () =>
            getPrisma().rolePermission.updateMany({
              where: {
                role: { name: 'manager' },
                permission: { resource: 'leave_request', action: 'approve' },
              },
              data: { deletedAt: new Date() },
            }),
        ],
        [
          'the permission is soft-deleted',
          () =>
            getPrisma().permission.updateMany({
              where: { resource: 'leave_request', action: 'approve' },
              data: { deletedAt: new Date() },
            }),
        ],
      ])('when %s', async (_name, remove) => {
        const user = await createUser({ roles: ['manager'] });
        const token = await tokenFor(user.id);
        await remove();

        expect((await approveRoute(token)).status).toBe(403);
      });
    });
  });
});
