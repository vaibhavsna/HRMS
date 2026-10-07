import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `page` (from 1) and `limit` (default 20, at most 100), as the list endpoints take them (docs/03). */
export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export interface Sort<Field extends string> {
  field: Field;
  direction: 'asc' | 'desc';
}

/**
 * `sort=created_at` or `sort=-created_at` (descending), limited to the fields listed, so a client can
 * never sort by something that is not indexed or not meant to be exposed (docs/12 section 5).
 */
export function sortQuerySchema<Field extends string>(
  allowed: readonly Field[],
  fallback: Sort<Field>,
) {
  return z
    .string()
    .optional()
    .transform((value, ctx): Sort<Field> => {
      if (value === undefined) return fallback;
      const field = allowed.find((candidate) => candidate === value.replace(/^-/, ''));
      if (field === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `must be one of ${allowed.join(', ')}, optionally with a leading - for descending`,
        });
        return z.NEVER;
      }
      return { field, direction: value.startsWith('-') ? 'desc' : 'asc' };
    });
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/** The rows to skip for a page. */
export const pageOffset = (page: number, limit: number): number => (page - 1) * limit;
