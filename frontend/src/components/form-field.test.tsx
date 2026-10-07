import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from './form-field';
import { Input } from './ui/input';

describe('FormField', () => {
  it('connects the visible label to the control', () => {
    render(<FormField label="Work email">{(control) => <Input {...control} />}</FormField>);
    expect(screen.getByLabelText('Work email')).toBeInTheDocument();
  });

  it('marks required controls without relying on the asterisk', () => {
    render(
      <FormField label="Work email" required>
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(screen.getByLabelText(/Work email/)).toBeRequired();
  });

  it('links the hint to the control', () => {
    render(
      <FormField label="Employee code" hint="Letters and numbers.">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(screen.getByLabelText('Employee code')).toHaveAccessibleDescription(
      'Letters and numbers.',
    );
  });

  it('flags an error as invalid, announces it and includes it in the description', () => {
    render(
      <FormField
        label="Work email"
        hint="Used to sign in."
        error="Another employee already uses this email."
      >
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Work email');
    expect(input).toBeInvalid();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Another employee already uses this email.',
    );
    expect(input).toHaveAccessibleDescription(
      'Used to sign in. Another employee already uses this email.',
    );
  });

  it('adds no description or invalid state when there is no hint or error', () => {
    render(<FormField label="Name">{(control) => <Input {...control} />}</FormField>);
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).toBeValid();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
