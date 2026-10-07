import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type FormState = 'idle' | 'error' | 'submitting';

const STATES: { key: FormState; label: string }[] = [
  { key: 'idle', label: 'Ready' },
  { key: 'error', label: 'Server field error' },
  { key: 'submitting', label: 'Submitting' },
];

/** Form pattern: visible labels, hints, per-field server errors, and a submit button that shows progress. */
export function FormDemo() {
  const [state, setState] = useState<FormState>('idle');
  const submitting = state === 'submitting';

  return (
    <div className="grid grid-cols-1 gap-4">
      <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm font-medium">Show the form as</legend>
        {STATES.map(({ key, label }) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={key === state ? 'default' : 'outline'}
            aria-pressed={key === state}
            onClick={() => setState(key)}
          >
            {label}
          </Button>
        ))}
      </fieldset>

      <form
        noValidate
        aria-busy={submitting}
        onSubmit={(event) => event.preventDefault()}
        className="grid max-w-md grid-cols-1 gap-4"
      >
        <FormField
          label="Work email"
          required
          hint="Used to sign in."
          error={state === 'error' ? 'Another employee already uses this email.' : undefined}
        >
          {(control) => (
            <Input
              {...control}
              type="email"
              defaultValue="sample@example.com"
              disabled={submitting}
            />
          )}
        </FormField>
        <FormField label="Employee code" hint="Letters and numbers, for example EMP-1042.">
          {(control) => <Input {...control} defaultValue="EMP-1042" disabled={submitting} />}
        </FormField>
        <p className="text-xs text-muted-foreground">
          <span aria-hidden="true">* </span>Required field
        </p>
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Saving…' : 'Save employee'}
          </Button>
        </div>
      </form>
    </div>
  );
}
