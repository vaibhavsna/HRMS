import { PERMISSIONS, type RoleName } from '../../prisma/seed-data.js';

/** The sorted `resource:action` keys the seed grants to any of the given roles. */
export const permissionsOf = (...roles: RoleName[]): string[] =>
  PERMISSIONS.filter((p) => p.roles.some((role) => roles.includes(role)))
    .map((p) => `${p.resource}:${p.action}`)
    .sort();
