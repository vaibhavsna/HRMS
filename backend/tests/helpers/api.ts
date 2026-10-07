import type { Express } from 'express';
import request from 'supertest';
import { signAccessToken } from '../../src/lib/tokens.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { TEST_JWT_ACCESS_SECRET } from '../test-env.js';
import type { TestUser } from './factories.js';

/** A valid access token for the user, signed like the app's own, without going through login. */
export const accessTokenFor = (userId: string): Promise<string> =>
  signAccessToken({ userId, secret: TEST_JWT_ACCESS_SECRET, ttl: '15m' });

/** The id of a role, by name (the seeded ones, or one a test created). */
export async function roleId(name: string): Promise<string> {
  const role = await getPrisma().role.findUniqueOrThrow({ where: { name }, select: { id: true } });
  return role.id;
}

/** The id of a seeded permission, from its `resource:action` key. */
export async function permissionId(key: string): Promise<string> {
  const [resource = '', action = ''] = key.split(':');
  const permission = await getPrisma().permission.findUniqueOrThrow({
    where: { resource_action: { resource, action } },
    select: { id: true },
  });
  return permission.id;
}

/** Requests made as one signed-in user. */
export async function apiAs(app: Express, user: TestUser) {
  const header = `Bearer ${await accessTokenFor(user.id)}`;
  return {
    get: (path: string) => request(app).get(path).set('Authorization', header),
    post: (path: string, body?: object) =>
      request(app).post(path).set('Authorization', header).send(body),
    patch: (path: string, body?: object) =>
      request(app).patch(path).set('Authorization', header).send(body),
    delete: (path: string) => request(app).delete(path).set('Authorization', header),
  };
}
