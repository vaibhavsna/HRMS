import type { RoleName } from '../../prisma/seed-data.js';
import { seedDatabase } from '../../prisma/seed-database.js';
import { prismaSeedStore } from '../../prisma/seed-prisma-store.js';
import { hashPassword } from '../../src/lib/password.js';
import { getPrisma } from '../../src/lib/prisma.js';

/** Creates the real roles, permissions and grants (the same seed the app uses). Call after `resetDatabase`. */
export async function seedRbac(): Promise<void> {
  await getPrisma().$transaction((tx) => seedDatabase(prismaSeedStore(tx)));
}

export interface TestUserOptions {
  email?: string;
  password?: string;
  roles?: RoleName[];
  isActive?: boolean;
  /** Soft-delete the account. */
  deleted?: boolean;
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
}

let counter = 0;

/** Creates a user with the given roles. Needs `seedRbac()` first if any role is given. */
export async function createUser(options: TestUserOptions = {}): Promise<TestUser> {
  counter += 1;
  const email = options.email ?? `user${counter}@example.com`;
  const password = options.password ?? 'correct-horse-battery-1';
  const prisma = getPrisma();

  const roles = await prisma.role.findMany({
    where: { name: { in: options.roles ?? [] } },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: {
      email,
      // Cost 4 (the minimum) keeps the suite fast; the app's own hashing uses cost 12.
      passwordHash: await hashPassword(password, 4),
      isActive: options.isActive ?? true,
      deletedAt: options.deleted ? new Date() : null,
      roles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
    select: { id: true },
  });
  return { id: user.id, email, password };
}

/**
 * Creates a user whose only role grants exactly the given `resource:action` permissions, so a test can
 * check that a route asks for its own permission and not a neighbouring one. Needs `seedRbac()` first.
 */
export async function createUserWithOnly(...keys: string[]): Promise<TestUser> {
  counter += 1;
  const prisma = getPrisma();
  const permissions = await prisma.permission.findMany({
    where: {
      OR: keys.map((key) => {
        const [resource = '', action = ''] = key.split(':');
        return { resource, action };
      }),
    },
    select: { id: true },
  });
  if (permissions.length !== keys.length)
    throw new Error(`Unknown permission in ${keys.join(', ')}`);
  const role = await prisma.role.create({
    data: {
      name: `only_${counter}`,
      description: `Test role with ${keys.join(', ')}`,
      permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) },
    },
    select: { id: true },
  });
  const user = await createUser();
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  return user;
}
