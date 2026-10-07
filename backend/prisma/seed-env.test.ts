import { describe, expect, it } from 'vitest';
import { parseBootstrapAdmin } from './seed-env.js';

const STRONG = 'a-long-test-passphrase-1';

function errorFor(env: NodeJS.ProcessEnv): string {
  try {
    parseBootstrapAdmin(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected parseBootstrapAdmin to throw');
}

describe('parseBootstrapAdmin', () => {
  it('returns nothing when neither variable is set', () => {
    expect(parseBootstrapAdmin({})).toBeUndefined();
  });

  it('treats empty values as unset', () => {
    expect(
      parseBootstrapAdmin({ BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '' }),
    ).toBeUndefined();
  });

  it('returns the admin with the email trimmed and lower-cased', () => {
    const admin = parseBootstrapAdmin({
      BOOTSTRAP_ADMIN_EMAIL: '  Admin@Example.COM ',
      BOOTSTRAP_ADMIN_PASSWORD: STRONG,
    });
    expect(admin).toEqual({ email: 'admin@example.com', password: STRONG });
  });

  it('keeps the password exactly as given, spaces included', () => {
    const password = '  spaces are part of it  ';
    const admin = parseBootstrapAdmin({
      BOOTSTRAP_ADMIN_EMAIL: 'a@b.co',
      BOOTSTRAP_ADMIN_PASSWORD: password,
    });
    expect(admin?.password).toBe(password);
  });

  it('refuses a half-configured admin and names both variables', () => {
    expect(errorFor({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.co' })).toMatch(
      /BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD/,
    );
    expect(errorFor({ BOOTSTRAP_ADMIN_PASSWORD: STRONG })).toMatch(/must be set together/);
  });

  it('rejects an invalid email', () => {
    expect(
      errorFor({ BOOTSTRAP_ADMIN_EMAIL: 'not-an-email', BOOTSTRAP_ADMIN_PASSWORD: STRONG }),
    ).toMatch(/BOOTSTRAP_ADMIN_EMAIL: must be a valid email/);
  });

  it('rejects a short password', () => {
    expect(
      errorFor({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.co', BOOTSTRAP_ADMIN_PASSWORD: 'short' }),
    ).toMatch(/at least 12 characters/);
  });

  it('rejects a password longer than the 72 bytes bcrypt can use', () => {
    const tooLong = 'x'.repeat(73);
    expect(
      errorFor({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.co', BOOTSTRAP_ADMIN_PASSWORD: tooLong }),
    ).toMatch(/72 bytes/);
  });

  it('counts bytes, not characters, for the 72-byte limit', () => {
    const multiByte = 'é'.repeat(40); // 40 characters, 80 bytes
    expect(
      errorFor({ BOOTSTRAP_ADMIN_EMAIL: 'a@b.co', BOOTSTRAP_ADMIN_PASSWORD: multiByte }),
    ).toMatch(/72 bytes/);
  });

  it('never puts the password or the email in an error message', () => {
    const password = 'short-pw';
    const email = 'secret.person@example.com';
    const message = errorFor({ BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password });
    expect(message).not.toContain(password);
    expect(message).not.toContain(email);
  });
});
