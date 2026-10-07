import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_NAMES } from '../../prisma/seed-data.js';
import { createApp } from '../../src/app.js';
import { getEnv } from '../../src/config/env.js';
import { getPrisma } from '../../src/lib/prisma.js';
import { BUILT_IN_ROLE_NAMES } from '../../src/modules/roles/roles.service.js';
import { accessTokenFor, apiAs, permissionId, roleId } from '../helpers/api.js';
import { resetDatabase } from '../helpers/db.js';
import { createUser, createUserWithOnly, seedRbac } from '../helpers/factories.js';
import { permissionsOf } from '../helpers/rbac.js';

const app = createApp(getEnv());

interface RoleBody {
  id: string;
  name: string;
  description: string;
  permissions: { id: string; resource: string; action: string }[];
  createdAt: string;
  updatedAt: string;
}
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: { fields?: { field: string; message: string }[]; holders?: number };
  };
}

const keys = (role: RoleBody) => role.permissions.map((p) => `${p.resource}:${p.action}`).sort();
const admin = () => createUser({ roles: ['admin'] });

describe('roles API', () => {
  beforeEach(async () => {
    await resetDatabase();
    await seedRbac();
  });

  it('keeps the list of built-in roles in step with the seed', () => {
    expect([...BUILT_IN_ROLE_NAMES]).toEqual([...ROLE_NAMES]);
  });

  describe('permissions', () => {
    const someId = randomUUID();
    const routes: [string, string, string][] = [
      ['GET', '/api/v1/roles', 'role:read'],
      ['POST', '/api/v1/roles', 'role:create'],
      ['PATCH', `/api/v1/roles/${someId}`, 'role:update'],
      ['DELETE', `/api/v1/roles/${someId}`, 'role:delete'],
    ];
    const call = (method: string, path: string, token?: string) => {
      const req = request(app)[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path);
      return token === undefined ? req : req.set('Authorization', `Bearer ${token}`);
    };

    it.each(routes)('%s %s needs a token', async (method, path) => {
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

    it.each(['role:read', 'role:create', 'role:update', 'role:delete'])(
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
  });

  describe('GET /roles', () => {
    it('returns every role with its permissions, ordered by name, matching the seed', async () => {
      const api = await apiAs(app, await admin());
      const res = await api.get('/api/v1/roles');

      expect(res.status).toBe(200);
      const roles = (res.body as { data: RoleBody[] }).data;
      expect(roles.map((role) => role.name)).toEqual([
        'admin',
        'employee',
        'hr_manager',
        'manager',
      ]);
      for (const role of roles) {
        expect(keys(role), role.name).toEqual(
          permissionsOf(role.name as (typeof ROLE_NAMES)[number]),
        );
      }
      expect(roles[0]?.permissions).toHaveLength(PERMISSIONS.length);
      expect(roles[0]?.permissions[0]).toEqual({
        id: expect.any(String) as string,
        resource: 'department',
        action: 'create',
      });
    });

    it('leaves out a deleted role and a deleted permission', async () => {
      const api = await apiAs(app, await admin());
      await getPrisma().role.update({
        where: { name: 'manager' },
        data: { deletedAt: new Date() },
      });
      await getPrisma().permission.updateMany({
        where: { resource: 'department', action: 'create' },
        data: { deletedAt: new Date() },
      });

      const roles = ((await api.get('/api/v1/roles')).body as { data: RoleBody[] }).data;

      expect(roles.map((role) => role.name)).not.toContain('manager');
      expect(keys(roles.find((role) => role.name === 'admin') as RoleBody)).not.toContain(
        'department:create',
      );
    });
  });

  describe('POST /roles', () => {
    it('creates the role with its permissions and answers 201', async () => {
      const api = await apiAs(app, await admin());
      const ids = [
        await permissionId('leave_request:read'),
        await permissionId('leave_request:create'),
      ];

      const res = await api.post('/api/v1/roles', {
        name: 'leave_clerk',
        description: 'Files leave on behalf of others',
        permissionIds: ids,
      });

      expect(res.status).toBe(201);
      const role = (res.body as { data: RoleBody }).data;
      expect(role).toMatchObject({
        name: 'leave_clerk',
        description: 'Files leave on behalf of others',
      });
      expect(keys(role)).toEqual(['leave_request:create', 'leave_request:read']);
    });

    it('defaults the description to empty and ignores a repeated permission id', async () => {
      const api = await apiAs(app, await admin());
      const id = await permissionId('department:read');
      const res = await api.post('/api/v1/roles', { name: 'viewer', permissionIds: [id, id] });

      expect(res.status).toBe(201);
      const role = (res.body as { data: RoleBody }).data;
      expect(role.description).toBe('');
      expect(role.permissions).toHaveLength(1);
    });

    it('gives users who hold the new role its permissions straight away', async () => {
      const actor = await admin();
      const holder = await createUser();
      const api = await apiAs(app, actor);
      const created = await api.post('/api/v1/roles', {
        name: 'dept_viewer',
        permissionIds: [await permissionId('department:read')],
      });
      const id = (created.body as { data: RoleBody }).data.id;
      await api.post(`/api/v1/users/${holder.id}/roles`, { roleIds: [id] });

      const me = await (await apiAs(app, holder)).get('/api/v1/auth/me');

      expect((me.body as { data: { permissions: string[]; roles: string[] } }).data).toMatchObject({
        roles: ['dept_viewer'],
        permissions: ['department:read'],
      });
    });

    it('answers 409 for a name that is taken, including a deleted role’s name', async () => {
      const api = await apiAs(app, await admin());
      const taken = await api.post('/api/v1/roles', { name: 'manager', permissionIds: [] });
      const created = await api.post('/api/v1/roles', { name: 'temporary', permissionIds: [] });
      await api.delete(`/api/v1/roles/${(created.body as { data: RoleBody }).data.id}`);
      const reused = await api.post('/api/v1/roles', { name: 'temporary', permissionIds: [] });

      expect(taken.status).toBe(409);
      expect((taken.body as ErrorBody).error).toEqual({
        code: 'CONFLICT',
        message: 'A role with this name already exists',
      });
      expect(reused.status).toBe(409);
    });

    it('creates nothing when a permission does not exist', async () => {
      const api = await apiAs(app, await admin());
      const res = await api.post('/api/v1/roles', {
        name: 'half_made',
        permissionIds: [await permissionId('user:read'), randomUUID()],
      });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields).toEqual([
        { field: 'body.permissionIds', message: 'contains a permission that does not exist' },
      ]);
      expect(await getPrisma().role.count({ where: { name: 'half_made' } })).toBe(0);
    });

    it('refuses a permission that has been deleted', async () => {
      const api = await apiAs(app, await admin());
      const id = await permissionId('user:read');
      await getPrisma().permission.update({ where: { id }, data: { deletedAt: new Date() } });

      expect((await api.post('/api/v1/roles', { name: 'nope', permissionIds: [id] })).status).toBe(
        400,
      );
    });

    it.each([
      ['a missing name', { name: undefined }, 'body.name'],
      ['a name with capitals', { name: 'Team_Lead' }, 'body.name'],
      ['a name with a space', { name: 'team lead' }, 'body.name'],
      ['a name starting with a digit', { name: '1st_line' }, 'body.name'],
      ['a one-letter name', { name: 'a' }, 'body.name'],
      ['a name over 50 characters', { name: 'a'.repeat(51) }, 'body.name'],
      ['a description over 255 characters', { description: 'x'.repeat(256) }, 'body.description'],
      ['missing permissionIds', { permissionIds: undefined }, 'body.permissionIds'],
      [
        'permission ids that are not UUIDs',
        { permissionIds: ['user:read'] },
        'body.permissionIds.0',
      ],
    ])('rejects %s with 400', async (_name, change, field) => {
      const api = await apiAs(app, await admin());
      const res = await api.post('/api/v1/roles', {
        name: 'valid_name',
        permissionIds: [],
        ...change,
      });

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields?.map((f) => f.field)).toContain(field);
    });
  });

  describe('PATCH /roles/:id', () => {
    async function makeRole(api: Awaited<ReturnType<typeof apiAs>>, permissions: string[] = []) {
      const res = await api.post('/api/v1/roles', {
        name: 'custom_role',
        description: 'Before',
        permissionIds: await Promise.all(permissions.map((key) => permissionId(key))),
      });
      return (res.body as { data: RoleBody }).data;
    }

    it('renames a custom role and changes its description', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api, ['user:read']);
      const res = await api.patch(`/api/v1/roles/${role.id}`, {
        name: 'renamed_role',
        description: 'After',
      });

      expect(res.status).toBe(200);
      expect((res.body as { data: RoleBody }).data).toMatchObject({
        name: 'renamed_role',
        description: 'After',
      });
      expect(keys((res.body as { data: RoleBody }).data)).toEqual(['user:read']);
    });

    it('replaces the permissions with exactly the ones given', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api, ['user:read', 'role:read']);
      const res = await api.patch(`/api/v1/roles/${role.id}`, {
        permissionIds: [await permissionId('role:read'), await permissionId('department:read')],
      });

      expect(keys((res.body as { data: RoleBody }).data)).toEqual(['department:read', 'role:read']);
    });

    it('removes every permission when the list is empty, and can give one back', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api, ['user:read']);
      const emptied = await api.patch(`/api/v1/roles/${role.id}`, { permissionIds: [] });
      const restored = await api.patch(`/api/v1/roles/${role.id}`, {
        permissionIds: [await permissionId('user:read')],
      });

      expect((emptied.body as { data: RoleBody }).data.permissions).toEqual([]);
      expect(keys((restored.body as { data: RoleBody }).data)).toEqual(['user:read']);
      expect(await getPrisma().rolePermission.count({ where: { roleId: role.id } })).toBe(1);
    });

    it('leaves the permissions alone when only the name is sent', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api, ['user:read']);
      const res = await api.patch(`/api/v1/roles/${role.id}`, { description: 'Only this' });

      expect(keys((res.body as { data: RoleBody }).data)).toEqual(['user:read']);
    });

    it('applies a change of permissions to users holding the role on their next request', async () => {
      const actor = await admin();
      const holder = await createUser();
      const api = await apiAs(app, actor);
      const role = await makeRole(api, ['department:read']);
      await api.post(`/api/v1/users/${holder.id}/roles`, { roleIds: [role.id] });
      const asHolder = await apiAs(app, holder);
      const before = (await asHolder.get('/api/v1/auth/me')).body as {
        data: { permissions: string[] };
      };

      await api.patch(`/api/v1/roles/${role.id}`, {
        permissionIds: [await permissionId('job_position:read')],
      });
      const after = (await asHolder.get('/api/v1/auth/me')).body as {
        data: { permissions: string[] };
      };

      expect(before.data.permissions).toEqual(['department:read']);
      expect(after.data.permissions).toEqual(['job_position:read']);
    });

    it('lets a built-in role change description and permissions, but not its name', async () => {
      const api = await apiAs(app, await admin());
      const id = await roleId('employee');
      const renamed = await api.patch(`/api/v1/roles/${id}`, { name: 'staff' });
      const same = await api.patch(`/api/v1/roles/${id}`, {
        name: 'employee',
        description: 'All staff',
      });
      const widened = await api.patch(`/api/v1/roles/${id}`, {
        permissionIds: [await permissionId('department:read'), await permissionId('employee:read')],
      });

      expect(renamed.status).toBe(409);
      expect((renamed.body as ErrorBody).error.message).toBe('Built-in roles cannot be renamed');
      expect(same.status).toBe(200);
      expect(keys((widened.body as { data: RoleBody }).data)).toEqual([
        'department:read',
        'employee:read',
      ]);
      expect((await getPrisma().role.findUniqueOrThrow({ where: { id } })).name).toBe('employee');
    });

    it('answers 409 when the new name is taken', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api);
      const res = await api.patch(`/api/v1/roles/${role.id}`, { name: 'manager' });

      expect(res.status).toBe(409);
    });

    it('changes nothing when a permission does not exist', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api, ['user:read']);
      const res = await api.patch(`/api/v1/roles/${role.id}`, {
        name: 'changed',
        permissionIds: [randomUUID()],
      });

      expect(res.status).toBe(400);
      const stored = await getPrisma().role.findUniqueOrThrow({ where: { id: role.id } });
      expect(stored.name).toBe('custom_role');
    });

    it.each([
      ['an empty body', {}, 'body'],
      ['a name with capitals', { name: 'Bad' }, 'body.name'],
      ['permission ids that are not UUIDs', { permissionIds: ['x'] }, 'body.permissionIds.0'],
    ])('rejects %s with 400', async (_name, body, field) => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api);
      const res = await api.patch(`/api/v1/roles/${role.id}`, body);

      expect(res.status).toBe(400);
      expect((res.body as ErrorBody).error.details?.fields?.map((f) => f.field)).toContain(field);
    });

    it('answers 404 for a role that does not exist or is deleted, and 400 for an id that is not a UUID', async () => {
      const api = await apiAs(app, await admin());
      const role = await makeRole(api);
      await api.delete(`/api/v1/roles/${role.id}`);

      expect((await api.patch(`/api/v1/roles/${randomUUID()}`, { description: 'x' })).status).toBe(
        404,
      );
      expect((await api.patch(`/api/v1/roles/${role.id}`, { description: 'x' })).status).toBe(404);
      expect((await api.patch('/api/v1/roles/nope', { description: 'x' })).status).toBe(400);
    });
  });

  describe('DELETE /roles/:id', () => {
    const createCustom = async (api: Awaited<ReturnType<typeof apiAs>>) =>
      (
        (await api.post('/api/v1/roles', { name: 'short_lived', permissionIds: [] })).body as {
          data: RoleBody;
        }
      ).data;

    it('answers 204 and soft-deletes a role nobody holds', async () => {
      const api = await apiAs(app, await admin());
      const role = await createCustom(api);

      const res = await api.delete(`/api/v1/roles/${role.id}`);

      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      const row = await getPrisma().role.findUniqueOrThrow({ where: { id: role.id } });
      expect(row.deletedAt).not.toBeNull();
      const names = ((await api.get('/api/v1/roles')).body as { data: RoleBody[] }).data.map(
        (r) => r.name,
      );
      expect(names).not.toContain('short_lived');
    });

    it('refuses while a user still holds the role, and says how many', async () => {
      const actor = await admin();
      const api = await apiAs(app, actor);
      const role = await createCustom(api);
      for (let i = 0; i < 2; i += 1) {
        const holder = await createUser();
        await api.post(`/api/v1/users/${holder.id}/roles`, { roleIds: [role.id] });
      }

      const res = await api.delete(`/api/v1/roles/${role.id}`);

      expect(res.status).toBe(409);
      expect((res.body as ErrorBody).error.details?.holders).toBe(2);
      expect(
        (await getPrisma().role.findUniqueOrThrow({ where: { id: role.id } })).deletedAt,
      ).toBeNull();
    });

    it('allows it once the holders have lost the role, or been deleted', async () => {
      const actor = await admin();
      const api = await apiAs(app, actor);
      const role = await createCustom(api);
      const kept = await createUser();
      const removed = await createUser();
      await api.post(`/api/v1/users/${kept.id}/roles`, { roleIds: [role.id] });
      await api.post(`/api/v1/users/${removed.id}/roles`, { roleIds: [role.id] });
      await api.post(`/api/v1/users/${kept.id}/roles`, { roleIds: [] });
      await api.delete(`/api/v1/users/${removed.id}`);

      expect((await api.delete(`/api/v1/roles/${role.id}`)).status).toBe(204);
    });

    it.each([...ROLE_NAMES])('refuses to delete the built-in role %s', async (name) => {
      const api = await apiAs(app, await admin());
      const res = await api.delete(`/api/v1/roles/${await roleId(name)}`);

      expect(res.status).toBe(409);
      expect((res.body as ErrorBody).error.message).toBe('Built-in roles cannot be deleted');
    });

    it('answers 404 the second time and for an unknown id, and 400 for an id that is not a UUID', async () => {
      const api = await apiAs(app, await admin());
      const role = await createCustom(api);
      await api.delete(`/api/v1/roles/${role.id}`);

      expect((await api.delete(`/api/v1/roles/${role.id}`)).status).toBe(404);
      expect((await api.delete(`/api/v1/roles/${randomUUID()}`)).status).toBe(404);
      expect((await api.delete('/api/v1/roles/7')).status).toBe(400);
    });
  });
});
