import { z } from 'zod';
import { pageQuerySchema, sortQuerySchema } from '../../lib/pagination.js';

/** bcrypt only reads the first 72 bytes, so a longer password would be silently cut short. */
const MAX_PASSWORD_BYTES = 72;

/** New passwords: at least 12 characters and at most 72 bytes. The message never repeats the password. */
export const passwordSchema = z
  .string()
  .min(12, 'must be at least 12 characters')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES,
    `must be at most ${MAX_PASSWORD_BYTES} bytes`,
  );

/** Trimmed and lower-cased, the same way login and the seed store it. */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** Duplicates are ignored, so `[a, a]` means `[a]`. */
const roleIdsSchema = z
  .array(z.uuid())
  .max(50)
  .transform((ids) => [...new Set(ids)]);

export const USER_SORT_FIELDS = ['email', 'created_at', 'last_login_at'] as const;

export const listUsersQuerySchema = pageQuerySchema.extend({
  /** Matches part of the email, ignoring case. */
  q: z.string().trim().min(1).max(100).optional(),
  sort: sortQuerySchema(USER_SORT_FIELDS, { field: 'created_at', direction: 'desc' }),
});

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  roleIds: roleIdsSchema,
});

export const updateUserSchema = z
  .object({
    email: emailSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (value) => value.email !== undefined || value.isActive !== undefined,
    'at least one of email, isActive is required',
  );

export const assignRolesSchema = z.object({ roleIds: roleIdsSchema });

export const userIdParamsSchema = z.object({ id: z.uuid() });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
export type UserIdParams = z.infer<typeof userIdParamsSchema>;
