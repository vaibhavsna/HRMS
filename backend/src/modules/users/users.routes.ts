import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { assignRoles, create, get, list, remove, update } from './users.controller.js';
import {
  assignRolesSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamsSchema,
} from './users.schema.js';

/**
 * Routes under /api/v1/users. Every route needs a signed-in user holding the permission shown, and the
 * permission is checked before the input, so someone who may not use a route learns nothing about it.
 */
export function createUsersRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', requirePermission('user:read'), validate({ query: listUsersQuerySchema }), list);
  router.post('/', requirePermission('user:create'), validate({ body: createUserSchema }), create);
  router.get('/:id', requirePermission('user:read'), validate({ params: userIdParamsSchema }), get);
  router.patch(
    '/:id',
    requirePermission('user:update'),
    validate({ params: userIdParamsSchema, body: updateUserSchema }),
    update,
  );
  router.delete(
    '/:id',
    requirePermission('user:delete'),
    validate({ params: userIdParamsSchema }),
    remove,
  );
  router.post(
    '/:id/roles',
    requirePermission('user:update'),
    validate({ params: userIdParamsSchema, body: assignRolesSchema }),
    assignRoles,
  );
  return router;
}
