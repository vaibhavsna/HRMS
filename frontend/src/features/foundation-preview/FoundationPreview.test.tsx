import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FoundationPreview } from './FoundationPreview';

function navLabels() {
  const nav = screen.getByRole('navigation', { name: /main navigation/i });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent);
}

describe('FoundationPreview', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    });
  });

  it('switches the theme from the top bar', async () => {
    const user = userEvent.setup();
    render(<FoundationPreview />);
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('changes the navigation with the sample role', async () => {
    const user = userEvent.setup();
    render(<FoundationPreview />);
    expect(navLabels()).not.toContain('Users');

    await user.click(screen.getByRole('button', { name: 'Admin' }));
    expect(screen.getByRole('button', { name: 'Admin' })).toHaveAttribute('aria-pressed', 'true');
    expect(navLabels()).toContain('Users');
  });

  describe('data table states', () => {
    const tableBusy = () => screen.getByRole('table').closest('[aria-busy]');

    it('starts ready, with rows and written-out statuses', () => {
      render(<FoundationPreview />);
      expect(screen.getByRole('status')).toHaveTextContent('4 employees');
      expect(tableBusy()).toHaveAttribute('aria-busy', 'false');
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    });

    it('shows skeleton rows and marks the table busy on first load', async () => {
      const user = userEvent.setup();
      render(<FoundationPreview />);
      await user.click(screen.getByRole('button', { name: 'First load' }));
      expect(screen.getByRole('status')).toHaveTextContent('Loading employees…');
      expect(tableBusy()).toHaveAttribute('aria-busy', 'true');
      expect(screen.queryByText('Sample Employee One')).not.toBeInTheDocument();
    });

    it('keeps the previous rows visible while refetching', async () => {
      const user = userEvent.setup();
      render(<FoundationPreview />);
      await user.click(screen.getByRole('button', { name: 'Refetching' }));
      expect(tableBusy()).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Sample Employee One')).toBeInTheDocument();
    });

    it('tells "no data yet" apart from "no results for this filter"', async () => {
      const user = userEvent.setup();
      render(<FoundationPreview />);

      await user.click(screen.getByRole('button', { name: 'Empty: no data yet' }));
      expect(screen.getByText('Add the first employee to get started.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add employee' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Empty: filter has no results' }));
      expect(screen.getByText('Try a different department or status.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    });

    it('shows an error with a way to retry', async () => {
      const user = userEvent.setup();
      render(<FoundationPreview />);
      await user.click(screen.getByRole('button', { name: 'Error' }));
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load employees');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });
  });

  describe('form states', () => {
    it('shows a server field error on the email field', async () => {
      const user = userEvent.setup();
      render(<FoundationPreview />);
      await user.click(screen.getByRole('button', { name: 'Server field error' }));
      expect(screen.getByLabelText(/Work email/)).toBeInvalid();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Another employee already uses this email.',
      );
    });

    it('disables the form and shows progress while submitting', async () => {
      const user = userEvent.setup();
      render(<FoundationPreview />);
      await user.click(screen.getByRole('button', { name: 'Submitting' }));
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(screen.getByLabelText(/Work email/)).toBeDisabled();
    });
  });
});
