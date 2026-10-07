import type { Prisma } from '../../generated/prisma/client.js';
import { pageOffset } from '../../lib/pagination.js';
import { hashPassword } from '../../lib/password.js';
import { getPrisma, isUniqueViolation } from '../../lib/prisma.js';
import { escapeLike } from '../../lib/search.js';
import { AppError } from '../../middleware/error.js';
import { ADMIN_ROLE_NAME, assertRolesExist } from '../roles/roles.service.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema.js';

/**
 * Held (as a Postgres advisory lock, until the transaction ends) by every change that could leave the
 * system without an active admin. It makes "count the other admins, then change this one" one step, so
 * two admins demoting each other at the same moment cannot both succeed.
 */
export const ADMIN_GUARD_LOCK_KEY = 7_261_007;

const NOT_DELETED = { deletedAt: null } as const;

export interface UserRoleSummary {
  id: string;
  name: string;
  description: string;
}

export interface UserDto {
  id: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: UserRoleSummary[];
}

const userSelect = {
  id: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    where: { ...NOT_DELETED, role: NOT_DELETED },
    select: { role: { select: { id: true, name: true, description: true } } },
  },
} satisfies Prisma.UserSelect;

/** Never includes the password hash: it is not in `userSelect`. */
function toUserDto(row: Prisma.UserGetPayload<{ select: typeof userSelect }>): UserDto {
  const { roles, ...user } = row;
  return {
    ...user,
    roles: roles.map(({ role }) => role).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

type Tx = Prisma.TransactionClient;

async function lockAdminGuard(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_GUARD_LOCK_KEY}::bigint)`;
}

const ACTIVE_ADMIN = {
  isActive: true,
  ...NOT_DELETED,
  roles: { some: { ...NOT_DELETED, role: { name: ADMIN_ROLE_NAME, ...NOT_DELETED } } },
} satisfies Prisma.UserWhereInput;

/**
 * Throws CONFLICT if `userId` is an active admin and nobody else is. Call it (after taking the admin
 * guard lock) before disabling, deleting or removing the admin role from that user.
 */
async function assertNotLastAdmin(tx: Tx, userId: string): Promise<void> {
  const isActiveAdmin = (await tx.user.count({ where: { id: userId, ...ACTIVE_ADMIN } })) > 0;
  if (!isActiveAdmin) return;
  const others = await tx.user.count({ where: { id: { not: userId }, ...ACTIVE_ADMIN } });
  if (others === 0) {
    throw new AppError('CONFLICT', 'There must always be at least one active admin');
  }
}

async function findUserOrThrow(tx: Pick<Tx, 'user'>, id: string): Promise<UserDto> {
  const row = await tx.user.findFirst({ where: { id, ...NOT_DELETED }, select: userSelect });
  if (!row) throw new AppError('NOT_FOUND', 'User not found');
  return toUserDto(row);
}

/** Ends every session of the user, so nothing issued before a disable or delete can come back after a re-enable. */
async function revokeAllSessions(tx: Tx, userId: string): Promise<void> {
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Makes the user's roles exactly `roleIds`: removed roles are soft-deleted, a deleted link that is wanted again is restored. */
async function setUserRoles(tx: Tx, userId: string, roleIds: string[]): Promise<void> {
  await tx.userRole.updateMany({
    where: { userId, ...NOT_DELETED, roleId: { notIn: roleIds } },
    data: { deletedAt: new Date() },
  });
  await tx.userRole.updateMany({
    where: { userId, deletedAt: { not: null }, roleId: { in: roleIds } },
    data: { deletedAt: null },
  });
  await tx.userRole.createMany({
    data: roleIds.map((roleId) => ({ userId, roleId })),
    skipDuplicates: true,
  });
}

const conflictOnDuplicateEmail = (error: unknown): never => {
  if (isUniqueViolation(error)) {
    throw new AppError('CONFLICT', 'A user with this email already exists');
  }
  throw error;
};

const ORDER_BY = {
  email: (direction: 'asc' | 'desc') => ({ email: direction }),
  created_at: (direction: 'asc' | 'desc') => ({ createdAt: direction }),
  // Accounts that never signed in come last in either direction.
  last_login_at: (direction: 'asc' | 'desc') => ({
    lastLoginAt: { sort: direction, nulls: 'last' as const },
  }),
};

export async function listUsers(
  query: ListUsersQuery,
): Promise<{ items: UserDto[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...NOT_DELETED,
    ...(query.q === undefined
      ? {}
      : { email: { contains: escapeLike(query.q), mode: 'insensitive' } }),
  };
  const [rows, total] = await getPrisma().$transaction([
    getPrisma().user.findMany({
      where,
      // `id` last so rows with equal values keep a stable order from page to page.
      orderBy: [ORDER_BY[query.sort.field](query.sort.direction), { id: 'asc' }],
      skip: pageOffset(query.page, query.limit),
      take: query.limit,
      select: userSelect,
    }),
    getPrisma().user.count({ where }),
  ]);
  return { items: rows.map(toUserDto), total };
}

export function getUser(id: string): Promise<UserDto> {
  return findUserOrThrow(getPrisma(), id);
}

export async function createUser(input: CreateUserInput): Promise<UserDto> {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      await assertRolesExist(tx, input.roleIds);
      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        select: userSelect,
      });
      return toUserDto(created);
    });
  } catch (error) {
    return conflictOnDuplicateEmail(error);
  }
}

/** Changes the email and/or turns the account on or off. Turning it off ends its sessions and is refused for the last active admin. */
export async function updateUser(id: string, input: UpdateUserInput): Promise<UserDto> {
  try {
    return await getPrisma().$transaction(async (tx) => {
      const disabling = input.isActive === false;
      if (disabling) await lockAdminGuard(tx);
      await findUserOrThrow(tx, id);
      if (disabling) await assertNotLastAdmin(tx, id);

      const updated = await tx.user.update({
        where: { id },
        data: { email: input.email, isActive: input.isActive },
        select: userSelect,
      });
      if (disabling) await revokeAllSessions(tx, id);
      return toUserDto(updated);
    });
  } catch (error) {
    return conflictOnDuplicateEmail(error);
  }
}

/** Soft-deletes the user and ends their sessions. Refused for the last active admin. */
export async function deleteUser(id: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockAdminGuard(tx);
    await findUserOrThrow(tx, id);
    await assertNotLastAdmin(tx, id);
    await tx.user.update({ where: { id }, data: { deletedAt: new Date() } });
    await revokeAllSessions(tx, id);
  });
}

/**
 * Sets the user's roles to exactly `roleIds` (an empty list removes them all). Removing the admin role
 * from the last active admin is refused. The new roles apply from the user's next request.
 */
export async function assignRoles(id: string, roleIds: string[]): Promise<UserDto> {
  return getPrisma().$transaction(async (tx) => {
    await lockAdminGuard(tx);
    await findUserOrThrow(tx, id);
    await assertRolesExist(tx, roleIds);

    const keepsAdmin =
      roleIds.length > 0 &&
      (await tx.role.count({
        where: { id: { in: roleIds }, name: ADMIN_ROLE_NAME, ...NOT_DELETED },
      })) > 0;
    if (!keepsAdmin) await assertNotLastAdmin(tx, id);

    await setUserRoles(tx, id, roleIds);
    return findUserOrThrow(tx, id);
  });
}
