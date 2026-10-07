import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, getInitialTheme, getStoredTheme, getSystemTheme, storeTheme } from './theme';

function stubSystemTheme(prefersDark: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: prefersDark }),
  });
}

describe('theme helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubSystemTheme(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when nothing is stored or the stored value is not a theme', () => {
    expect(getStoredTheme()).toBeNull();
    window.localStorage.setItem('hrms-theme', 'sepia');
    expect(getStoredTheme()).toBeNull();
  });

  it('stores and reads back a theme', () => {
    storeTheme('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('follows the system preference when nothing is stored', () => {
    stubSystemTheme(true);
    expect(getSystemTheme()).toBe('dark');
    expect(getInitialTheme()).toBe('dark');
    stubSystemTheme(false);
    expect(getInitialTheme()).toBe('light');
  });

  it('prefers the stored theme over the system preference', () => {
    stubSystemTheme(true);
    storeTheme('light');
    expect(getInitialTheme()).toBe('light');
  });

  it('adds and removes the dark class on the root element', () => {
    applyTheme('dark');
    expect(document.documentElement).toHaveClass('dark');
    applyTheme('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('still works when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getStoredTheme()).toBeNull();
    expect(() => storeTheme('dark')).not.toThrow();
    expect(getInitialTheme()).toBe('light');
  });
});
