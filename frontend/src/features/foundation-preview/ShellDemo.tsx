import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  SAMPLE_ROLE_LABELS,
  SAMPLE_ROLE_PERMISSIONS,
  visibleNav,
  type SampleRole,
} from './nav-sample';

const ROLES = Object.keys(SAMPLE_ROLE_LABELS) as SampleRole[];

/** Static wireframe of the app shell: sidebar, top bar and content, with role-based navigation. */
export function ShellDemo() {
  const [role, setRole] = useState<SampleRole>('employee');
  const items = visibleNav(SAMPLE_ROLE_PERMISSIONS[role]);

  return (
    <div className="grid grid-cols-1 gap-3">
      <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm font-medium">
          Preview the navigation as (sample data)
        </legend>
        {ROLES.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={key === role ? 'default' : 'outline'}
            aria-pressed={key === role}
            onClick={() => setRole(key)}
          >
            {SAMPLE_ROLE_LABELS[key]}
          </Button>
        ))}
      </fieldset>

      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        <div className="flex flex-col md:flex-row">
          <aside className="border-b bg-sidebar p-3 text-sidebar-foreground md:w-(--sidebar-width) md:shrink-0 md:border-r md:border-b-0">
            <p className="px-2 pb-2 text-sm font-semibold">HRMS Platform</p>
            <nav aria-label="Main navigation (sample)">
              <ul className="grid gap-1">
                {items.map((item, index) => (
                  <li key={item.label}>
                    <a
                      href="#shell-sample"
                      aria-current={index === 0 ? 'page' : undefined}
                      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground pointer-coarse:min-h-11"
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <div id="shell-sample" className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-(--topbar-height) items-center justify-between gap-3 border-b px-4">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation (sample)"
                >
                  <Menu aria-hidden="true" />
                </Button>
                <p className="truncate text-sm font-medium">Dashboard</p>
              </div>
              <p className="shrink-0 text-sm text-muted-foreground">{SAMPLE_ROLE_LABELS[role]}</p>
            </header>
            <div className="p-4 text-sm text-muted-foreground">
              Page content goes here. On phones the sidebar becomes an off-canvas menu opened from
              the button in the top bar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
