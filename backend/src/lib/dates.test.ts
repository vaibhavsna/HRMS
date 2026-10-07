import { describe, expect, it } from 'vitest';
import { formatDateOnly } from './dates.js';

describe('formatDateOnly', () => {
  it('formats UTC midnight as the same calendar day', () => {
    expect(formatDateOnly(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01-05');
  });

  it('does not shift the day at the edges of the year', () => {
    expect(formatDateOnly(new Date('2025-12-31T00:00:00.000Z'))).toBe('2025-12-31');
    expect(formatDateOnly(new Date('2026-01-01T00:00:00.000Z'))).toBe('2026-01-01');
  });

  it('keeps leap days', () => {
    expect(formatDateOnly(new Date('2028-02-29T00:00:00.000Z'))).toBe('2028-02-29');
  });
});
