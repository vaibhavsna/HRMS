/**
 * Escapes `\`, `%` and `_` so a search term is matched literally. Prisma's `contains` passes the term to
 * LIKE as is, where `%` and `_` are wildcards, and PostgreSQL's LIKE uses `\` as its escape character.
 */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}
