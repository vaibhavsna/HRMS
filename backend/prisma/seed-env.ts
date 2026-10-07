import { z } from 'zod';

/** bcrypt silently ignores everything after 72 bytes, so a longer password would be weaker than it looks. */
const BCRYPT_MAX_BYTES = 72;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const passwordSchema = z
  .string()
  .min(12, 'must be at least 12 characters')
  .refine(
    (value) => new TextEncoder().encode(value).length <= BCRYPT_MAX_BYTES,
    `must be at most ${BCRYPT_MAX_BYTES} bytes (bcrypt limit)`,
  );

export interface BootstrapAdmin {
  email: string;
  password: string;
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== '';

/**
 * Reads the optional bootstrap admin from the environment.
 * Both variables or neither: with neither, no admin is created. The error text never contains the values.
 */
export function parseBootstrapAdmin(raw: NodeJS.ProcessEnv): BootstrapAdmin | undefined {
  const email = raw.BOOTSTRAP_ADMIN_EMAIL;
  const password = raw.BOOTSTRAP_ADMIN_PASSWORD;

  if (!isSet(email) && !isSet(password)) return undefined;
  if (!isSet(email) || !isSet(password)) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set together (or both left unset).',
    );
  }

  const parsedEmail = emailSchema.safeParse(email);
  const parsedPassword = passwordSchema.safeParse(password);
  const problems: string[] = [];
  if (!parsedEmail.success) problems.push('BOOTSTRAP_ADMIN_EMAIL: must be a valid email address');
  if (!parsedPassword.success) {
    const reasons = parsedPassword.error.issues.map((issue) => issue.message).join(', ');
    problems.push(`BOOTSTRAP_ADMIN_PASSWORD: ${reasons}`);
  }
  if (!parsedEmail.success || !parsedPassword.success) {
    throw new Error(`Invalid bootstrap admin configuration:\n  - ${problems.join('\n  - ')}`);
  }

  return { email: parsedEmail.data, password: parsedPassword.data };
}
