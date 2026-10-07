import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_NAMES, type RoleName } from '../../prisma/seed-data.js';
import { createApp } from '../../src/app.js';
import { getEnv } from '../../src/config/env.js';
import { signAccessToken } from '../../src/lib/tokens.js';
import { TEST_JWT_ACCESS_SECRET } from '../test-env.js';
import { accessTokenFor } from '../helpers/api.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, seedRbac } from '../helpers/factories.js';
import { listRoutes } from '../helpers/routes.js';

const app = createApp(getEnv());

interface Expected {
  method: string;
  path: string;
  /** The permission the route asks for, or null when any signed-in user may call it. */
  permission: string | null;
}

/**
 * Every route that needs a token, as listed in docs/03 for the modules built so far. Add a route here in
 * the same change that adds it to the app: the inventory test below fails if the two differ.
 */
const PROTECTED: Expected[] = [
  { method: 'POST', path: '/api/v1/auth/logout', permission: null },
  { method: 'GET', path: '/api/v1/auth/me', permission: null },
  { method: 'GET', path: '/api/v1/users', permission: 'user:read' },
  { method: 'POST', path: '/api/v1/users', permission: 'user:create' },
  { method: 'GET', path: '/api/v1/users/:id', permission: 'user:read' },
  { method: 'PATCH', path: '/api/v1/users/:id', permission: 'user:update' },
  { method: 'DELETE', path: '/api/v1/users/:id', permission: 'user:delete' },
  { method: 'POST', path: '/api/v1/users/:id/roles', permission: 'user:update' },
  { method: 'GET', path: '/api/v1/roles', permission: 'role:read' },
  { method: 'POST', path: '/api/v1/roles', permission: 'role:create' },
  { method: 'PATCH', path: '/api/v1/roles/:id', permission: 'role:update' },
  { method: 'DELETE', path: '/api/v1/roles/:id', permission: 'role:delete' },
];

/** The routes docs/03 lists as public: they need no token. */
const PUBLIC = ['GET /health', 'POST /api/v1/auth/login', 'POST /api/v1/auth/refresh'];

const label = (route: { method: string; path: string }) => `${route.method} ${route.path}`;
const byLabel = (a: { method: string; path: string }, b: { method: string; path: string }) =>
  label(a).localeCompare(label(b));

describe('route inventory', () => {
  const routes = listRoutes(app);

  it('has exactly the public routes docs/03 lists, and every other route needs a token first', () => {
    const open = routes
      .filter((route) => !route.authenticated)
      .map(label)
      .sort();

    expect(open).toEqual([...PUBLIC].sort());
  });

  it('has exactly the protected routes in the table above, each asking for the permission shown', () => {
    const actual = routes
      .filter((route) => route.authenticated)
      .map(({ method, path, permission }) => ({ method, path, permission }))
      .sort(byLabel);

    expect(actual).toEqual([...PROTECTED].sort(byLabel));
  });

  it('only asks for permissions the seed creates, so a typo cannot lock everyone out', () => {
    const seeded = new Set(PERMISSIONS.map((p) => `${p.resource}:${p.action}`));
    const asked = routes.flatMap((route) => (route.permission === null ? [] : [route.permission]));

    expect(asked.length).toBeGreaterThan(0);
    for (const permission of asked) expect(seeded, permission).toContain(permission);
  });

  it('lets only admin reach routes that no other role holds the permission for', () => {
    // Guards the table in the seed against a quiet change: user and role management is admin-only.
    for (const route of PROTECTED.filter((r) => r.permission?.match(/^(user|role):/))) {
      const holders = PERMISSIONS.filter(
        (p) => `${p.resource}:${p.action}` === route.permission,
      ).flatMap((p) => p.roles);
      expect(holders, label(route)).toEqual(['admin']);
    }
  });
});

describe('public routes', () => {
  it('answer without a token and without asking for one', async () => {
    const health = await request(app).get('/health');
    const login = await request(app).post('/api/v1/auth/login').send({});
    const refresh = await request(app).post('/api/v1/auth/refresh');

    // Their own responses, not "Authentication required" from the guard.
    expect(health.status).toBe(200);
    expect(login.status).toBe(400);
    expect(refresh.status).toBe(401);
    expect((refresh.body as { error: { message: string } }).error.message).toBe(
      'Invalid or expired refresh token',
    );
  });
});

describe('who can call each protected route', () => {
  const someId = randomUUID();
  const principals: Partial<Record<RoleName | 'no_roles', string>> = {};
  const refused: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await resetDatabase();
    await seedRbac();
    for (const role of ROLE_NAMES) {
      principals[role] = await accessTokenFor((await createUser({ roles: [role] })).id);
    }
    principals.no_roles = await accessTokenFor((await createUser()).id);

    const now = Math.floor(Date.now() / 1000);
    refused['no token'] = undefined;
    refused['a token that is not a JWT'] = 'not-a-token';
    refused['an expired token'] = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject((await createUser({ roles: ['admin'] })).id)
      .setIssuer('hrms-platform')
      .setAudience('hrms-api')
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(new TextEncoder().encode(TEST_JWT_ACCESS_SECRET));
    refused['a token signed with another secret'] = await signAccessToken({
      userId: (await createUser({ roles: ['admin'] })).id,
      secret: 'some-other-secret-0123456789abcdef-x',
      ttl: '15m',
    });
    refused['the token of a disabled admin'] = await accessTokenFor(
      (await createUser({ roles: ['admin'], isActive: false })).id,
    );
    refused['the token of a deleted admin'] = await accessTokenFor(
      (await createUser({ roles: ['admin'], deleted: true })).id,
    );
  });

  const call = (route: Expected, token: string | undefined) => {
    const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete';
    const req = request(app)[method](route.path.replace(':id', someId));
    return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
  };

  const mayCall = (route: Expected, role: RoleName) =>
    route.permission === null ||
    PERMISSIONS.some(
      (p) => `${p.resource}:${p.action}` === route.permission && p.roles.includes(role),
    );

  it.each(PROTECTED.map((route) => [label(route), route] as const))(
    '%s is refused with 401 without a valid token of an active user',
    async (_name, route) => {
      for (const [description, token] of Object.entries(refused)) {
        const res = await call(route, token);
        expect(res.status, description).toBe(401);
        expect((res.body as { error: { code: string } }).error.code, description).toBe(
          'UNAUTHENTICATED',
        );
      }
    },
  );

  it.each(PROTECTED.map((route) => [label(route), route] as const))(
    '%s is allowed to exactly the roles that hold its permission',
    async (_name, route) => {
      for (const role of ROLE_NAMES) {
        const res = await call(route, principals[role]);
        if (mayCall(route, role)) {
          expect([401, 403], `${role} should be allowed`).not.toContain(res.status);
          expect(res.status, `${role} should not crash it`).toBeLessThan(500);
        } else {
          expect(res.status, `${role} should be refused`).toBe(403);
          expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
        }
      }

      const none = await call(route, principals.no_roles);
      if (route.permission === null) expect(none.status, 'a user with no roles').not.toBe(403);
      else expect(none.status, 'a user with no roles').toBe(403);
    },
  );
});
