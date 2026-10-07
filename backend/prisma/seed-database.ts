import { PERMISSIONS, ROLES, type RoleName } from './seed-data.js';

/**
 * The few writes the seed needs. Every method is an "ensure": it creates the row if it is missing and
 * otherwise leaves it as it is (except a role's description), so running the seed again changes nothing.
 * Each returns the row id where one is needed.
 */
export interface SeedStore {
  upsertRole(role: { name: string; description: string }): Promise<string>;
  upsertPermission(permission: { resource: string; action: string }): Promise<string>;
  ensureRolePermission(roleId: string, permissionId: string): Promise<void>;
  /** Creates the user if the email is new. An existing user, and their password, are never touched. */
  ensureUser(user: { email: string; passwordHash: string }): Promise<string>;
  ensureUserRole(userId: string, roleId: string): Promise<void>;
}

export interface SeedInput {
  /** Already hashed. Omit to seed roles and permissions only. */
  admin?: { email: string; passwordHash: string };
}

export interface SeedSummary {
  roles: number;
  permissions: number;
  grants: number;
  adminEnsured: boolean;
}

/**
 * Seeds roles, permissions, the role grants from docs/03 and, optionally, one bootstrap admin.
 * Only adds or confirms rows: it never removes a grant, so roles customised later keep their changes.
 */
export async function seedDatabase(store: SeedStore, input: SeedInput = {}): Promise<SeedSummary> {
  const roleIds = new Map<RoleName, string>();
  for (const role of ROLES) {
    roleIds.set(role.name, await store.upsertRole(role));
  }

  let grants = 0;
  for (const permission of PERMISSIONS) {
    const permissionId = await store.upsertPermission(permission);
    for (const roleName of permission.roles) {
      await store.ensureRolePermission(requireRoleId(roleIds, roleName), permissionId);
      grants += 1;
    }
  }

  if (input.admin) {
    const userId = await store.ensureUser(input.admin);
    await store.ensureUserRole(userId, requireRoleId(roleIds, 'admin'));
  }

  return {
    roles: ROLES.length,
    permissions: PERMISSIONS.length,
    grants,
    adminEnsured: input.admin !== undefined,
  };
}

function requireRoleId(roleIds: ReadonlyMap<RoleName, string>, name: RoleName): string {
  const id = roleIds.get(name);
  if (!id) throw new Error(`Role ${name} was not seeded`);
  return id;
}
