import { describe, expect, it } from 'vitest';
import { readCookie } from './cookies.js';

describe('readCookie', () => {
  it('returns the value of the named cookie', () => {
    expect(readCookie('refresh_token=abc123', 'refresh_token')).toBe('abc123');
  });

  it('finds it among other cookies, with or without spaces after the semicolon', () => {
    expect(readCookie('a=1; refresh_token=abc; b=2', 'refresh_token')).toBe('abc');
    expect(readCookie('a=1;refresh_token=abc;b=2', 'refresh_token')).toBe('abc');
  });

  it('matches the whole name, not a prefix or suffix', () => {
    expect(readCookie('my_refresh_token=x; refresh_token_2=y', 'refresh_token')).toBeNull();
  });

  it('keeps "=" characters inside the value', () => {
    expect(readCookie('refresh_token=abc==', 'refresh_token')).toBe('abc==');
  });

  it('decodes percent-encoding and strips surrounding quotes', () => {
    expect(readCookie('refresh_token=a%20b', 'refresh_token')).toBe('a b');
    expect(readCookie('refresh_token="abc"', 'refresh_token')).toBe('abc');
  });

  it('uses the first one when the name is repeated', () => {
    expect(readCookie('refresh_token=first; refresh_token=second', 'refresh_token')).toBe('first');
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['another cookie only', 'other=1'],
    ['a cookie without a value', 'refresh_token='],
    ['a cookie with an empty quoted value', 'refresh_token=""'],
    ['a part without "="', 'refresh_token'],
    ['a bad percent-encoding', 'refresh_token=%E0%A4%A'],
  ])('returns null for %s', (_name, header) => {
    expect(readCookie(header, 'refresh_token')).toBeNull();
  });
});
