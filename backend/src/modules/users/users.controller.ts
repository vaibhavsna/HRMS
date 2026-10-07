import type { Request, Response } from 'express';
import { pageMeta } from '../../lib/pagination.js';
import { validated } from '../../middleware/validate.js';
import type {
  AssignRolesInput,
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
  UserIdParams,
} from './users.schema.js';
import * as usersService from './users.service.js';

export async function list(_req: Request, res: Response): Promise<void> {
  const { query } = validated<unknown, ListUsersQuery>(res);
  const { items, total } = await usersService.listUsers(query);
  res.json({ data: items, meta: pageMeta(query.page, query.limit, total) });
}

export async function get(_req: Request, res: Response): Promise<void> {
  const { params } = validated<unknown, unknown, UserIdParams>(res);
  res.json({ data: await usersService.getUser(params.id) });
}

export async function create(_req: Request, res: Response): Promise<void> {
  const { body } = validated<CreateUserInput>(res);
  res.status(201).json({ data: await usersService.createUser(body) });
}

export async function update(_req: Request, res: Response): Promise<void> {
  const { body, params } = validated<UpdateUserInput, unknown, UserIdParams>(res);
  res.json({ data: await usersService.updateUser(params.id, body) });
}

export async function remove(_req: Request, res: Response): Promise<void> {
  const { params } = validated<unknown, unknown, UserIdParams>(res);
  await usersService.deleteUser(params.id);
  res.status(204).end();
}

export async function assignRoles(_req: Request, res: Response): Promise<void> {
  const { body, params } = validated<AssignRolesInput, unknown, UserIdParams>(res);
  res.json({ data: await usersService.assignRoles(params.id, body.roleIds) });
}
