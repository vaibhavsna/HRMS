import { Router } from 'express';
import type { Env } from '../../config/env.js';
import { authenticate } from '../../middleware/authenticate.js';
import { createAuthRateLimiters } from '../../middleware/rate-limit.js';
import { validate } from '../../middleware/validate.js';
import { login, logout, me, refresh } from './auth.controller.js';
import { loginSchema } from './auth.schema.js';

/**
 * Routes under /api/v1/auth. `login` and `refresh` are public (listed as such in docs/03): `refresh`
 * is authorised by the refresh cookie instead of an access token. They are the routes someone can try
 * to guess at, so each has a rate limit that runs before anything else. The rest need an access token.
 */
export function createAuthRouter(env: Env): Router {
  const limiters = createAuthRateLimiters(env);
  const router = Router();
  router.post('/login', limiters.login, validate({ body: loginSchema }), login);
  router.post('/refresh', limiters.refresh, refresh);
  router.post('/logout', authenticate, logout);
  router.get('/me', authenticate, me);
  return router;
}
