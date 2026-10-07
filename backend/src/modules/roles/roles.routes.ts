import { Router } from 'express';
import { authenticate, requirePermission } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { create, list, remove, update } from './roles.controller.js';
import { createRoleSchema, roleIdParamsSchema, updateRoleSchema } from './roles.schema.js';

/** Routes under /api/v1/roles. Every route needs a signed-in user holding the permission shown. */
export function createRolesRouter(): Router {
  const router = Router();
  router.use(authenticate);
  router.get('/', requirePermission('role:read'), list);
  router.post('/', requirePermission('role:create'), validate({ body: createRoleSchema }), create);
  router.patch(
    '/:id',
    requirePermission('role:update'),
    validate({ params: roleIdParamsSchema, body: updateRoleSchema }),
    update,
  );
  router.delete(
    '/:id',
    requirePermission('role:delete'),
    validate({ params: roleIdParamsSchema }),
    remove,
  );
  return router;
}
