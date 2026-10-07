import type { CookieOptions, Response } from 'express';
import { getEnv } from '../../config/env.js';

export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Only the auth routes ever need the cookie, so the browser sends it nowhere else. */
const REFRESH_COOKIE_PATH = '/api/v1/auth';

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Secure everywhere except local development, where plain http is used (docs/01).
    secure: getEnv().NODE_ENV !== 'development',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}
