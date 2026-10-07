import { randomUUID } from 'node:crypto';
import { getEnv } from '../../config/env.js';
import type { Prisma } from '../../generated/prisma/client.js';
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

const NOT_DELETED = { deletedAt: null } as const;

/** One message for every login failure, so the response never says which part was wrong. */
const INVALID_CREDENTIALS = 'Invalid email or password';

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
