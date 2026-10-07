/**
 * Formats a date-only value (a Prisma `@db.Date`, which arrives as UTC midnight) as `YYYY-MM-DD`,
 * the form the API uses for dates without a time (docs/03). No timezone conversion is involved.
 */
export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
