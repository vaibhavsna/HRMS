import { describe, expect, it } from 'vitest';
import { escapeLike } from './search.js';

describe('escapeLike', () => {
  it('leaves an ordinary term alone', () => {
    expect(escapeLike('ada.lovelace@example.com')).toBe('ada.lovelace@example.com');
  });

  it.each([
    ['%', '\\%'],
    ['_', '\\_'],
    ['\\', '\\\\'],
    ['100%_done', '100\\%\\_done'],
    ['a\\%', 'a\\\\\\%'],
  ])('escapes %s', (term, escaped) => {
    expect(escapeLike(term)).toBe(escaped);
  });

  it('returns an empty term unchanged', () => {
    expect(escapeLike('')).toBe('');
  });
});
