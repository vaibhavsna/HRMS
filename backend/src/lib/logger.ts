import { pino, type DestinationStream, type Logger } from 'pino';

/** Names of values that must never be written to a log, whatever object they appear in. */
const SECRET_KEYS = [
  'password',
  'passwordHash',
  'accessToken',
  'refreshToken',
  'token',
  'tokenHash',
] as const;

/**
 * Paths pino blanks out before writing (docs/12 section 7). The request and response serializers in
 * `app.ts` already leave headers and bodies out; this is the second layer, for a secret that reaches a
 * log call some other way (a logged object, a header map, an error context).
 */
export const REDACT_PATHS: string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.headers.authorization',
  '*.headers.cookie',
  'req.body',
  ...SECRET_KEYS,
  ...SECRET_KEYS.map((key) => `*.${key}`),
  ...SECRET_KEYS.map((key) => `*.*.${key}`),
];

/** The application logger. `destination` is only for tests that capture the output. */
export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, destination);
}
