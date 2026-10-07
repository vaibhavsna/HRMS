import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { login } from './auth.controller.js';
import { loginSchema } from './auth.schema.js';

/** Routes under /api/v1/auth. Login is public (listed as such in docs/03). */
export function createAuthRouter(): Router {
  const router = Router();
  router.post('/login', validate({ body: loginSchema }), login);
  return router;
}
