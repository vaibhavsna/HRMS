import { createHmac, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '../middleware/error.js';

const ISSUER = 'hrms-platform';
const AUDIENCE = 'hrms-api';

const keyFor = (secret: string): Uint8Array => new TextEncoder().encode(secret);

export interface AccessTokenOptions {
  userId: string;
  secret: string;
  /** Lifetime such as `15m`. */
  ttl: string;
}

/**
 * A short-lived JWT identifying the user. It carries only the user id: roles and permissions are
 * looked up from the database on every request, so changing them takes effect immediately.
 */
export function signAccessToken({ userId, secret, ttl }: AccessTokenOptions): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(keyFor(secret));
}

/** Returns the user id from a valid access token. Any problem (bad signature, expired, wrong audience) is UNAUTHENTICATED. */
export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<{ userId: string }> {
  try {
    const { payload } = await jwtVerify(token, keyFor(secret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('missing subject');
    return { userId: payload.sub };
  } catch {
    throw new AppError('UNAUTHENTICATED', 'Invalid or expired access token');
  }
}

/** A random opaque refresh token (384 bits). Not a JWT: it means nothing until it is looked up. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** The value stored in the database: a keyed hash, so a leaked table cannot be replayed as cookies. */
export function hashRefreshToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}
