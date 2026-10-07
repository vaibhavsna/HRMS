import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate.js';
import type { LoginInput } from './auth.schema.js';
import * as authService from './auth.service.js';
import { setRefreshCookie } from './refresh-cookie.js';

export async function login(_req: Request, res: Response): Promise<void> {
  const { body } = validated<LoginInput>(res);
  const result = await authService.login(body);
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ data: { accessToken: result.accessToken, user: result.user } });
}
