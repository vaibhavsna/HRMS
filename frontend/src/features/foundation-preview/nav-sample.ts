// SAMPLE DATA for the foundation preview only (S0-9). The real navigation is built in S2-3 from the
// permissions returned by GET /auth/me. The permission names and who holds them come from the Phase 1
// permission reference in docs/03-api-specification.md. Hiding a link is a convenience only: the API
// enforces every permission, and scopes data (self, reports) in the service layer.
import {
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardCheck,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  /** Permission needed to see the link; null means every signed-in user. */
  permission: string | null;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', permission: null, icon: LayoutDashboard },
  { label: 'Employees', permission: 'employee:read', icon: Users },
  { label: 'Departments', permission: 'department:read', icon: Building2 },
  { label: 'Job positions', permission: 'job_position:read', icon: Briefcase },
  { label: 'My leave', permission: 'leave_request:create', icon: CalendarDays },
  { label: 'Approvals', permission: 'leave_request:approve', icon: ClipboardCheck },
  { label: 'Leave types', permission: 'leave_type:update', icon: Settings2 },
  { label: 'Users', permission: 'user:read', icon: UserCog },
  { label: 'Roles', permission: 'role:read', icon: ShieldCheck },
];

export type SampleRole = 'employee' | 'manager' | 'hr_manager' | 'admin';

export const SAMPLE_ROLE_LABELS: Record<SampleRole, string> = {
  employee: 'Employee',
  manager: 'Manager',
  hr_manager: 'HR manager',
  admin: 'Admin',
};

const EMPLOYEE_PERMISSIONS = [
  'department:read',
  'job_position:read',
  'leave_type:read',
  'leave_request:read',
  'leave_request:create',
  'leave_request:update',
  'leave_balance:read',
] as const;

const MANAGER_PERMISSIONS = [
  ...EMPLOYEE_PERMISSIONS,
  'employee:read',
  'leave_request:approve',
] as const;

const HR_PERMISSIONS = [
  ...MANAGER_PERMISSIONS,
  'employee:create',
  'employee:update',
  'employee:delete',
  'department:create',
  'department:update',
  'department:delete',
  'job_position:create',
  'job_position:update',
  'job_position:delete',
  'leave_type:create',
  'leave_type:update',
  'leave_type:delete',
  'leave_balance:adjust',
] as const;

export const SAMPLE_ROLE_PERMISSIONS: Record<SampleRole, readonly string[]> = {
  employee: EMPLOYEE_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  hr_manager: HR_PERMISSIONS,
  admin: [
    ...HR_PERMISSIONS,
    'user:read',
    'user:create',
    'user:update',
    'user:delete',
    'role:read',
    'role:create',
    'role:update',
    'role:delete',
  ],
};

export function visibleNav(permissions: readonly string[]): NavItem[] {
  const held = new Set(permissions);
  return NAV_ITEMS.filter((item) => item.permission === null || held.has(item.permission));
}
