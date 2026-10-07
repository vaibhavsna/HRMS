import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormDemo } from './FormDemo';
import { ShellDemo } from './ShellDemo';
import { TableStatesDemo } from './TableStatesDemo';
import { TokenSwatches } from './TokenSwatches';
import { TypeScale } from './TypeScale';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-4">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Temporary page for approving the UI foundation (S0-9). It uses only the tokens and shadcn components
 * and holds sample data. S2-3 replaces it with the real app shell; delete this folder then.
 */
export function FoundationPreview() {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">HRMS Platform · ticket S0-9</p>
            <h1 className="text-xl font-semibold sm:text-2xl">UI foundation preview</h1>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-4 py-6 sm:px-6">
        <p className="max-w-prose text-sm text-muted-foreground">
          Sample content for approving the design tokens and shared patterns. Nothing here is a real
          screen. Switch the theme with the button in the top right, and resize the window down to
          320 px to check small screens.
        </p>

        <Section id="shell" title="App shell">
          <ShellDemo />
        </Section>

        <Section id="tokens" title="Colour tokens">
          <TokenSwatches />
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="success">Approved</Badge>
            <Badge variant="warning">Pending</Badge>
            <Badge variant="destructive">Rejected</Badge>
            <Badge variant="secondary">Cancelled</Badge>
            <Badge variant="info">Info</Badge>
            <span className="text-xs text-muted-foreground">
              Status is always written out, never colour alone.
            </span>
          </div>
        </Section>

        <Section id="type" title="Typography">
          <TypeScale />
        </Section>

        <Section id="buttons" title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section id="form" title="Form pattern">
          <FormDemo />
        </Section>

        <Section id="table" title="Data table pattern">
          <TableStatesDemo />
        </Section>
      </main>
    </div>
  );
}
