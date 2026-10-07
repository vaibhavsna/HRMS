import type { Prisma } from '../../generated/prisma/client.js';
import { getPrisma, isUniqueViolation } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';
import type { CreateRoleInput, UpdateRoleInput } from './roles.schema.js';

/** The role that may manage users and roles. Users keep at least one active holder of it (see users.service). */
export const ADMIN_ROLE_NAME = 'admin';

/**
 * The roles the seed creates (backend/prisma/seed-data.ts, which a test keeps in step with this list).
 * Code and the seed refer to them by name, so they cannot be renamed or deleted.
 */
export const BUILT_IN_ROLE_NAMES: readonly string[] = [
  'admin',
  'hr_manager',
  'manager',
  'employee',
];

const NOT_DELETED = { deletedAt: null } as const;

export interface RolePermission {
  id: string;
  resource: string;
  action: string;
}

export interface RoleDto {
  id: string;
  name: string;
  description: string;
  permissions: RolePermission[];
  createdAt: Date;
  updatedAt: Date;
}

const roleSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  permissions: {
    where: { ...NOT_DELETED, permission: NOT_DELETED },
    select: { permission: { select: { id: true, resource: true, action: true } } },
  },
} satisfies Prisma.RoleSelect;

function toRoleDto(row: Prisma.RoleGetPayload<{ select: typeof roleSelect }>): RoleDto {
  const permissions = row.permissions
    .map(({ permission }) => permission)
    .sort((a, b) => a.resource.localeCompare(b.resource) || a.action.localeCompare(b.action));
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const validationError = (field: string, message: string) =>
  new AppError('VALIDATION_ERROR', 'Request validation failed', { fields: [{ field, message }] });

type Client = Pick<Prisma.TransactionClient, 'role' | 'permission'>;

/** Throws VALIDATION_ERROR unless every id is an existing, not deleted role. */
export async function assertRolesExist(client: Pick<Client, 'role'>, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await client.role.count({ where: { id: { in: ids }, ...NOT_DELETED } });
  if (found !== ids.length)
    throw validationError('body.roleIds', 'contains a role that does not exist');
}

async function assertPermissionsExist(client: Pick<Client, 'permission'>, ids: string[]) {
  if (ids.length === 0) return;
  const found = await client.permission.count({ where: { id: { in: ids }, ...NOT_DELETED } });
  if (found !== ids.length) {
    throw validationError('body.permissionIds', 'contains a permission that does not exist');
  }
}

async function findRoleOrThrow(client: Pick<Client, 'role'>, id: string) {
  const role = await client.role.findFirst({
    where: { id, ...NOT_DELETED },
    select: { id: true, name: true },
  });
  if (!role) throw new AppError('NOT_FOUND', 'Role not found');
  return role;
}

/** Makes the role's permissions exactly `permissionIds`: removed grants are soft-deleted, a deleted grant that is wanted again is restored. */
async function setRolePermissions(
  tx: Prisma.TransactionClient,
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  const now = new Date();
  await tx.rolePermission.updateMany({
    where: { roleId, ...NOT_DELETED, permissionId: { notIn: permissionIds } },
    data: { deletedAt: now },
  });
  await tx.rolePermission.updateMany({
    where: { roleId, deletedAt: { not: null }, permissionId: { in: permissionIds } },
    data: { deletedAt: null },
  });
  await tx.rolePermission.createMany({
    data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
}

const conflictOnDuplicateName = (error: unknown): never => {
  if (isUniqueViolation(error))
    throw new AppError('CONFLICT', 'A role with this name already exists');
  throw error;
};

/** All roles with their permissions. Unpaginated: there are only a handful (docs/03). */
export async function listRoles(): Promise<RoleDto[]> {
  const rows = await getPrisma().role.findMany({
    where: NOT_DELETED,
    orderBy: { name: 'asc' },
    select: roleSelect,
  });
  return rows.map(toRoleDto);
}

export async function createRole(input: CreateRoleInput): Promise<RoleDto> {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      await assertPermissionsExist(tx, input.permissionIds);
      const created = await tx.role.create({
        data: {
          name: input.name,
          description: input.description,
          permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
        },
        select: roleSelect,
      });
      return toRoleDto(created);
    });
  } catch (error) {
    return conflictOnDuplicateName(error);
  }
}

/** Built-in roles may change description and permissions, but not their name. */
export async function updateRole(id: string, input: UpdateRoleInput): Promise<RoleDto> {
  const prisma = getPrisma();
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await findRoleOrThrow(tx, id);
      if (
        input.name !== undefined &&
        input.name !== role.name &&
        BUILT_IN_ROLE_NAMES.includes(role.name)
      ) {
        throw new AppError('CONFLICT', 'Built-in roles cannot be renamed');
      }
      if (input.permissionIds !== undefined) {
        await assertPermissionsExist(tx, input.permissionIds);
        await setRolePermissions(tx, id, input.permissionIds);
      }
      const updated = await tx.role.update({
        where: { id },
        data: { name: input.name, description: input.description },
        select: roleSelect,
      });
      return toRoleDto(updated);
    });
  } catch (error) {
    return conflictOnDuplicateName(error);
  }
}

/** Soft-deletes a role. Built-in roles, and roles still held by a user, are refused. */
export async function deleteRole(id: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const role = await findRoleOrThrow(tx, id);
    if (BUILT_IN_ROLE_NAMES.includes(role.name)) {
      throw new AppError('CONFLICT', 'Built-in roles cannot be deleted');
    }
    const holders = await tx.userRole.count({
      where: { roleId: id, ...NOT_DELETED, user: NOT_DELETED },
    });
    if (holders > 0) {
      throw new AppError('CONFLICT', `The role is still assigned to ${holders} user(s)`, {
        holders,
      });
    }
    await tx.role.update({ where: { id }, data: { deletedAt: new Date() } });
  });
}
