import { describe, expect, it } from 'vitest';
import { pageMeta, pageOffset, pageQuerySchema, sortQuerySchema } from './pagination.js';

describe('pageQuerySchema', () => {
  it('defaults to page 1 with 20 per page', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('reads page and limit from strings, as a query string gives them', () => {
    expect(pageQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('accepts the largest page size, 100', () => {
    expect(pageQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it.each([
    ['page 0', { page: '0' }],
    ['a negative page', { page: '-1' }],
    ['a fractional page', { page: '1.5' }],
    ['a page that is not a number', { page: 'abc' }],
    ['limit 0', { limit: '0' }],
    ['limit 101', { limit: '101' }],
    ['a fractional limit', { limit: '2.5' }],
  ])('rejects %s', (_name, query) => {
    expect(pageQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('sortQuerySchema', () => {
  const schema = sortQuerySchema(['email', 'created_at'], {
    field: 'created_at',
    direction: 'desc',
  });

  it('uses the fallback when there is no sort', () => {
    expect(schema.parse(undefined)).toEqual({ field: 'created_at', direction: 'desc' });
  });

  it('sorts ascending by a listed field', () => {
    expect(schema.parse('email')).toEqual({ field: 'email', direction: 'asc' });
  });

  it('sorts descending with a leading minus', () => {
    expect(schema.parse('-email')).toEqual({ field: 'email', direction: 'desc' });
  });

  it.each(['password_hash', '-password_hash', '', '-', 'EMAIL', 'email,created_at', '--email'])(
    'rejects "%s", which is not a listed field',
    (value) => {
      const result = schema.safeParse(value);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result.error?.issues)).toContain('must be one of email, created_at');
    },
  );
});

describe('pageMeta and pageOffset', () => {
  it('rounds the number of pages up', () => {
    expect(pageMeta(1, 20, 134)).toEqual({ page: 1, limit: 20, total: 134, totalPages: 7 });
    expect(pageMeta(1, 20, 140).totalPages).toBe(7);
    expect(pageMeta(1, 20, 141).totalPages).toBe(8);
  });

  it('has no pages when there is nothing', () => {
    expect(pageMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 0 });
  });

  it('skips the rows of the earlier pages', () => {
    expect(pageOffset(1, 20)).toBe(0);
    expect(pageOffset(3, 20)).toBe(40);
  });
});
