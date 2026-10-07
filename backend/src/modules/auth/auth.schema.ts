import { z } from 'zod';

/**
 * The email is trimmed and lower-cased so login is case-insensitive; the seed and `POST /users`
 * store emails the same way. The password is not trimmed or length-checked beyond a sane maximum
 * (bcrypt only uses the first 72 bytes, and an enormous body is just wasted work).
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1, 'is required').max(200, 'is too long'),
});

export type LoginInput = z.infer<typeof loginSchema>;
