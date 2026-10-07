import { describe, expect, it } from 'vitest';
import { durationToMs } from './duration.js';

describe('durationToMs', () => {
  it.each([
    ['30s', 30_000],
    ['15m', 900_000],
    ['12h', 43_200_000],
    ['7d', 604_800_000],
  ])('converts %s', (value, expected) => {
    expect(durationToMs(value)).toBe(expected);
  });

  it.each(['', '7', 'd', '0d', '-5m', '1.5h', '7 d', '7w', '15M'])('rejects "%s"', (value) => {
    expect(() => durationToMs(value)).toThrow(/Invalid duration/);
  });
});
