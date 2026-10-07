import bcrypt from 'bcryptjs';

/** bcrypt cost for stored passwords (docs/01, docs/12 section 7). */
export const BCRYPT_COST = 12;

export function hashPassword(plain: string, cost: number = BCRYPT_COST): Promise<string> {
  return bcrypt.hash(plain, cost);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A valid cost-12 hash of a random value nobody knows. Login compares against it when the email is
 * unknown, so a missing account takes as long as a wrong password and the two cannot be told apart by timing.
 */
export const DUMMY_PASSWORD_HASH = '$2b$12$hv24q6Pd0R6L005n1.zrFeAgt4B4.s/RD/fHQGGTMHqZAm9BodjEW';
