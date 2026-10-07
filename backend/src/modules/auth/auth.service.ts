import { randomUUID } from 'node:crypto';
import { getEnv } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { formatDateOnly } from '../../lib/dates.js';
import { durationToMs } from '../../lib/duration.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from '../../lib/password.js';
import { getPrisma } from '../../lib/prisma.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../../lib/tokens.js';
import { AppError } from '../../middleware/error.js';
import type { LoginInput } from './auth.schema.js';

export interface AuthUser {
  id: string;
  email: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface LoginResult extends SessionTokens {
  user: AuthUser;
}

/** The signed-in user as the request guards see them: who they are and what they may do. */
export interface Principal {
  id: string;
  email: string;
  roles: readonly string[];
  /** `resource:action` keys, the union over all of the user's roles. */
  permissions: ReadonlySet<string>;
}

/** The employee fields the signed-in app needs. Personal details (birth date, phone, address) are left out. */
export interface MeEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  departmentId: string | null;
  jobPositionId: string | null;
  managerId: string | null;
  dateJoined: string;
  employmentStatus: string;
}

export interface Me {
  user: AuthUser;
  employee: MeEmployee | null;
  roles: string[];
  permissions: string[];
}

const NOT_DELETED = { deletedAt: null } as const;

/** One message for every login failure, so the response never says which part was wrong. */
const INVALID_CREDENTIALS = 'Invalid email or password';

/** One message for every refresh failure: missing, unknown, expired, revoked or replayed. */
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';

/**
 * Creates the access token and a new refresh token row. `familyId` ties the refresh tokens of one
 * session together: login starts a new family, every refresh keeps the family of the token it replaces.
 */
export async function issueSessionTokens(
  tx: Prisma.TransactionClient,
  userId: string,
  familyId: string,
): Promise<SessionTokens> {
  const env = getEnv();
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_TTL));

  await tx.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash: hashRefreshToken(refreshToken, env.JWT_REFRESH_SECRET),
      expiresAt: refreshExpiresAt,
    },
  });
  const accessToken = await signAccessToken({
    userId,
    secret: env.JWT_ACCESS_SECRET,
    ttl: env.ACCESS_TOKEN_TTL,
  });
  return { accessToken, refreshToken, refreshExpiresAt };
}

/**
 * Loads a user with the permissions of their roles. Returns null when the account does not exist or is
 * disabled or deleted, so a valid access token stops working as soon as the account does. A deleted role,
 * grant or permission grants nothing. This runs on every authenticated request, so changing a role
 * applies to the next request without waiting for the access token to expire.
 */
export async function getPrincipal(userId: string): Promise<Principal | null> {
  const user = await getPrisma().user.findFirst({
    where: { id: userId, isActive: true, ...NOT_DELETED },
    select: {
      id: true,
      email: true,
      roles: {
        where: { ...NOT_DELETED, role: NOT_DELETED },
        select: {
          role: {
            select: {
              name: true,
              permissions: {
                where: { ...NOT_DELETED, permission: NOT_DELETED },
                select: { permission: { select: { resource: true, action: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  const permissions = new Set<string>();
  for (const { role } of user.roles) {
    for (const { permission } of role.permissions) {
      permissions.add(`${permission.resource}:${permission.action}`);
    }
  }
  return {
    id: user.id,
    email: user.email,
    roles: user.roles.map(({ role }) => role.name),
    permissions,
  };
}

/**
 * Checks the email and password and starts a session.
 * Unknown email, wrong password and a disabled or deleted account all give the same 401, and the
 * password is always compared (against a dummy hash if there is no account) so timing does not differ.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const prisma = getPrisma();
  const found = await prisma.user.findFirst({
    where: { email: input.email, deletedAt: null },
    select: { id: true, email: true, passwordHash: true, isActive: true, createdAt: true },
  });

  const passwordMatches = await verifyPassword(
    input.password,
    found?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );
  if (!found || !passwordMatches || !found.isActive) {
    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
  }

  const lastLoginAt = new Date();
  const tokens = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: found.id }, data: { lastLoginAt } });
    return issueSessionTokens(tx, found.id, randomUUID());
  });

  return {
    ...tokens,
    user: {
      id: found.id,
      email: found.email,
      isActive: found.isActive,
      lastLoginAt,
      createdAt: found.createdAt,
    },
  };
}

/** Revokes every live token of one session, so none of them can be refreshed again. */
async function revokeFamily(familyId: string): Promise<void> {
  await getPrisma().refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

const hashToken = (token: string): string => hashRefreshToken(token, getEnv().JWT_REFRESH_SECRET);

/**
 * Swaps a refresh token for a new access token and a new refresh token (rotation): the old one is revoked
 * in the same transaction that creates the new one, and both belong to the same session (family).
 * Presenting a token that was already used or revoked means it was copied, so the whole session is ended
 * and the real owner has to log in again. Two requests racing with the same token end the same way:
 * one wins, the other is treated as a replay. Every failure is the same 401.
 */
export async function refreshSession(refreshToken: string | null): Promise<SessionTokens> {
  if (refreshToken === null) throw new AppError('UNAUTHENTICATED', INVALID_REFRESH_TOKEN);
  const prisma = getPrisma();

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: {
      id: true,
      userId: true,
      familyId: true,
      expiresAt: true,
      revokedAt: true,
      deletedAt: true,
      user: { select: { isActive: true, deletedAt: true } },
    },
  });
  if (!stored || stored.deletedAt) throw new AppError('UNAUTHENTICATED', INVALID_REFRESH_TOKEN);

  if (stored.revokedAt) {
    await revokeFamily(stored.familyId);
    throw new AppError('UNAUTHENTICATED', INVALID_REFRESH_TOKEN);
  }
  if (stored.expiresAt <= new Date()) throw new AppError('UNAUTHENTICATED', INVALID_REFRESH_TOKEN);
  if (!stored.user.isActive || stored.user.deletedAt) {
    await revokeFamily(stored.familyId);
    throw new AppError('UNAUTHENTICATED', INVALID_REFRESH_TOKEN);
  }

  const tokens = await prisma.$transaction(async (tx) => {
    const claimed = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) return null; // another request used this token first
    return issueSessionTokens(tx, stored.userId, stored.familyId);
  });
  if (!tokens) {
    await revokeFamily(stored.familyId);
    throw new AppError('UNAUTHENTICATED', INVALID_REFRESH_TOKEN);
  }
  return tokens;
}

/**
 * Ends the session the refresh token belongs to, so it cannot be refreshed again. Other sessions of the
 * same user are not touched, and a token that belongs to someone else is ignored. Without a token there
 * is nothing to revoke. The access token stays valid until it expires (it is not stored anywhere).
 */
export async function logout(userId: string, refreshToken: string | null): Promise<void> {
  if (refreshToken === null) return;
  const stored = await getPrisma().refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: { userId: true, familyId: true },
  });
  if (stored?.userId === userId) await revokeFamily(stored.familyId);
}

/** The signed-in user's account, linked employee record (if any), roles and permissions. */
export async function getMe(principal: Principal): Promise<Me> {
  const found = await getPrisma().user.findFirst({
    where: { id: principal.id, isActive: true, ...NOT_DELETED },
    select: {
      id: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          workEmail: true,
          departmentId: true,
          jobPositionId: true,
          managerId: true,
          dateJoined: true,
          employmentStatus: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!found) throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token');

  const { employee, ...user } = found;
  return {
    user,
    employee:
      employee && !employee.deletedAt
        ? {
            id: employee.id,
            employeeCode: employee.employeeCode,
            firstName: employee.firstName,
            lastName: employee.lastName,
            workEmail: employee.workEmail,
            departmentId: employee.departmentId,
            jobPositionId: employee.jobPositionId,
            managerId: employee.managerId,
            dateJoined: formatDateOnly(employee.dateJoined),
            employmentStatus: employee.employmentStatus,
          }
        : null,
    roles: [...principal.roles].sort(),
    permissions: [...principal.permissions].sort(),
  };
}
