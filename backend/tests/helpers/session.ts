import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';
import { hashRefreshToken } from '../../src/lib/tokens.js';
import { TEST_JWT_REFRESH_SECRET } from '../test-env.js';
import type { TestUser } from './factories.js';

export const LOGIN = '/api/v1/auth/login';
export const REFRESH = '/api/v1/auth/refresh';
export const LOGOUT = '/api/v1/auth/logout';
export const ME = '/api/v1/auth/me';

/** The `Set-Cookie` header for the refresh token, or '' if the response did not set one. */
export function refreshCookie(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.find((cookie) => cookie.startsWith('refresh_token=')) ?? '';
}

/** `refresh_token=<value>`: what a browser sends back in the `Cookie` header. */
export const cookiePair = (setCookie: string): string => setCookie.split(';')[0] ?? '';

/** The token itself, taken out of a `refresh_token=<value>` pair. */
export const tokenOf = (pair: string): string => pair.slice('refresh_token='.length);

/** What the database stores for a refresh token. */
export const storedHash = (token: string): string =>
  hashRefreshToken(token, TEST_JWT_REFRESH_SECRET);

export interface Session {
  accessToken: string;
  /** `refresh_token=<value>` for the `Cookie` header. */
  cookie: string;
}

/** Logs in through the real endpoint, so the session is exactly what a browser would hold. */
export async function loginAs(app: Express, user: TestUser): Promise<Session> {
  const res = await request(app).post(LOGIN).send({ email: user.email, password: user.password });
  expect(res.status).toBe(200);
  const body = res.body as { data: { accessToken: string } };
  return {
    accessToken: body.data.accessToken,
    cookie: cookiePair(refreshCookie(res.headers['set-cookie'])),
  };
}
