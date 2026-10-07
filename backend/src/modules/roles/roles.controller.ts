import type { Request, Response } from 'express';
import { validated } from '../../middleware/validate.js';
import type { CreateRoleInput, RoleIdParams, UpdateRoleInput } from './roles.schema.js';
import * as rolesService from './roles.service.js';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json({ data: await rolesService.listRoles() });
}

export async function create(_req: Request, res: Response): Promise<void> {
  const { body } = validated<CreateRoleInput>(res);
  res.status(201).json({ data: await rolesService.createRole(body) });
}

export async function update(_req: Request, res: Response): Promise<void> {
  const { body, params } = validated<UpdateRoleInput, unknown, RoleIdParams>(res);
  res.json({ data: await rolesService.updateRole(params.id, body) });
}

export async function remove(_req: Request, res: Response): Promise<void> {
  const { params } = validated<unknown, unknown, RoleIdParams>(res);
  await rolesService.deleteRole(params.id);
  res.status(204).end();
}
