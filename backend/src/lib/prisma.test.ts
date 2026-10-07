import { describe, expect, it } from 'vitest';
import { Prisma } from '../generated/prisma/client.js';
import { isUniqueViolation } from './prisma.js';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('failed', { code, clientVersion: 'test' });

describe('isUniqueViolation', () => {
  it('is true for a P2002 error', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
  });

  it('is false for other Prisma errors', () => {
    expect(isUniqueViolation(prismaError('P2025'))).toBe(false);
  });

  it.each([
    ['an ordinary error', new Error('P2002')],
    ['a string', 'P2002'],
    ['nothing', undefined],
  ])('is false for %s', (_name, value) => {
    expect(isUniqueViolation(value)).toBe(false);
  });
});
