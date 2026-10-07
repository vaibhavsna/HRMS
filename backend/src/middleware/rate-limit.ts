import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Env } from '../config/env.js';
import { durationToMs } from '../lib/duration.js';
import { AppError } from './error.js';

type RateLimitEnv = Pick<
  Env,
  'RATE_LIMIT_WINDOW' | 'LOGIN_RATE_LIMIT_MAX' | 'REFRESH_RATE_LIMIT_MAX'
>;

export interface AuthRateLimiters {
  login: RequestHandler;
  refresh: RequestHandler;
}

/**
 * Allows `max` failed requests per client address in the window, then answers 429 `RATE_LIMITED` in the
 * error envelope with a `Retry-After` header. Only failed requests (status 400 and above) use up the
 * budget, so people who sign in correctly are never locked out by their own use, while guessing and
 * replaying are cut off. A limited request is refused before anything else runs, so it does not consume
 * a refresh token. Counters live in this process's memory: with several instances the limit applies per
 * instance, and a restart clears it.
 */
function failedRequestLimiter(max: number, windowMs: number): RequestHandler {
  return rateLimit({
    windowMs,
    limit: max,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError('RATE_LIMITED', 'Too many attempts. Try again later.'));
    },
  });
}

/** Separate budgets for login and refresh, so a burst on one never locks the other. */
export function createAuthRateLimiters(env: RateLimitEnv): AuthRateLimiters {
  const windowMs = durationToMs(env.RATE_LIMIT_WINDOW);
  return {
    login: failedRequestLimiter(env.LOGIN_RATE_LIMIT_MAX, windowMs),
    refresh: failedRequestLimiter(env.REFRESH_RATE_LIMIT_MAX, windowMs),
  };
}
