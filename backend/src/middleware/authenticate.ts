import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { getEnv } from '../config/env.js';
import { verifyAccessToken } from '../lib/tokens.js';
import { getPrincipal, type Principal } from '../modules/auth/auth.service.js';
import { AppError } from './error.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `authenticate`. Absent on public routes. */
    user?: Principal;
  }
}

const INVALID_TOKEN = 'Invalid or expired access token';

/** `Authorization: Bearer <token>` (RFC 6750). The scheme is case-insensitive, the token is not. */
const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;

/** Returns the token from an Authorization header, or null if there is none or it is not a Bearer token. */
export function parseBearerToken(header: string | undefined): string | null {
  const match = header === undefined ? null : BEARER.exec(header);
  return match?.[1] ?? null;
}

/**
 * Requires a valid access token and attaches `req.user` (who they are, their roles and permissions).
 * Every failure is the same 401 apart from "no token", so a caller learns nothing about why a token
 * was refused. The account is looked up on every request: a disabled or deleted user is refused
 * even if their token has not expired yet.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = parseBearerToken(req.headers.authorization);
  if (token === null) throw new AppError('UNAUTHENTICATED', 'Authentication required');

  const { userId } = await verifyAccessToken(token, getEnv().JWT_ACCESS_SECRET);
  // Tokens are signed by us, so a subject that is not a UUID means a forged or foreign token.
  if (!z.uuid().safeParse(userId).success) throw new AppError('UNAUTHENTICATED', INVALID_TOKEN);

  const principal = await getPrincipal(userId);
  if (!principal) throw new AppError('UNAUTHENTICATED', INVALID_TOKEN);

  req.user = principal;
  next();
};

/** The signed-in user. Throws 401 if `authenticate` did not run, so a wiring mistake fails closed. */
export function requireUser(req: Request): Principal {
  if (!req.user) throw new AppError('UNAUTHENTICATED', 'Authentication required');
  return req.user;
}

export type PermissionKey = `${string}:${string}`;

const PERMISSION_KEY = /^[a-z][a-z_]*:[a-z][a-z_]*$/;

/**
 * Allows the request only if the signed-in user holds `resource:action` through any of their roles
 * (the keys are in docs/03, appendix). Use after `authenticate`. No role is special: `admin` passes
 * only for permissions it was granted. A malformed key throws when the route is defined, so a typo
 * fails at startup instead of silently locking everyone out.
 */
export function requirePermission(permission: PermissionKey): RequestHandler {
  if (!PERMISSION_KEY.test(permission)) {
    throw new Error(`Invalid permission key "${permission}": expected resource:action`);
  }
  return (req, _res, next) => {
    const user = requireUser(req);
    if (!user.permissions.has(permission)) {
      throw new AppError('FORBIDDEN', 'You do not have permission to perform this action');
    }
    next();
  };
}
