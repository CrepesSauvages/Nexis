import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginScreen } from './LoginScreen';

describe('LoginScreen', () => {
  it('devrait proposer un lien vers la connexion Discord', () => {
    render(<LoginScreen />);
    expect(screen.getByRole('link', { name: 'Se connecter avec Discord' })).toHaveAttribute(
      'href',
      '/auth/login',
    );
  });
});
