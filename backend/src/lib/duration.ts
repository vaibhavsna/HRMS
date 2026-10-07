const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/** Converts a lifetime such as `15m` or `7d` (validated in config/env.ts) to milliseconds. */
export function durationToMs(value: string): number {
  const match = /^([1-9]\d*)([smhd])$/.exec(value);
  const amount = Number(match?.[1]);
  const unit = UNIT_MS[match?.[2] ?? ''];
  if (!match || unit === undefined) {
    throw new Error(`Invalid duration "${value}": use something like 30s, 15m, 12h or 7d`);
  }
  return amount * unit;
}
