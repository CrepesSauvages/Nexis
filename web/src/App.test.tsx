import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('devrait rendre le nom du bot', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Nexis' })).toBeInTheDocument();
  });
});
