import type { Request, Response } from 'express';
import { readCookie } from '../../lib/cookies.js';
import { requireUser } from '../../middleware/authenticate.js';
import { validated } from '../../middleware/validate.js';
import type { LoginInput } from './auth.schema.js';
import * as authService from './auth.service.js';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

const refreshTokenFrom = (req: Request): string | null =>
  readCookie(req.headers.cookie, REFRESH_COOKIE_NAME);

export async function login(_req: Request, res: Response): Promise<void> {
  const { body } = validated<LoginInput>(res);
  const result = await authService.login(body);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ data: { accessToken: result.accessToken, user: result.user } });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const result = await authService.refreshSession(refreshTokenFrom(req));
    setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json({ data: { accessToken: result.accessToken } });
  } catch (error) {
    // A refused token is useless to the browser, so drop the cookie as well as answering 401.
    clearRefreshCookie(res);
    throw error;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  const user = requireUser(req);
  await authService.logout(user.id, refreshTokenFrom(req));
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ data: await authService.getMe(requireUser(req)) });
}
