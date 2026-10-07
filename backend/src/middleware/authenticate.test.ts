import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { Principal } from '../modules/auth/auth.service.js';
import { parseBearerToken, requirePermission, requireUser } from './authenticate.js';
import { AppError } from './error.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl';

function principal(permissions: string[]): Principal {
  return {
    id: 'u1',
    email: 'a@example.com',
    roles: ['employee'],
    permissions: new Set(permissions),
  };
}

function run(permission: Parameters<typeof requirePermission>[0], user: Principal | undefined) {
  const req = { user } as Request;
  const next = vi.fn();
  const call = () => requirePermission(permission)(req, {} as Response, next);
  return { call, next };
}

describe('parseBearerToken', () => {
  it('returns the token from a Bearer header', () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it('accepts the scheme in any case but keeps the token as sent', () => {
    expect(parseBearerToken(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(parseBearerToken(`BEARER ${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    ['no header', undefined],
    ['an empty header', ''],
    ['only the scheme', 'Bearer'],
    ['the scheme and a space', 'Bearer '],
    ['another scheme', `Basic ${TOKEN}`],
    ['no scheme', TOKEN],
    ['two spaces', `Bearer  ${TOKEN}`],
    ['two tokens', `Bearer ${TOKEN} ${TOKEN}`],
    ['a token with a comma', `Bearer ${TOKEN},extra`],
  ])('returns null for %s', (_name, header) => {
    expect(parseBearerToken(header)).toBeNull();
  });
});

describe('requirePermission', () => {
  it('calls next when the user holds the permission', () => {
    const { call, next } = run('leave_request:approve', principal(['leave_request:approve']));
    call();
    expect(next).toHaveBeenCalledWith();
  });

  it('carries the key it checks, so a test can list what every route asks for', () => {
    expect(requirePermission('leave_request:approve').permission).toBe('leave_request:approve');
  });

  it('throws FORBIDDEN when the user lacks it, without naming the permission', () => {
    const { call, next } = run('user:delete', principal(['user:read']));

    let thrown: unknown;
    try {
      call();
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({ code: 'FORBIDDEN', status: 403 });
    expect((thrown as AppError).message).not.toContain('user:delete');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not treat a permission on the same resource or with the same action as a match', () => {
    expect(run('user:delete', principal(['user:update'])).call).toThrow(AppError);
    expect(run('user:delete', principal(['role:delete'])).call).toThrow(AppError);
  });

  it('fails closed with UNAUTHENTICATED when authenticate did not run', () => {
    const { call, next } = run('user:read', undefined);
    expect(call).toThrow(expect.objectContaining({ code: 'UNAUTHENTICATED', status: 401 }));
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['user', 'user:', ':read', 'User:read', 'user:read:all', 'user read', ''])(
    'rejects the malformed key "%s" when the route is defined',
    (key) => {
      expect(() => requirePermission(key as `${string}:${string}`)).toThrow(
        /Invalid permission key/,
      );
    },
  );
});

describe('requireUser', () => {
  it('returns the signed-in user', () => {
    const user = principal([]);
    expect(requireUser({ user } as Request)).toBe(user);
  });

  it('throws UNAUTHENTICATED when there is none', () => {
    expect(() => requireUser({} as Request)).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });
});
