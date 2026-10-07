import { describe, expect, it } from 'vitest';
import { BCRYPT_COST, DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';

describe('passwords', () => {
  it('hashes with bcrypt at cost 12 by default', async () => {
    const hash = await hashPassword('a-long-test-passphrase');
    expect(BCRYPT_COST).toBe(12);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('a-long-test-passphrase', 4);
    expect(hash).not.toContain('a-long-test-passphrase');
  });

  it('accepts the right password and refuses a wrong one', async () => {
    const hash = await hashPassword('a-long-test-passphrase', 4);
    await expect(verifyPassword('a-long-test-passphrase', hash)).resolves.toBe(true);
    await expect(verifyPassword('another-passphrase', hash)).resolves.toBe(false);
  });

  it('gives a different hash for the same password each time (salted)', async () => {
    const [a, b] = await Promise.all([hashPassword('same', 4), hashPassword('same', 4)]);
    expect(a).not.toBe(b);
  });

  it('has a dummy hash that is a real cost-12 bcrypt hash and matches no ordinary password', async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/);
    await expect(verifyPassword('password', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
    await expect(verifyPassword('', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
