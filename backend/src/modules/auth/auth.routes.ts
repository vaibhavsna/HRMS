import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { login, logout, me, refresh } from './auth.controller.js';
import { loginSchema } from './auth.schema.js';

/**
 * Routes under /api/v1/auth. `login` and `refresh` are public (listed as such in docs/03): `refresh`
 * is authorised by the refresh cookie instead of an access token. The rest need an access token.
 */
export function createAuthRouter(): Router {
  const router = Router();
  router.post('/login', validate({ body: loginSchema }), login);
  router.post('/refresh', refresh);
  router.post('/logout', authenticate, logout);
  router.get('/me', authenticate, me);
  return router;
}
