import type { Express } from 'express';
import { authenticate, type PermissionGuard } from '../../src/middleware/authenticate.js';

/** The parts of Express 5's router internals that the route inventory reads. */
interface RouteLike {
  path: string;
  methods: Record<string, boolean>;
  stack: { handle: unknown }[];
}
interface LayerLike {
  name: string;
  handle: unknown;
  route?: RouteLike;
  matchers?: ((path: string) => unknown)[];
}
interface RouterLike {
  stack: LayerLike[];
}

/** Where each router is mounted in `createApp`. A router mounted anywhere else makes the inventory throw. */
export const MOUNTS = ['/api/v1/auth', '/api/v1/users', '/api/v1/roles'] as const;

export interface RouteInfo {
  method: string;
  /** Full path with Express parameters, e.g. `/api/v1/users/:id`. */
  path: string;
  /** `authenticate` runs for this route, before its permission check if it has one. */
  authenticated: boolean;
  /** The permission the route asks for, or null if it asks for none. */
  permission: string | null;
}

const isPermissionGuard = (handle: unknown): handle is PermissionGuard =>
  typeof handle === 'function' && 'permission' in handle && typeof handle.permission === 'string';

function describeRoute(
  route: RouteLike,
  prefix: string,
  authenticatedByRouter: boolean,
): RouteInfo[] {
  const handles = route.stack.map((layer) => layer.handle);
  const authAt = handles.indexOf(authenticate);
  const guard = handles.find(isPermissionGuard);
  const guardAt = guard === undefined ? -1 : handles.indexOf(guard);
  // Authenticated if the router runs it for every route, or this route does and does so before the permission check.
  const authenticated =
    authenticatedByRouter || (authAt !== -1 && (guardAt === -1 || authAt < guardAt));
  const path = prefix + (route.path === '/' ? '' : route.path);
  return Object.keys(route.methods)
    .filter((method) => method !== '_all')
    .map((method) => ({
      method: method.toUpperCase(),
      path: path === '' ? '/' : path,
      authenticated,
      permission: guard?.permission ?? null,
    }));
}

/**
 * Every route the app has, read from the Express router itself, with what protects it. Used to prove that
 * the routes in docs/03 are exactly the routes that exist, and that each has the guard docs/12 section 6 asks for.
 */
export function listRoutes(app: Express): RouteInfo[] {
  const root = (app as unknown as { router: RouterLike }).router;
  const routes: RouteInfo[] = [];

  for (const layer of root.stack) {
    if (layer.route) {
      routes.push(...describeRoute(layer.route, '', false));
      continue;
    }
    if (layer.name !== 'router') continue; // ordinary middleware: json, helmet, cors, the logger, the error handlers

    const prefixes = MOUNTS.filter((mount) =>
      layer.matchers?.some((matches) => Boolean(matches(`${mount}/probe`))),
    );
    const [prefix] = prefixes;
    if (prefixes.length !== 1 || prefix === undefined) {
      throw new Error(
        'A router is mounted at a path that is not in MOUNTS (tests/helpers/routes.ts)',
      );
    }

    let authenticatedByRouter = false;
    for (const inner of (layer.handle as RouterLike).stack) {
      if (inner.route) routes.push(...describeRoute(inner.route, prefix, authenticatedByRouter));
      else if (inner.handle === authenticate) authenticatedByRouter = true;
    }
  }
  return routes;
}
