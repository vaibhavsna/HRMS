import { z } from 'zod';

/** Lower-case words joined by underscores, like the built-in `hr_manager`. */
const roleNameSchema = z
  .string()
  .trim()
  .min(2, 'must be at least 2 characters')
  .max(50, 'must be at most 50 characters')
  .regex(
    /^[a-z][a-z0-9_]*$/,
    'must be lower case letters, digits and underscores, starting with a letter',
  );

const descriptionSchema = z.string().trim().max(255, 'must be at most 255 characters');

const permissionIdsSchema = z
  .array(z.uuid())
  .max(500)
  .transform((ids) => [...new Set(ids)]);

export const createRoleSchema = z.object({
  name: roleNameSchema,
  description: descriptionSchema.default(''),
  permissionIds: permissionIdsSchema,
});

export const updateRoleSchema = z
  .object({
    name: roleNameSchema.optional(),
    description: descriptionSchema.optional(),
    permissionIds: permissionIdsSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.permissionIds !== undefined,
    'at least one of name, description, permissionIds is required',
  );

export const roleIdParamsSchema = z.object({ id: z.uuid() });

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type RoleIdParams = z.infer<typeof roleIdParamsSchema>;
