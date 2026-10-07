import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from './error.js';
import { validate, validated } from './validate.js';

function run(
  schemas: Parameters<typeof validate>[0],
  parts: Partial<Pick<Request, 'body' | 'query' | 'params'>>,
) {
  const req = { body: undefined, query: {}, params: {}, ...parts } as Request;
  const res = { locals: {} } as unknown as Response;
  const next = vi.fn();
  validate(schemas)(req, res, next);
  return { res, next };
}

const errorFrom = (next: ReturnType<typeof vi.fn>): AppError => next.mock.calls[0]?.[0] as AppError;

describe('validate', () => {
  it('passes valid input on, with defaults applied and unknown keys removed', () => {
    const { res, next } = run(
      { body: z.object({ name: z.string(), role: z.string().default('employee') }) },
      { body: { name: 'Ada', surprise: 'dropped' } },
    );

    expect(next).toHaveBeenCalledWith();
    expect(validated(res).body).toEqual({ name: 'Ada', role: 'employee' });
  });

  it('validates query and params as well as the body', () => {
    const { res, next } = run(
      {
        query: z.object({ page: z.coerce.number().int().min(1).default(1) }),
        params: z.object({ id: z.uuid() }),
      },
      { query: { page: '3' }, params: { id: '0b1f1c5e-5a52-4f6e-9c63-3d3b6b1f9a10' } },
    );

    expect(next).toHaveBeenCalledWith();
    expect(validated(res).query).toEqual({ page: 3 });
    expect(validated(res).params).toEqual({ id: '0b1f1c5e-5a52-4f6e-9c63-3d3b6b1f9a10' });
  });

  it('responds with VALIDATION_ERROR listing every failing field, prefixed by where it was', () => {
    const { next } = run(
      { body: z.object({ email: z.email(), age: z.number() }), params: z.object({ id: z.uuid() }) },
      { body: { email: 'nope' }, params: { id: 'not-a-uuid' } },
    );

    const error = errorFrom(next);
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.status).toBe(400);
    const fields = (error.details as { fields: { field: string }[] }).fields.map(
      (item) => item.field,
    );
    expect(fields).toEqual(expect.arrayContaining(['body.email', 'body.age', 'params.id']));
  });

  it('treats a missing body as invalid, not as an empty object', () => {
    const { next } = run({ body: z.object({ email: z.string() }) }, { body: undefined });
    expect(errorFrom(next).code).toBe('VALIDATION_ERROR');
  });

  it('never repeats the rejected input in its message', () => {
    const { next } = run(
      { body: z.object({ email: z.email() }) },
      { body: { email: 'secret-value-123' } },
    );
    const error = errorFrom(next);
    expect(JSON.stringify({ message: error.message, details: error.details })).not.toContain(
      'secret-value-123',
    );
  });

  it('does nothing for parts that have no schema', () => {
    const { res, next } = run({}, { body: { anything: true } });
    expect(next).toHaveBeenCalledWith();
    expect(validated(res).body).toEqual({ anything: true });
  });
});
