import type { RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from './error.js';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export interface Validated<B = unknown, Q = unknown, P = unknown> {
  body: B;
  query: Q;
  params: P;
}

const PARTS = ['body', 'query', 'params'] as const;

/**
 * Validates the request body, query and params against Zod schemas (docs/12 section 4).
 * On success the parsed values (defaults applied, unknown keys stripped) are left for the controller
 * with `validated(res)`. On failure it responds with VALIDATION_ERROR listing each field; the message
 * never repeats what the client sent.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const valid: Validated = { body: req.body, query: req.query, params: req.params };
    const fields: { field: string; message: string }[] = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        valid[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          fields.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
      }
    }

    if (fields.length > 0) {
      next(new AppError('VALIDATION_ERROR', 'Request validation failed', { fields }));
      return;
    }
    res.locals['valid'] = valid;
    next();
  };
}

/** The validated request parts, typed by the controller that knows which schemas its route used. */
export function validated<B = unknown, Q = unknown, P = unknown>(
  res: Response,
): Validated<B, Q, P> {
  return res.locals['valid'] as Validated<B, Q, P>;
}
