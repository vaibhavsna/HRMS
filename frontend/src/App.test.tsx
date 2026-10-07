import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the UI foundation preview', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'UI foundation preview' }),
    ).toBeInTheDocument();
  });
});
