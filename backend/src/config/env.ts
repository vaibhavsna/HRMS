import { z } from 'zod';

/** A lifetime such as 30s, 15m, 12h or 7d. */
const durationSchema = z.string().regex(/^[1-9]\d*[smhd]$/, 'must look like 30s, 15m, 12h or 7d');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: durationSchema,
  REFRESH_TOKEN_TTL: durationSchema,
  CORS_ORIGIN: z.url(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Failed logins or refreshes allowed per client address within the window before answering 429. */
  RATE_LIMIT_WINDOW: durationSchema.default('15m'),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(30),
  /** Reverse proxies in front of the API whose X-Forwarded-For is believed. 0 means none: use the socket address. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
});

export type Env = z.infer<typeof envSchema>;

/** Validates raw environment variables. Throws one error listing every problem. */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

let cached: Env | undefined;

/**
 * The validated environment for this process, parsed from `process.env` on first use.
 * The only place outside `parseEnv` that reads `process.env`, so services never touch it directly.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
