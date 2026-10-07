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
